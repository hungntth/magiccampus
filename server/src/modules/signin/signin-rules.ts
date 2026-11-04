// Pure sign-in rules (Go dailysignin service.go + record.go): month bitmap ledger, streaks (legacy 5-day panel), the crit meter,
// surprise (Saturday) and lucky (Thursday) day gates, retroactive picks and the gold split (bound first). No Mongo, no clock.

import { DAILY_SIGNIN_CONF, weekOfMonth, type ScaledRewardId, type SignInData } from '@mc/shared';

/** Bit of a day (1..31) in the month bitmap; 31 bits fit a positive int32 so Mongo $bit and $bitsAllClear work. */
export const dayBit = (day: number): number => 1 << (day - 1);

export const isSigned = (bitmap: number, day: number): boolean => (bitmap & dayBit(day)) !== 0;

/** `{ "3": true }` map of the signed days for the wire. */
export function signedMap(bitmap: number, days: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (let d = 1; d <= days; d++) if (isSigned(bitmap, d)) out[String(d)] = true;
  return out;
}

/** Every day 1..`day` is signed (Go IsStreakComplete from the event start, which is the first of the month). */
export function allSignedThrough(bitmap: number, day: number): boolean {
  for (let d = 1; d <= day; d++) if (!isSigned(bitmap, d)) return false;
  return true;
}

/** The first unsigned day before `today` (the retroactive target), or null. */
export function firstUnsignedBefore(bitmap: number, today: number): number | null {
  for (let d = 1; d < today; d++) if (!isSigned(bitmap, d)) return d;
  return null;
}

export interface MonthBits {
  bitmap: number;
  days: number;
}

/**
 * Consecutive signed days ending at `day` of the current month (0 when `day` is unsigned). `day` 0 means the last day of the
 * previous month; a run reaching day 1 continues into the previous month's bitmap.
 */
export function runEndingAt(cur: number, prev: MonthBits | null, day: number): number {
  let n = 0;
  let inCur = day >= 1;
  let bits = inCur ? cur : (prev?.bitmap ?? 0);
  let d = inCur ? day : (prev?.days ?? 0);
  for (;;) {
    while (d >= 1 && isSigned(bits, d)) {
      n++;
      d--;
    }
    if (d === 0 && inCur && prev) {
      inCur = false;
      bits = prev.bitmap;
      d = prev.days;
      continue;
    }
    return n;
  }
}

/** 1..5 cycle of the legacy panel: ((s-1) % 5) + 1, 0 stays 0. */
export const wrap5 = (streak: number): number => (streak <= 0 ? 0 : ((streak - 1) % 5) + 1);

/** getSignInData reply for `today` (day of month). */
export function legacyState(today: number, cur: number, prev: MonthBits | null): SignInData {
  const signinedToday = isSigned(cur, today);
  const yesterday = runEndingAt(cur, prev, today - 1);
  return {
    signinedToday,
    signedYesterday: yesterday > 0,
    continueSigninTime: wrap5(signinedToday ? runEndingAt(cur, prev, today) : yesterday),
  };
}

/** Card (1..5) a sign-in made today pays: the cycle position of the streak that includes today. */
export function legacyCard(today: number, cur: number, prev: MonthBits | null): number {
  return wrap5(runEndingAt(cur, prev, today - 1) + 1);
}

export interface CritRoll {
  hit: boolean;
  crit: number;
}

/** +5 before the roll (clamped to 100), then `rng() * 100 < crit`; a hit resets the meter to 0 (Go DoSignin). */
export function rollCrit(crit: number, rng: () => number): CritRoll {
  const next = Math.min(100, crit + DAILY_SIGNIN_CONF.critStep);
  const hit = rng() * 100 < next;
  return { hit, crit: hit ? 0 : next };
}

/** Reward pools of a calendar sign-in in Go's order: daily, surprise (Saturday + complete streak), crit (on a hit). */
export function calendarRewards(weekday: number, streakComplete: boolean, hit: boolean, includeSurprise = true): ScaledRewardId[] {
  const out: ScaledRewardId[] = ['calDaily'];
  if (includeSurprise && weekday === DAILY_SIGNIN_CONF.surpriseDay && streakComplete) out.push('calSurprise');
  if (hit) out.push('calCrit');
  return out;
}

export interface LuckyTierLite {
  weekIndex: number;
  pointThreshold: number;
  goldAmount: number;
}

export interface LuckyInput {
  weekday: number;
  today: number;
  bitmap: number;
  consumeTotal: number;
  claimed: boolean;
  tiers: readonly LuckyTierLite[];
}

/** The tier a lucky claim would pay today, or null when any gate fails (Thursday, streak, tier row, spend, once a month). */
export function luckyClaimTier(i: LuckyInput): LuckyTierLite | null {
  if (i.claimed || i.weekday !== DAILY_SIGNIN_CONF.luckyDay || !allSignedThrough(i.bitmap, i.today)) return null;
  const tier = i.tiers.find((t) => t.weekIndex === weekOfMonth(i.today));
  return tier && i.consumeTotal >= tier.pointThreshold ? tier : null;
}

/** getAwardTime.day: today when the lucky claim is open, else 0 (Go computeAwardDay). */
export const luckyAwardDay = (i: LuckyInput): number => (luckyClaimTier(i) ? i.today : 0);

/** Gold payment split, bound gold first (Go spendGold); null when the wallet is short. */
export function splitGold(goldBind: number, gold: number, cost: number): { bind: number; gold: number } | null {
  if (cost <= 0) return { bind: 0, gold: 0 };
  if (goldBind + gold < cost) return null;
  const bind = Math.min(goldBind, cost);
  return { bind, gold: cost - bind };
}
