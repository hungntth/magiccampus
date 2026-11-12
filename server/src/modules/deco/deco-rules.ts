// Pure Hồn Khí rules (Go application/dress/deco_*.go): activation, equip / show / look tier, expiry, the hole level-up batch plan, the
// character stat bonuses (hole rows + live shows + suit / link bonuses) and the getDecoSuitProp reply. No Nest / Mongo here.

import {
  DECO_LINK_BONUS_PCT, DECO_POSITIONS, DECO_SERVER_TEXT as T, DECO_SUIT_BONUS_PCT, DECO_SUIT_PROP_TYPES, decoMaxShowLvl, decoShowDue, decoShowLive,
  type DecoHoleRow, type DecoShowRow, type DecoSuitPropReply, type PropLine,
} from '@mc/shared';
import { addProp, emptyBonuses, EQUIP_PROP, type Bonuses } from '../character/character-stats';
import { freshPosition, holeLevel, type DecoPosState, type DecoState } from './deco-state';

export type Refusal = { ok: false; note: string };
export const refuse = (note: string): Refusal => ({ ok: false, note });
export type HoleOf = (id: number) => DecoHoleRow | undefined;

export const validPosition = (p: number): boolean => Number.isInteger(p) && p >= 1 && p <= 4;

function withPos(state: DecoState, position: number, fn: (p: DecoPosState) => DecoPosState): DecoState {
  const cur = state.pos[String(position)] ?? freshPosition(position);
  return { pos: { ...state.pos, [String(position)]: fn({ ...cur, s: { ...cur.s }, r: [...cur.r] }) } };
}

const posOf = (state: DecoState, position: number): DecoPosState => state.pos[String(position)] ?? freshPosition(position);

// --- shows ---

export type ShowPlan = { ok: true; state: DecoState; gold: number; changed: boolean } | Refusal;

/** activeDecoShow: a gold purchase of a show of that position; a live show is a no-op, activeGold 0 = event only. */
export function planActivate(state: DecoState, show: DecoShowRow | undefined, position: number, now: number): ShowPlan {
  if (!validPosition(position)) return refuse(T.BAD_POSITION);
  if (!show || show.position !== position) return refuse(T.NO_SHOW);
  const due = posOf(state, position).s[String(show.id)];
  if (due !== undefined && decoShowLive(due, now)) return { ok: true, state, gold: 0, changed: false };
  if (show.activeGold <= 0) return refuse(T.EVENT_ONLY);
  return { ok: true, state: withPos(state, position, (p) => ({ ...p, s: { ...p.s, [String(show.id)]: decoShowDue(show.t, now) } })), gold: show.activeGold, changed: true };
}

/** equipDecoShow / equipOffDecoShow: wearing needs a live activated show and turns the look on; taking off clears `did` only for that show. */
export function planEquip(state: DecoState, show: DecoShowRow | undefined, position: number, equip: boolean, now: number): { ok: true; state: DecoState } | Refusal {
  if (!validPosition(position)) return refuse(T.BAD_POSITION);
  if (!show || show.position !== position) return refuse(T.NO_SHOW);
  const p = posOf(state, position);
  if (equip) {
    const due = p.s[String(show.id)];
    if (due === undefined || !decoShowLive(due, now)) return refuse(T.NOT_ACTIVE);
    return { ok: true, state: withPos(state, position, (q) => ({ ...q, did: show.id, isShow: 1 })) };
  }
  return { ok: true, state: p.did === show.id ? withPos(state, position, (q) => ({ ...q, did: 0 })) : state };
}

export function setVisible(state: DecoState, position: number, visible: boolean): { ok: true; state: DecoState } | Refusal {
  if (!validPosition(position)) return refuse(T.BAD_POSITION);
  return { ok: true, state: withPos(state, position, (p) => ({ ...p, isShow: visible ? 1 : 0 })) };
}

/** changeShowLvl: tier 1..max of the hole level. */
export function planShowLvl(state: DecoState, position: number, showLvl: number, holeOf: HoleOf): { ok: true; state: DecoState } | Refusal {
  if (!validPosition(position)) return refuse(T.BAD_POSITION);
  if (!Number.isInteger(showLvl) || showLvl < 1 || showLvl > decoMaxShowLvl(holeLevel(posOf(state, position), holeOf))) return refuse(T.TIER_LOCKED);
  return { ok: true, state: withPos(state, position, (p) => ({ ...p, showLvl })) };
}

/** updateActiveDecoShow: drops every expired show (and unequips it); `positions` are the ones whose look changed. */
export function expireShows(state: DecoState, now: number): { state: DecoState; changed: boolean; positions: number[] } {
  let next = state;
  const positions: number[] = [];
  for (const position of DECO_POSITIONS) {
    const p = posOf(next, position);
    const dead = Object.entries(p.s).filter(([, due]) => !decoShowLive(due, now)).map(([id]) => id);
    if (dead.length === 0) continue;
    next = withPos(next, position, (q) => {
      for (const id of dead) delete q.s[id];
      return dead.includes(String(q.did)) ? { ...q, did: 0 } : q;
    });
    positions.push(position);
  }
  return { state: next, changed: positions.length > 0, positions };
}

// --- hole level-up ---

export interface HoleLevelPlan {
  ok: true;
  hid: number;
  attempts: number;
  successes: number;
  /** Totals to spend: Bí Ngân and silver. */
  silver: number;
  money: number;
}

/**
 * addDecoHoleLevel(TenTimes): up to `times` attempts from row `hid`; every attempt pays its row's costs and succeeds with `rate` percent.
 * Stops at the last level or when the next attempt is unaffordable (the first unaffordable attempt is a refusal, later ones just end the batch).
 */
export function planHoleLevel(
  hid: number, holeOf: HoleOf, times: number, silverHave: number, moneyHave: number, rng: () => number,
): HoleLevelPlan | Refusal {
  let cur = hid;
  const plan: HoleLevelPlan = { ok: true, hid, attempts: 0, successes: 0, silver: 0, money: 0 };
  let sil = silverHave;
  let mon = moneyHave;
  while (plan.attempts < times) {
    const row = holeOf(cur);
    if (!row || row.nextId <= 0 || !holeOf(row.nextId)) break;
    if (sil < row.costNum || mon < row.costSil) {
      if (plan.attempts === 0) return refuse(sil < row.costNum ? T.NO_SILVER : T.NO_MONEY);
      break;
    }
    sil -= row.costNum;
    mon -= row.costSil;
    plan.silver += row.costNum;
    plan.money += row.costSil;
    plan.attempts++;
    if (row.rate >= 100 || (row.rate > 0 && rng() * 100 < row.rate)) {
      cur = row.nextId;
      plan.successes++;
    }
  }
  if (plan.attempts === 0) return refuse(T.HOLE_MAX);
  plan.hid = cur;
  return plan;
}

// --- stats ---

type SuitOf = (suitId: number) => readonly DecoShowRow[];

const sumProps = (...groups: readonly (readonly DecoShowRow[])[]): Map<number, number> => {
  const totals = new Map<number, number>();
  for (const g of groups) for (const s of g) for (const p of s.props) totals.set(p.t, (totals.get(p.t) ?? 0) + p.v);
  return totals;
};

/** Full-suit bonus: DECO_SUIT_BONUS_PCT percent (floored) of the pieces' summed HP / Công VL / Công MP (Go-invented percents). */
export function suitBonus(pieces: readonly DecoShowRow[]): PropLine[] {
  const totals = sumProps(pieces);
  return DECO_SUIT_PROP_TYPES.map((t) => ({ t, v: Math.floor(((totals.get(t) ?? 0) * DECO_SUIT_BONUS_PCT) / 100) })).filter((p) => p.v > 0);
}

/** Link bonus of two full suits: DECO_LINK_BONUS_PCT percent (floored) of both suits' summed props, every type. */
export function linkBonus(a: readonly DecoShowRow[], b: readonly DecoShowRow[]): PropLine[] {
  return [...sumProps(a, b).entries()].sort((x, y) => x[0] - y[0]).map(([t, v]) => ({ t, v: Math.floor((v * DECO_LINK_BONUS_PCT) / 100) })).filter((p) => p.v > 0);
}

const isFull = (pieces: readonly DecoShowRow[], live: ReadonlySet<number>): boolean => pieces.length > 0 && pieces.every((s) => live.has(s.id));

/** Live show ids over every position. */
export function liveShowIds(state: DecoState, now: number): Set<number> {
  const out = new Set<number>();
  for (const p of Object.values(state.pos)) for (const [id, due] of Object.entries(p.s)) if (decoShowLive(due, now)) out.add(Number(id));
  return out;
}

/** Raw stat totals {propType: sum}: every position's hole row, every live show, full suits and linked full suits. */
export function decoTotals(state: DecoState, now: number, holeOf: HoleOf, showOf: (id: number) => DecoShowRow | undefined, suitOf: SuitOf): Map<number, number> {
  const totals = new Map<number, number>();
  const add = (lines: readonly PropLine[]): void => {
    for (const l of lines) totals.set(l.t, (totals.get(l.t) ?? 0) + l.v);
  };
  for (const p of Object.values(state.pos)) add(holeOf(p.hid)?.props ?? []);
  const live = liveShowIds(state, now);
  const suits = new Map<number, number>();
  for (const id of live) {
    const s = showOf(id);
    if (!s) continue;
    add(s.props);
    suits.set(s.suitId, s.linkSuitId);
  }
  const full = new Set<number>();
  for (const suitId of suits.keys()) {
    const pieces = suitOf(suitId);
    if (isFull(pieces, live)) {
      full.add(suitId);
      add(suitBonus(pieces));
    }
  }
  for (const [suitId, linkId] of suits) {
    if (linkId > suitId && full.has(suitId) && full.has(linkId)) add(linkBonus(suitOf(suitId), suitOf(linkId)));
  }
  return totals;
}

/** Character bonuses of the Hồn Khí: the totals through the equipment prop scale (1 HP, 4 / 5 attack, 11 speed; all flat). */
export function decoBonuses(totals: ReadonlyMap<number, number>): Bonuses {
  const b = emptyBonuses();
  for (const [t, v] of totals) addProp(b, EQUIP_PROP, t, v, false);
  return b;
}

// --- getDecoSuitProp ---

/** Common leading words of the piece names ("Mũ Solomon" / "Giáp Solonmon" share none, so the Go fallback drops the first word). */
export function decoSuitName(pieces: readonly DecoShowRow[]): string {
  if (pieces.length === 0) return '';
  const words = pieces[0].name.split(/\s+/).filter(Boolean);
  let prefix = words;
  for (const s of pieces.slice(1)) {
    const w = s.name.split(/\s+/).filter(Boolean);
    let n = 0;
    while (n < prefix.length && n < w.length && prefix[n] === w[n]) n++;
    prefix = prefix.slice(0, n);
  }
  if (prefix.length > 0) return prefix.join(' ');
  return words.length > 1 ? words.slice(1).join(' ') : pieces[0].name;
}

const propArray = (lines: readonly PropLine[]): { t: number; propVal: number }[] => lines.map((l) => ({ t: l.t, propVal: l.v }));

export function suitReply(suitId: number, linkSuitId: number, live: ReadonlySet<number>, suitOf: SuitOf): DecoSuitPropReply {
  const pieces = suitOf(suitId);
  const full = isFull(pieces, live);
  const reply: DecoSuitPropReply = {
    actName: decoSuitName(pieces), suitIdObj: Object.fromEntries(pieces.map((s) => [String(s.id), s.id])), suitProp: propArray(suitBonus(pieces)),
    actArr: pieces.filter((s) => live.has(s.id)).map((s) => s.id).sort((a, b) => a - b), actFlag: full, linkProp: 'null', linkFlag: false,
    actLinkSuitFlag: full, actLinkSuitName: decoSuitName(pieces),
  };
  if (linkSuitId > 0 && linkSuitId !== suitId) {
    const linked = suitOf(linkSuitId);
    if (linked.length > 0) {
      const linkedFull = isFull(linked, live);
      reply.actLinkSuitName = decoSuitName(linked);
      reply.actLinkSuitFlag = linkedFull;
      reply.linkFlag = full && linkedFull;
      const props = linkBonus(pieces, linked);
      if (props.length > 0) reply.linkProp = propArray(props);
    }
  }
  return reply;
}
