// Pure VIP / PM rules (M8 phase B): package purchase, the daily login PM exp, claim cycles (day / week / month), the findback audit
// and the reward amounts of every implemented right. Clocks and RNG inputs are parameters. Legacy: Go application/activity/
// service.go, pm_exp.go, operation.go, pm_operation.go, pm_findback.go; H5 fixes (right 1 cap, mark-first) are in the plan, decision 4.

import {
  DAY_MS, PM_DAILY_LOGIN_EXP, PM_EXP_THRESHOLDS, PM_PACKAGES, PM_RECOVERABLE_RIGHTS, PM_TRANSFORM_BUFF_ID, PmRight, basicExp, dayKey, monthKey,
  nextDayStartMs, rightClaimable, rightEnabled, rightValue, vipActive, vnDate, weekKey,
  type PmCountConfig, type PmPackageType, type PmProcessFlag, type PmRightView,
} from '@mc/shared';
import { levelStartExp } from '../quest/quest.rules';

export interface VipState {
  vipType: number;
  expiresAt: number;
  /** start of the current membership period (Flash end time = activeTime + keepDay days) */
  startedAt: number;
  pmExp: number;
  dailyExpDay: string;
  process: Record<string, PmProcessFlag>;
  findback: boolean;
  /** recoverable rights missed yesterday (what the findback claim pays) */
  missed: number[];
  auditDay: string;
  auditRights: number[];
}

export const emptyVip = (): VipState => ({
  vipType: 0, expiresAt: 0, startedAt: 0, pmExp: 0, dailyExpDay: '', process: {}, findback: false, missed: [], auditDay: '', auditRights: [],
});

export const MSG_DOWNGRADE = 'Không thể đổi thẻ cao cấp hơn';
export const MSG_ALREADY = 'Bạn đã nhận thưởng, vui lòng quay lại sau!';
export const MSG_EXPIRED = 'Hôm qua đã nhận hoặc quá hạn nhận';
export const MSG_UNSUPPORTED = 'Phần thưởng VIP này hiện chưa hỗ trợ';
export const MSG_NOT_VIP = 'Bạn chưa là thành viên VIP';

/** Price and the patch of buying package `type`; a downgrade while active is refused (Go BuyPM). */
export function buyPackage(
  state: VipState, type: PmPackageType, now: number,
): { cost: number; patch: Pick<VipState, 'vipType' | 'expiresAt' | 'startedAt' | 'pmExp'> } | { error: string } {
  const pkg = PM_PACKAGES[type];
  const active = vipActive(state, now);
  if (active && type < state.vipType) return { error: MSG_DOWNGRADE };
  const base = active ? state.expiresAt : now;
  return {
    cost: pkg.gold,
    patch: {
      vipType: type,
      expiresAt: base + pkg.days * DAY_MS,
      startedAt: active ? state.startedAt : now,
      // PMExp = max(PMExp + cost, threshold of the package's level): buying never loses exp and a card lifts you to its level
      pmExp: Math.max(state.pmExp + pkg.gold, PM_EXP_THRESHOLDS[type - 1]),
    },
  };
}

/** PM exp for today's first login of an active member, null when none is due. */
export function dailyLoginExp(state: VipState, now: number): { amount: number; day: string } | null {
  if (!vipActive(state, now)) return null;
  const day = dayKey(now);
  if (state.dailyExpDay === day) return null;
  const amount = PM_DAILY_LOGIN_EXP[state.vipType as PmPackageType] ?? 0;
  return amount > 0 ? { amount, day } : null;
}

/** Why a claim of `right` is refused at `level`, null when allowed (Go pm_operation.go gates). */
export function claimError(right: PmRightView | undefined, level: number): string | null {
  if (!right) return MSG_EXPIRED;
  if (level < 1) return MSG_NOT_VIP;
  if (!rightEnabled(right, level)) return MSG_EXPIRED;
  if (!rightClaimable(right.type)) return MSG_UNSUPPORTED;
  return null;
}

/** Cycle key a claim at `now` belongs to: day, Monday-first week, calendar month, or a rolling window of days. */
export function cycleKey(cfg: PmCountConfig, prev: PmProcessFlag | undefined, now: number): string {
  if (cfg.cycle === 1) return dayKey(now);
  if (cfg.cycle === 2 && cfg.window === 7) return weekKey(now);
  if (cfg.cycle === 2 && cfg.window === 30) return monthKey(now);
  if (prev && prev.day) {
    const start = Date.parse(`${prev.day}T00:00:00Z`);
    if (Number.isFinite(start) && (now + 7 * 3_600_000 - start) / DAY_MS < cfg.window) return prev.day;
  }
  return dayKey(now);
}

/** Progress after one more claim, or null when the cycle's maximum is already used (Go AlreadyClaimed). */
export function nextProgress(prev: PmProcessFlag | undefined, cfg: PmCountConfig, type: number, now: number): PmProcessFlag | null {
  const day = cycleKey(cfg, prev, now);
  const used = prev && prev.day === day ? prev.time : 0;
  return used >= cfg.max ? null : { day, type, time: used + 1 };
}

/** Claims of the cycle containing `now` (0 when none): what the panel shows as `(done/max)`. */
export function claimedNow(prev: PmProcessFlag | undefined, cfg: PmCountConfig, now: number): number {
  return prev && prev.day === cycleKey(cfg, prev, now) ? prev.time : 0;
}

// --- findback audit ---

/** Recoverable daily rights a member of `level` is entitled to (empty unless the findback right itself is enabled). */
export function auditableRights(rights: readonly PmRightView[], level: number): number[] {
  const byId = new Map(rights.map((r) => [r.id, r]));
  const fb = byId.get(PmRight.FINDBACK);
  if (!fb || !rightEnabled(fb, level)) return [];
  return PM_RECOVERABLE_RIGHTS.filter((id) => {
    const r = byId.get(id);
    return !!r && rightEnabled(r, level) && (id !== PmRight.BOOK || (rightValue(r, level) ?? 0) > 0);
  });
}

/**
 * Once per UTC+7 day: audits yesterday's recoverable rights (those recorded at the last audit) and raises the findback flag when
 * any was not claimed, then records today's entitlement. Null when today was already audited.
 */
export function auditRollover(state: VipState, now: number, entitled: readonly number[]): Partial<VipState> | null {
  const today = dayKey(now);
  if (state.auditDay === today) return null;
  const patch: Partial<VipState> = { auditDay: today, auditRights: [...entitled] };
  if (state.auditDay && state.auditRights.length > 0) {
    const yesterday = dayKey(now - DAY_MS);
    const missed = state.auditRights.filter((id) => {
      const p = state.process[String(id)];
      return !(state.auditDay === yesterday && p && p.day === yesterday && p.time >= 1);
    });
    if (missed.length > 0) {
      patch.findback = true;
      patch.missed = missed;
    }
  }
  return patch;
}

// --- reward amounts ---

/** Right 1: `basicExp(level) * value` capped at one level's exp (plan decision 4; Go paid 2-9 levels a day). */
export function expRewardAmount(charLevel: number, value: number | null): number {
  const need = levelStartExp(charLevel + 1) - levelStartExp(charLevel);
  const raw = basicExp(charLevel) * (value ?? 0);
  return Math.max(0, need > 0 ? Math.min(need, raw) : raw);
}

const BUFF_BY_LEVEL: readonly number[] = [2504, 2505, 2506, 2507, 2508, 2509, 2510, 3308, 3309];
export const buffForLevel = (level: number): number => BUFF_BY_LEVEL[Math.max(1, Math.min(9, level)) - 1];
/** Right 10: monthly bag "Túi Quà VIP (n Sao)", items 3232..3238 (3231 + min(level, 7)). */
export const monthBagItem = (level: number): number => 3231 + Math.min(Math.max(level, 1), 7);
export const AUTO_DUNGEON_BOOK = 3630;

/** Right 13: today's transform res code, a stable pick per character and day (Go seed year*1000 + yearDay + cid). */
export function pickTransform(pool: readonly string[], now: number, characterId: number): string | null {
  if (pool.length === 0) return null;
  const v = vnDate(now);
  const yearDay = Math.floor((Date.UTC(v.year, v.month - 1, v.day) - Date.UTC(v.year, 0, 0)) / DAY_MS);
  return pool[(v.year * 1000 + yearDay + characterId) % pool.length];
}

/**
 * Whether removing a buff reverts the right-13 look: buff 2730 removed (click or expiry) clears it at once; an unknown row (already
 * lazily expired, buffId null) clears it only once it has ended. A slot without pm (the Mê Huyễn curse) is never touched.
 */
export function revertsTransform(transform: { expiresAt: number; pm?: boolean } | null, buffId: number | null, now: number): boolean {
  if (!transform?.pm) return false;
  if (buffId === PM_TRANSFORM_BUFF_ID) return true;
  return buffId === null && transform.expiresAt <= now;
}

/** Seconds until the next UTC+7 midnight (lifetime of the daily buff). */
export const secondsLeftToday = (now: number): number => Math.max(1, Math.ceil((nextDayStartMs(now) - now) / 1000));

export type PmReward =
  | { kind: 'exp'; amount: number }
  | { kind: 'goldBind'; amount: number }
  | { kind: 'buff'; buffId: number; seconds: number }
  | { kind: 'item'; itemId: number; qty: number }
  | { kind: 'transform'; resCode: string };

export interface RewardCtx {
  charLevel: number;
  characterId: number;
  now: number;
  transformPool: readonly string[];
}

/** What a claim of `right` pays at `level`; null for rights without a rule. */
export function rewardOf(right: PmRightView, level: number, ctx: RewardCtx): PmReward | null {
  const value = rightValue(right, level);
  switch (right.id) {
    case PmRight.EXP: return { kind: 'exp', amount: expRewardAmount(ctx.charLevel, value) };
    case PmRight.COUPON: return value && value > 0 ? { kind: 'goldBind', amount: value } : null;
    case PmRight.BUFF: return { kind: 'buff', buffId: buffForLevel(level), seconds: secondsLeftToday(ctx.now) };
    case PmRight.BOOK: return value && value > 0 ? { kind: 'item', itemId: AUTO_DUNGEON_BOOK, qty: value } : null;
    case PmRight.MONTH_BAG: return { kind: 'item', itemId: monthBagItem(level), qty: 1 };
    case PmRight.TRANSFORM: {
      const resCode = pickTransform(ctx.transformPool, ctx.now, ctx.characterId);
      return resCode ? { kind: 'transform', resCode } : null;
    }
    default: return null;
  }
}
