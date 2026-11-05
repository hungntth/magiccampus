// Khóa Học Đặc Huấn service (Go application/txkc service.go): panel payload, opening the daily tasks, the advanced course (680 gold),
// bought exp (300 gold per level, advanced only), the level awards (whole list bag-checked, saved, then granted bound) and task exp
// claims. Task progress comes from the character_daily diary counts (today / since Monday). Gold is taken first and refunded when
// the state write fails; awards are recorded before they are granted (a failed grant loses an award, never repeats one).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  TXKC, TXKC_ADVAN_AWARDS, TXKC_DAILY_TASKS, TXKC_FREE_AWARDS, TXKC_TEXT, TXKC_WEEKLY_TASKS, txkcLevel, txkcMergeAwards, type TxkcData, type TxkcItemInfo,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterDaily } from '../activity/daily.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import type { TxkcDoc } from './training-doc';
import { refuse } from './training-refusal';
import { TrainingStateService } from './training-state.service';
import { TrainingSupport } from './training-support.service';
import { addTxkcExp, buildTxkcData, NO_COUNTS, rollTxkc, taskDef, taskDone, txkcPeriod, type TxkcCounts } from './txkc-rules';

@Injectable()
export class TxkcService {
  private readonly logger = new Logger(TxkcService.name);
  /** Random pick 0..n-1, replaceable in tests. */
  rand: (n: number) => number = (n) => Math.floor(Math.random() * n);

  constructor(
    @InjectModel(CharacterDaily.name) private readonly days: Model<CharacterDaily>,
    private readonly state: TrainingStateService,
    private readonly support: TrainingSupport,
    private readonly grants: GrantService,
    private readonly gameData: GameDataService,
  ) {}

  /** Diary counts of the days from `fromDay` (inclusive, UTC+7 day key) up to today. */
  async counts(characterId: number, fromDay: string): Promise<TxkcCounts> {
    const rows = await this.days.find({ characterId, day: { $gte: fromDay } }, { tasks: 1, vitality: 1 }).lean();
    const tasks: Record<string, number> = {};
    let vitality = 0;
    for (const r of rows) {
      for (const [id, n] of Object.entries(r.tasks ?? {})) tasks[id] = (tasks[id] ?? 0) + n;
      vitality += r.vitality ?? 0;
    }
    return { tasks, vitality };
  }

  private itemCache: Promise<TxkcItemInfo> | null = null;

  /** Name + icon of every award template (static, cached): the panel has no item table of its own. */
  items(): Promise<TxkcItemInfo> {
    this.itemCache ??= this.loadItems();
    return this.itemCache;
  }

  private async loadItems(): Promise<TxkcItemInfo> {
    const ids = [...new Set([...TXKC_FREE_AWARDS, ...TXKC_ADVAN_AWARDS].map((a) => a[0]))];
    const found = await this.gameData.templatesByIds(29, ids);
    const equips = await this.gameData.templatesByIds(19, ids.filter((id) => !found.has(id)));
    const out: TxkcItemInfo = {};
    for (const id of ids) {
      const row = found.get(id) ?? equips.get(id);
      out[String(id)] = { name: String(row?.name ?? `#${id}`), iconCode: row?.icon_code ? String(row.icon_code) : '0' };
    }
    return out;
  }

  async panel(characterId: number): Promise<TxkcData> {
    const p = txkcPeriod(this.state.now());
    const s = rollTxkc((await this.state.peek(characterId)).txkc, p);
    const [today, week] = await Promise.all([s.dopen === 1 ? this.counts(characterId, p.day) : NO_COUNTS, this.counts(characterId, p.week)]);
    return buildTxkcData(s, p, today, week);
  }

  /** Rolled state write: `fn` edits the rolled copy and returns false to refuse (nothing saved). */
  private async write(characterId: number, fn: (s: TxkcDoc) => boolean): Promise<boolean> {
    const p = txkcPeriod(this.state.now());
    return (await this.state.mutate(characterId, (st) => {
      const s = rollTxkc(st.txkc, p);
      st.txkc = s;
      return fn(s);
    })) !== null;
  }

  private async view(characterId: number): Promise<TxkcDoc> {
    return rollTxkc((await this.state.peek(characterId)).txkc, txkcPeriod(this.state.now()));
  }

  openDaily(characterId: number): Promise<void> {
    return this.state.locked(characterId, async () => {
      let open = false;
      const ok = await this.write(characterId, (s) => {
        open = s.dopen === 1;
        if (open) return false;
        s.dopen = 1;
        s.sp = TXKC_DAILY_TASKS[this.rand(TXKC_DAILY_TASKS.length)].id;
        return true;
      });
      if (open) throw refuse(TXKC_TEXT.DAILY_OPEN);
      if (!ok) throw refuse(TXKC_TEXT.BUSY);
    });
  }

  openAdvance(session: Session): Promise<void> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      if ((await this.view(cid)).adv === 1) throw refuse(TXKC_TEXT.ADVANCE_OWNED);
      if ((await this.support.spendGold(session, TXKC.ADVANCE_GOLD)) === null) throw refuse(TXKC_TEXT.NO_GOLD);
      const ok = await this.write(cid, (s) => {
        if (s.adv === 1) return false;
        s.adv = 1;
        return true;
      });
      if (!ok) {
        await this.support.refundGold(session, TXKC.ADVANCE_GOLD);
        throw refuse(TXKC_TEXT.BUSY);
      }
    });
  }

  /** Buys `levels` levels of exp (clamped to the cap); returns the exp bought. */
  buyExp(session: Session, levels: number): Promise<number> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      if (!Number.isInteger(levels) || levels <= 0 || levels > TXKC.MAX_LEVEL) throw refuse(TXKC_TEXT.BUSY);
      const s = await this.view(cid);
      if (s.adv !== 1) throw refuse(TXKC_TEXT.ADVANCE_NEED);
      const room = TXKC.MAX_LEVEL * TXKC.LEVEL_EXP - s.exp;
      if (room <= 0) throw refuse(TXKC_TEXT.MAX_LEVEL);
      const n = Math.min(levels, Math.ceil(room / TXKC.LEVEL_EXP));
      const cost = n * TXKC.EXP_GOLD;
      if ((await this.support.spendGold(session, cost)) === null) throw refuse(TXKC_TEXT.NO_GOLD);
      const ok = await this.write(cid, (st) => {
        addTxkcExp(st, n * TXKC.LEVEL_EXP);
        return true;
      });
      if (!ok) {
        await this.support.refundGold(session, cost);
        throw refuse(TXKC_TEXT.BUSY);
      }
      return n * TXKC.LEVEL_EXP;
    });
  }

  /** takeTXKCFreeAward / takeTXKCAdvanAward: every unclaimed level up to the current one. Returns the number of reward entries. */
  claimAwards(session: Session, advanced: boolean): Promise<number> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      const s = await this.view(cid);
      if (advanced && s.adv !== 1) throw refuse(TXKC_TEXT.ADVANCE_NEED);
      const from = advanced ? s.awd2 : s.awd1;
      const level = txkcLevel(s.exp);
      if (level <= from) throw refuse(TXKC_TEXT.NOTHING);
      const merged = txkcMergeAwards(advanced ? TXKC_ADVAN_AWARDS : TXKC_FREE_AWARDS, from, level);
      const grants: Grant[] = await Promise.all(merged.map((m) => this.itemGrant(m.templateId, m.qty)));
      if (!(await this.grants.fits(cid, grants))) throw refuse(TXKC_TEXT.BAG_FULL);
      const ok = await this.write(cid, (st) => {
        if ((advanced ? st.awd2 : st.awd1) !== from) return false; // another claim landed first
        if (advanced) st.awd2 = level;
        else st.awd1 = level;
        return true;
      });
      if (!ok) throw refuse(TXKC_TEXT.BUSY);
      if (!(await this.grants.grant(session, grants))) this.logger.error(`txkc award grant for ${cid} (advanced ${advanced}) was incomplete`);
      return merged.length;
    });
  }

  /** TXKCGetProgressEXP(kind, id): a finished, unclaimed task gives 120 / 150 (special) / 280 course exp. Returns the exp. */
  claimProgress(characterId: number, kind: number, taskId: number): Promise<number> {
    return this.state.locked(characterId, async () => {
      const p = txkcPeriod(this.state.now());
      const s = await this.view(characterId);
      const daily = kind === TXKC.KIND_DAILY;
      if (!daily && kind !== TXKC.KIND_WEEKLY) throw refuse(TXKC_TEXT.BUSY);
      if (daily && s.dopen !== 1) throw refuse(TXKC_TEXT.DAILY_CLOSED);
      const def = taskDef(daily ? TXKC_DAILY_TASKS : TXKC_WEEKLY_TASKS, taskId);
      if (!def) throw refuse(TXKC_TEXT.BUSY);
      if ((daily ? s.dc : s.wc)[String(taskId)] === 1) throw refuse(TXKC_TEXT.TASK_CLAIMED);
      if (!taskDone(await this.counts(characterId, daily ? p.day : p.week), def)) throw refuse(TXKC_TEXT.TASK_NOT_DONE);
      const gain = daily ? (taskId === s.sp ? TXKC.DAILY_SPECIAL_EXP : TXKC.DAILY_EXP) : TXKC.WEEKLY_EXP;
      const ok = await this.write(characterId, (st) => {
        const claimed = daily ? st.dc : st.wc;
        if (claimed[String(taskId)] === 1) return false;
        claimed[String(taskId)] = 1;
        addTxkcExp(st, gain);
        return true;
      });
      if (!ok) throw refuse(TXKC_TEXT.BUSY);
      return gain;
    });
  }

  /** A bound item grant: item table 29, else equipment table 19 (the id spaces overlap for a few templates; items win, as Go). */
  private async itemGrant(templateId: number, qty: number): Promise<Grant> {
    const isItem = (await this.gameData.template(29, templateId)) !== undefined;
    return { kind: 'item', table: isItem ? 29 : 19, templateId, qty, bound: true };
  }
}
