// Zodiac star (Tinh Cung) rules, pure. 12 star types x 12 levels; one timed level-up at a time, timers persisted as END timestamps (ms)
// so a restart keeps them; `now` is always injected. Port of application/star (begin / finish / cancel / speed-up / addition /
// exchange) and of statfeature.applyStarsBonus (stat = add_value x addition for the CURRENT level).

import {
  isStarShardId, isStarType, starAdditionCost, starAdditionRate, STAR, type StarNextView, type StarSlot, type StarsData, type StarView,
} from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { StarTemplate } from '../gamedata/star-data';

/** Persisted slot; `tid` is derived from (type, level) when building the wire view. */
export interface StarSlotState {
  level: number;
  addition: number;
  /** End of the running level-up (ms epoch), 0 when idle. */
  finishDate: number;
}

export type StarState = Record<string, StarSlotState>;

export interface StarLookup {
  byId(id: number): StarTemplate | undefined;
  at(type: number, level: number): StarTemplate | undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const nonNeg = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function emptyStars(): StarState {
  const s: StarState = {};
  for (let t = 1; t <= STAR.TYPES; t++) s[String(t)] = { level: 0, addition: 1, finishDate: 0 };
  return s;
}

/** Defensive parse of `{stars: {"1": {level, addition, finishDate}}}`. */
export function parseStars(raw: Record<string, unknown> | null | undefined): StarState {
  const out = emptyStars();
  const src = typeof raw?.stars === 'object' && raw.stars !== null ? (raw.stars as Record<string, Record<string, unknown> | undefined>) : {};
  for (const k of Object.keys(out)) {
    const c = src[k];
    const add = Number(c?.addition);
    out[k] = {
      level: Math.min(nonNeg(c?.level), STAR.MAX_LEVEL),
      addition: Number.isFinite(add) && add >= 1 ? Math.min(round2(add), STAR.ADDITION_MAX) : 1,
      finishDate: nonNeg(c?.finishDate),
    };
  }
  return out;
}

export const totalStarLevel = (s: StarState): number => Object.values(s).reduce((sum, c) => sum + c.level, 0);

const clone = (s: StarState): StarState => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v }]));

/** Completes every level-up whose end passed (what Go does lazily at the start of beginStarLvUp). */
export function completeDue(s: StarState, now: number): StarState {
  const out = clone(s);
  for (const c of Object.values(out)) {
    if (c.finishDate > 0 && c.finishDate <= now) {
      c.level = Math.min(c.level + 1, STAR.MAX_LEVEL);
      c.finishDate = 0;
    }
  }
  return out;
}

export const runningType = (s: StarState): number | null => {
  const e = Object.entries(s).find(([, c]) => c.finishDate > 0);
  return e ? Number(e[0]) : null;
};

type Fail = { ok: false; note: string };
export type BeginPlan = { ok: true; type: number; tpl: StarTemplate; cost: number; state: StarState } | Fail;

/** beginStarLvUp(nextTemplateId): the template must be the next level of its star; one level-up at a time; level, star-level sum, gold. */
export function planBegin(s: StarState, look: StarLookup, playerLevel: number, nextTplId: number, now: number): BeginPlan {
  const tpl = look.byId(nextTplId);
  if (!tpl || !isStarType(tpl.type)) return { ok: false, note: 'Tinh Cung không hợp lệ' };
  if (playerLevel < STAR.MIN_PLAYER_LEVEL) return { ok: false, note: `Cần đạt cấp ${STAR.MIN_PLAYER_LEVEL} để tu luyện Tinh Cung` };
  const state = completeDue(s, now);
  if (runningType(state) !== null) return { ok: false, note: 'Đang có Tinh Cung tu luyện, hãy chờ hoàn thành' };
  const slot = state[String(tpl.type)];
  if (tpl.level !== slot.level + 1) return { ok: false, note: 'Cấp Tinh Cung không hợp lệ' };
  if (playerLevel < tpl.reqLevel) return { ok: false, note: `Cần đạt cấp ${tpl.reqLevel} để tu luyện cấp này` };
  if (totalStarLevel(state) < tpl.reqStarLevel) return { ok: false, note: `Cần tổng cấp Tinh Cung đạt ${tpl.reqStarLevel}` };
  slot.finishDate = now + tpl.reqSeconds * 1000;
  return { ok: true, type: tpl.type, tpl, cost: tpl.reqMoney, state };
}

export type StarStep = { ok: true; state: StarState } | Fail;

/** finishStarLvUp(type): needs a running level-up whose end passed. */
export function finishStar(s: StarState, type: number, now: number): StarStep {
  const c = isStarType(type) ? s[String(type)] : undefined;
  if (!c || c.finishDate <= 0) return { ok: false, note: 'Tinh Cung này không đang tu luyện' };
  if (now < c.finishDate) return { ok: false, note: 'Tinh Cung chưa tu luyện xong' };
  const state = clone(s);
  state[String(type)] = { ...c, level: Math.min(c.level + 1, STAR.MAX_LEVEL), finishDate: 0 };
  return { ok: true, state };
}

/** cancelStarLvUp(type): clears the timer, no refund (Go). */
export function cancelStar(s: StarState, type: number): StarStep {
  const c = isStarType(type) ? s[String(type)] : undefined;
  if (!c || c.finishDate <= 0) return { ok: false, note: 'Tinh Cung này không đang tu luyện, không thể hủy bỏ' };
  const state = clone(s);
  state[String(type)] = { ...c, finishDate: 0 };
  return { ok: true, state };
}

/** speedUpStarLvUp(type): needs a level-up still running; the end moves to now - 1 so the next finish call succeeds. */
export function speedUpStar(s: StarState, type: number, now: number): StarStep {
  const c = isStarType(type) ? s[String(type)] : undefined;
  if (!c || c.finishDate <= 0) return { ok: false, note: 'Tinh Cung này không đang tu luyện' };
  if (c.finishDate <= now) return { ok: false, note: 'Tinh Cung đã tu luyện xong, hãy nhận thành quả' };
  const state = clone(s);
  state[String(type)] = { ...c, finishDate: now - 1 };
  return { ok: true, state };
}

export type AdditionPlan = { ok: true; rate: number; silver: number } | Fail;

/** addStarAddition(type, num): rate and silver price of one try (client formula); refused at the 5.0 cap. */
export function planAddition(s: StarState, type: number, qty: number): AdditionPlan {
  const c = isStarType(type) ? s[String(type)] : undefined;
  if (!c) return { ok: false, note: 'Tinh Cung không hợp lệ' };
  if (!Number.isInteger(qty) || qty < 1 || qty > STAR.MAX_ITEMS_PER_TRY) return { ok: false, note: 'Số lượng Hoa Tinh Tú không hợp lệ' };
  if (c.addition >= STAR.ADDITION_MAX) return { ok: false, note: 'Tư chất Cung đã đạt tối đa' };
  const rate = starAdditionRate(c.addition, qty);
  return { ok: true, rate, silver: starAdditionCost(type, rate, c.addition) };
}

/** One Bernoulli roll of `rate`; success adds 0.05 (cap 5). */
export function rollAddition(s: StarState, type: number, rate: number, rng: () => number): { success: boolean; state: StarState } {
  const success = rng() < rate;
  if (!success) return { success, state: s };
  const state = clone(s);
  const c = state[String(type)];
  c.addition = Math.min(STAR.ADDITION_MAX, round2(c.addition + STAR.ADDITION_STEP));
  return { success, state };
}

/** pmStarExchage: shards only (Go exchanged ANY item for speed items 1:1, an exploit): source and target are different shards. */
export function planExchange(sourceTid: number, targetTid: number, num: number, stack: number): { ok: true } | Fail {
  if (!isStarShardId(sourceTid) || !isStarShardId(targetTid)) return { ok: false, note: 'Chỉ có thể đổi Tinh Toái' };
  if (sourceTid === targetTid) return { ok: false, note: 'Hãy chọn loại Tinh Toái khác' };
  if (!Number.isInteger(num) || num < 1 || num > stack) return { ok: false, note: 'Số lượng không hợp lệ' };
  return { ok: true };
}

/** add_prop of the template -> common-feature prop id (debuff rates have no H5 stat key and grant nothing). */
const STAR_PROP: Readonly<Record<string, number>> = {
  hp: 1, attack: 4, mAttack: 5, defence: 6, mDefence: 7, speed: 11, hit: 8, dodge: 9, critical: 13, resiCritical: 31,
};

export function starBonuses(s: StarState, look: StarLookup): Bonuses {
  const b = emptyBonuses();
  for (const [k, c] of Object.entries(s)) {
    const tpl = c.level > 0 ? look.at(Number(k), c.level) : undefined;
    const prop = tpl ? STAR_PROP[tpl.addProp] : undefined;
    if (tpl && prop) addProp(b, BUFF_PROP, prop, tpl.addValue * c.addition, false);
  }
  return b;
}

export function toStarsData(s: StarState, look: StarLookup): StarsData {
  const out: StarsData = {};
  for (const [k, c] of Object.entries(s)) {
    const slot: StarSlot = { tid: look.at(Number(k), c.level)?.id ?? 0, level: c.level, addition: c.addition, finishDate: c.finishDate };
    out[k] = slot;
  }
  return out;
}

export function starViews(s: StarState, look: StarLookup): Record<string, StarView> {
  const out: Record<string, StarView> = {};
  for (const [k, c] of Object.entries(s)) {
    const type = Number(k);
    const cur = c.level > 0 ? look.at(type, c.level) : undefined;
    const nextTpl = c.level < STAR.MAX_LEVEL ? look.at(type, c.level + 1) : undefined;
    const ref = cur ?? nextTpl;
    const next: StarNextView | null = nextTpl
      ? {
        tid: nextTpl.id, level: nextTpl.level, value: nextTpl.addValue * c.addition, reqLevel: nextTpl.reqLevel, reqMoney: nextTpl.reqMoney,
        reqSeconds: nextTpl.reqSeconds, reqStarLevel: nextTpl.reqStarLevel,
      }
      : null;
    out[k] = {
      type, name: ref?.name ?? '', description: ref?.description ?? '', addProp: ref?.addProp ?? '',
      value: cur ? cur.addValue * c.addition : 0, next,
    };
  }
  return out;
}
