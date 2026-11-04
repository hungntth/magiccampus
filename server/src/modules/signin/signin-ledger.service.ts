// Sign-in ledger access: month documents (read with defaults, atomic day marking), the wire payloads (DailySignInData / Init)
// and the gold payment (bound first, conditional $inc). The actions with rewards live in SigninService.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  DAILY_SIGNIN_CONF, daysInMonth, startOfMonthMs, vnDate, type DailySignInData, type DailySignInInit, type VnDate,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { ActivityDataService } from '../activity/activity-data.service';
import { CharacterSignin } from './signin.schema';
import { dayBit, luckyAwardDay, signedMap, splitGold, type MonthBits } from './signin-rules';

export interface Ledger {
  claimedDays: number;
  critPercent: number;
  luckyClaimed: boolean;
  consumeTotal: number;
}

const EMPTY: Ledger = { claimedDays: 0, critPercent: 0, luckyClaimed: false, consumeTotal: 0 };

@Injectable()
export class SigninLedger {
  constructor(
    @InjectModel(CharacterSignin.name) private readonly months: Model<CharacterSignin>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly data: ActivityDataService,
  ) {}

  async read(characterId: number, year: number, month: number): Promise<Ledger> {
    const doc = await this.months.findOne({ characterId, year, month }).lean();
    return doc ? { claimedDays: doc.claimedDays ?? 0, critPercent: doc.critPercent ?? 0, luckyClaimed: doc.luckyClaimed === true, consumeTotal: doc.consumeTotal ?? 0 } : { ...EMPTY };
  }

  /** The previous month's bits (streaks cross the boundary); null when there is none. */
  async previous(characterId: number, v: VnDate): Promise<MonthBits | null> {
    const year = v.month === 1 ? v.year - 1 : v.year;
    const month = v.month === 1 ? 12 : v.month - 1;
    const doc = await this.months.findOne({ characterId, year, month }, { claimedDays: 1 }).lean();
    return doc ? { bitmap: doc.claimedDays ?? 0, days: daysInMonth(year, month) } : null;
  }

  async ensure(characterId: number, v: VnDate): Promise<void> {
    await this.months.updateOne({ characterId: characterId, year: v.year, month: v.month }, { $setOnInsert: { ...EMPTY } }, { upsert: true }).catch((e: unknown) => {
      if ((e as { code?: number }).code !== 11000) throw e; // a concurrent first write created it
    });
  }

  /** Marks `day` signed only if its bit is still clear (atomic); `set` / `inc` ride in the same update. */
  async markDay(characterId: number, v: VnDate, day: number, set: Record<string, unknown> = {}, inc: Record<string, number> = {}): Promise<boolean> {
    await this.ensure(characterId, v);
    const update: Record<string, unknown> = { $bit: { claimedDays: { or: dayBit(day) } } };
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(inc).length > 0) update.$inc = inc;
    const r = await this.months.updateOne({ characterId, year: v.year, month: v.month, claimedDays: { $bitsAllClear: dayBit(day) } }, update);
    return r.modifiedCount === 1;
  }

  async patch(characterId: number, v: VnDate, set: Record<string, unknown>, inc: Record<string, number> = {}): Promise<void> {
    await this.ensure(characterId, v);
    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(inc).length > 0) update.$inc = inc;
    await this.months.updateOne({ characterId, year: v.year, month: v.month }, update);
  }

  async wireData(characterId: number, v: VnDate, l: Ledger): Promise<DailySignInData> {
    const day = luckyAwardDay({
      weekday: v.weekday, today: v.day, bitmap: l.claimedDays, consumeTotal: l.consumeTotal, claimed: l.luckyClaimed,
      tiers: await this.data.luckyTiers(v.year, v.month),
    });
    return {
      actYear: v.year, actMonth: v.month, actDays: signedMap(l.claimedDays, daysInMonth(v.year, v.month)),
      crit: l.critPercent, getAwardTime: { day, flag: l.luckyClaimed },
    };
  }

  async init(characterId: number, nowMs: number): Promise<DailySignInInit> {
    const v = vnDate(nowMs);
    const l = await this.read(characterId, v.year, v.month);
    const tiers = await this.data.luckyTiers(v.year, v.month);
    const luckyPoint = [0, 0, 0, 0, 0, 0, 0];
    const luckyGold = [0, 0, 0, 0, 0, 0, 0];
    for (const t of tiers) {
      luckyPoint[t.weekIndex] = t.pointThreshold;
      luckyGold[t.weekIndex] = t.goldAmount;
    }
    return {
      time: { year: v.year, month: v.month, date: v.day },
      conf: {
        start: startOfMonthMs(nowMs), luckyDay: DAILY_SIGNIN_CONF.luckyDay, surpriseDay: DAILY_SIGNIN_CONF.surpriseDay,
        luckyPoint, luckyGold, retroactivePrice: DAILY_SIGNIN_CONF.retroactivePrice, critPrice: DAILY_SIGNIN_CONF.critPrice,
        closeOnKey: 1, iInfo: [],
      },
      data: await this.wireData(characterId, v, l),
    };
  }

  async levelGate(characterId: number, gate: number): Promise<void> {
    const doc = await this.chars.findById(characterId, { level: 1 }).lean();
    if ((doc?.level ?? 1) < gate) throw RpcException.forbidden(`Cần đạt cấp ${gate} trở lên để báo danh.`);
  }

  /** Pays `cost` gold (bound first) with a conditional $inc and pushes the new balances; false when the wallet is short. */
  async spendGold(session: Session, cost: number): Promise<boolean> {
    const cid = session.characterId!;
    for (let attempt = 0; attempt < 3; attempt++) {
      const doc = await this.chars.findById(cid, { gold: 1, goldBind: 1 }).lean();
      const split = splitGold(doc?.goldBind ?? 0, doc?.gold ?? 0, cost);
      if (!split) return false;
      const saved = await this.chars.findOneAndUpdate(
        { _id: cid, goldBind: { $gte: split.bind }, gold: { $gte: split.gold } },
        { $inc: { goldBind: -split.bind, gold: -split.gold } },
        { new: true, projection: { gold: 1, goldBind: 1 } },
      ).lean();
      if (saved) {
        session.callback('onUPP', { gold: saved.gold, goldBind: saved.goldBind });
        return true;
      }
    }
    return false;
  }

  /** Credits regular (unbound) gold, as the Go lucky-day claim did. */
  async creditGold(session: Session, amount: number): Promise<void> {
    const cid = session.characterId!;
    const saved = await this.chars.findByIdAndUpdate(cid, { $inc: { gold: amount } }, { new: true, projection: { gold: 1 } }).lean();
    if (!saved) return;
    session.callback('onAddMoney', cid, 'gold', amount, saved.gold);
    session.callback('onUPP', { gold: saved.gold });
  }
}
