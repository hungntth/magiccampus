// Sign-in actions (Go dailysignin service): the legacy 5-day panel (getSignInData / signinNow) and the monthly calendar
// (doSignin, retroactive, crit upgrade, lucky claim). One ledger per month; each action runs under the character lock.
// Order is always: check -> spend -> mark the day (atomic) -> credit. Rewards without contents data are level-scaled exp + bound
// silver (shared REWARD_K); the legacy cards also grant the items their Flash text names.

import { Injectable } from '@nestjs/common';
import {
  DAILY_SIGNIN_CONF, scaledReward, vnDate, type DailySignInDoReply, type DailySignInInit, type ScaledRewardId, type SignInData,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { ItemGrantService } from '../activity-rewards/item-grant.service';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { ActivityDataService } from '../activity/activity-data.service';
import { withCharLock } from '../inventory/char-lock';
import { cardItems } from './signin-cards';
import { SigninLedger } from './signin-ledger.service';
import {
  allSignedThrough, calendarRewards, dayBit, firstUnsignedBefore, isSigned, legacyCard, legacyState, luckyClaimTier, rollCrit,
} from './signin-rules';

const ALREADY = 'Hôm nay bạn đã báo danh rồi';

@Injectable()
export class SigninService {
  now = (): number => Date.now();
  rng: () => number = Math.random;

  constructor(
    private readonly ledger: SigninLedger,
    private readonly rewards: RewardGrantService,
    private readonly items: ItemGrantService,
    private readonly data: ActivityDataService,
  ) {}

  // --- legacy 5-day panel ---

  async legacyData(characterId: number): Promise<SignInData> {
    const v = vnDate(this.now());
    return legacyState(v.day, (await this.ledger.read(characterId, v.year, v.month)).claimedDays, await this.ledger.previous(characterId, v));
  }

  /** signinNow: signs today on the shared ledger and pays the card of the streak position; an already signed day just returns the state. */
  signinNow(session: Session): Promise<SignInData> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.ledger.levelGate(cid, DAILY_SIGNIN_CONF.legacyLevelGate);
      const v = vnDate(this.now());
      const cur = (await this.ledger.read(cid, v.year, v.month)).claimedDays;
      const prev = await this.ledger.previous(cid, v);
      if (isSigned(cur, v.day)) return legacyState(v.day, cur, prev);
      const card = legacyCard(v.day, cur, prev);
      const named = await this.items.resolve(cardItems(card));
      if (!(await this.items.fits(cid, named.items))) throw RpcException.forbidden('Túi đồ đã đầy, hãy dọn chỗ trống rồi báo danh');
      if (!(await this.ledger.markDay(cid, v, v.day))) return this.legacyData(cid);
      await this.pay(session, [`signin${card}` as ScaledRewardId]);
      await this.items.grant(session, named.items);
      session.callback('onBlueMsg', 'Báo danh thành công!');
      return legacyState(v.day, cur | dayBit(v.day), prev);
    });
  }

  // --- monthly calendar ---

  init(session: Session): Promise<DailySignInInit> {
    return this.ledger.init(session.characterId!, this.now());
  }

  async consumeLimit(session: Session): Promise<void> {
    const v = vnDate(this.now());
    session.callback('oninitDailySignInActConsumeLimit', (await this.ledger.read(session.characterId!, v.year, v.month)).consumeTotal);
  }

  doSignin(session: Session): Promise<DailySignInDoReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.ledger.levelGate(cid, DAILY_SIGNIN_CONF.levelGate);
      const v = vnDate(this.now());
      const l = await this.ledger.read(cid, v.year, v.month);
      if (isSigned(l.claimedDays, v.day)) throw RpcException.forbidden(ALREADY);
      const roll = rollCrit(l.critPercent, this.rng);
      if (!(await this.ledger.markDay(cid, v, v.day, { critPercent: roll.crit }))) throw RpcException.forbidden(ALREADY);
      const bitmap = l.claimedDays | dayBit(v.day);
      await this.pay(session, calendarRewards(v.weekday, allSignedThrough(bitmap, v.day), roll.hit));
      const data = await this.ledger.wireData(cid, v, { ...l, claimedDays: bitmap, critPercent: roll.crit });
      session.callback('setBtnsDailySignInAct', data);
      return { data, date: v.day };
    });
  }

  /** Retroactive sign of the first missed day: 50 gold, +5 crit and a crit roll, daily (and crit) reward, no surprise. */
  retroactive(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.ledger.levelGate(cid, DAILY_SIGNIN_CONF.levelGate);
      const v = vnDate(this.now());
      const l = await this.ledger.read(cid, v.year, v.month);
      const target = firstUnsignedBefore(l.claimedDays, v.day);
      if (target === null) throw RpcException.forbidden('Các ngày trước đều đã báo danh');
      if (!(await this.ledger.spendGold(session, DAILY_SIGNIN_CONF.retroactivePrice))) throw RpcException.forbidden('Không đủ vàng để ký bù');
      const roll = rollCrit(l.critPercent, this.rng);
      const price = DAILY_SIGNIN_CONF.retroactivePrice;
      if (!(await this.ledger.markDay(cid, v, target, { critPercent: roll.crit }, { consumeTotal: price }))) return null;
      await this.pay(session, calendarRewards(v.weekday, false, roll.hit, false));
      const bitmap = l.claimedDays | dayBit(target);
      const data = await this.ledger.wireData(cid, v, { ...l, claimedDays: bitmap, critPercent: roll.crit, consumeTotal: l.consumeTotal + price });
      session.callback('setBtnsDailySignInAct', data);
      session.callback('onDailySignInActDoSignin', { data, date: target } satisfies DailySignInDoReply);
      return null;
    });
  }

  /** dailySignInUpActCrit: 100 gold for +5 crit (refused at 100). */
  upCrit(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.ledger.levelGate(cid, DAILY_SIGNIN_CONF.levelGate);
      const v = vnDate(this.now());
      const l = await this.ledger.read(cid, v.year, v.month);
      if (l.critPercent >= 100) throw RpcException.forbidden('Tỉ lệ Bạo kích đạt 100%');
      if (!(await this.ledger.spendGold(session, DAILY_SIGNIN_CONF.critPrice))) throw RpcException.forbidden('Không đủ vàng');
      const crit = Math.min(100, l.critPercent + DAILY_SIGNIN_CONF.critStep);
      await this.ledger.patch(cid, v, { critPercent: crit }, { consumeTotal: DAILY_SIGNIN_CONF.critPrice });
      session.callback('updateDailySignInActCrit', crit);
      session.callback('oninitDailySignInActConsumeLimit', l.consumeTotal + DAILY_SIGNIN_CONF.critPrice);
      return null;
    });
  }

  /** dailySignInActGetAward: the Thursday lucky claim (regular gold by tier); returns 1. */
  getAward(session: Session): Promise<number> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.ledger.levelGate(cid, DAILY_SIGNIN_CONF.levelGate);
      const v = vnDate(this.now());
      const l = await this.ledger.read(cid, v.year, v.month);
      const tier = luckyClaimTier({
        weekday: v.weekday, today: v.day, bitmap: l.claimedDays, consumeTotal: l.consumeTotal, claimed: l.luckyClaimed,
        tiers: await this.data.luckyTiers(v.year, v.month),
      });
      if (!tier) throw RpcException.forbidden('Chưa đủ điều kiện nhận thưởng may mắn');
      await this.ledger.patch(cid, v, { luckyClaimed: true });
      await this.ledger.creditGold(session, tier.goldAmount);
      session.callback('setBtnsDailySignInAct', await this.ledger.wireData(cid, v, { ...l, luckyClaimed: true }));
      return 1;
    });
  }

  /** Sums the level-scaled rewards and credits them in one grant. */
  private async pay(session: Session, ids: readonly ScaledRewardId[]): Promise<void> {
    const level = await this.rewards.levelOf(session.characterId!);
    let exp = 0;
    let silver = 0;
    for (const id of ids) {
      const r = scaledReward(id, level);
      exp += r.exp;
      silver += r.silver;
    }
    await this.rewards.grantExpSilver(session, exp, silver);
  }
}
