// Pure mount rules (Go application/mount): state parsing, the level from cumulative exp capped by the evolution row, the feed exp roll,
// the evolution roll (success = row.exp + lucky points percent), owned / expired skins and the stat percents while riding.

import { MOUNT_ADV_UPLV, MountItem } from '@mc/shared';
import { emptyBonuses, type Bonuses } from '../character/character-stats';

export const MOUNT_FEATURE_KEY = 'mount';

/** data_tbl_mount row: type 1 = level thresholds (cumulative exp), type 2 = evolution ranks. */
export interface MountRow {
  type: number;
  level: number;
  exp: number;
  addRate: number;
  itemNum: number;
  dressId: number;
  levelLimit: number;
  life: number;
  phyAttack: number;
  magAttack: number;
  phyDefense: number;
  magDefense: number;
}

export interface DressRow {
  id: number;
  name: string;
  effectiveTime: number;
  gold: number;
  resCode: string;
  iconCode: string;
  life: number;
  phyAttack: number;
  magAttack: number;
  phyDefense: number;
  magDefense: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const toMountRow = (r: Raw): MountRow => ({
  type: num(r.type), level: num(r.level), exp: num(r.exp), addRate: num(r.add_rate), itemNum: num(r.item_num), dressId: num(r.dress_id),
  levelLimit: num(r.mount_lev_limit), life: num(r.life_per), phyAttack: num(r.phy_attack_per), magAttack: num(r.mag_attack_per),
  phyDefense: num(r.phy_defense_per), magDefense: num(r.mag_defense_per),
});

export const toDressRow = (r: Raw): DressRow => ({
  id: num(r.id), name: String(r.name ?? ''), effectiveTime: num(r.effective_time), gold: num(r.gold), resCode: String(r.res_code ?? 0),
  iconCode: String(r.icon_code ?? 0), life: num(r.life_per), phyAttack: num(r.phy_attack_per), magAttack: num(r.mag_attack_per),
  phyDefense: num(r.phy_defense_per), magDefense: num(r.mag_defense_per),
});

export interface MountState {
  lv: number;
  upLv: number;
  exp: number;
  addRate: number;
  addRateDay: string;
  /** dress being ridden, -1 on foot */
  useDress: number;
  getDate: number;
  /** timed skins `{ "<dressId>": expiryMs }` (1 = permanent) */
  extra: Record<string, number>;
}

export const defaultMount = (): MountState => ({ lv: 0, upLv: 0, exp: 0, addRate: 0, addRateDay: '0|0|0', useDress: -1, getDate: 0, extra: {} });

const nonNeg = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function parseMount(raw: Record<string, unknown> | null | undefined): MountState {
  const d = defaultMount();
  if (!raw) return d;
  const extra: Record<string, number> = {};
  const src = raw.extra;
  if (typeof src === 'object' && src !== null) for (const [k, v] of Object.entries(src)) if (nonNeg(v) > 0) extra[k] = nonNeg(v);
  return {
    lv: nonNeg(raw.lv), upLv: nonNeg(raw.upLv), exp: nonNeg(raw.exp), addRate: nonNeg(raw.addRate), extra,
    addRateDay: typeof raw.addRateDay === 'string' && raw.addRateDay ? raw.addRateDay : d.addRateDay,
    useDress: raw.useDress === undefined ? -1 : Math.trunc(num(raw.useDress, -1)), getDate: nonNeg(raw.getDate),
  };
}

export const mountPatch = (s: MountState): Record<string, unknown> => ({
  lv: s.lv, upLv: s.upLv, exp: s.exp, addRate: s.addRate, addRateDay: s.addRateDay, useDress: s.useDress, getDate: s.getDate, extra: s.extra,
});

const rowAt = (rows: readonly MountRow[], type: number, level: number): MountRow | undefined => rows.find((r) => r.type === type && r.level === level);

/** Level cap of an evolution rank (type 2 row `mount_lev_limit`), 0 = none. */
export const levelCap = (rows: readonly MountRow[], upLv: number): number => rowAt(rows, 2, upLv)?.levelLimit ?? 0;

/** Level reached by `exp`: the highest type-1 row whose cumulative exp is covered (level = row level + 1), capped by the rank. */
export function computeLevel(rows: readonly MountRow[], exp: number, upLv: number): number {
  let level = 0;
  for (const r of rows) if (r.type === 1 && exp >= r.exp) level = Math.max(level, r.level + 1);
  const cap = levelCap(rows, upLv);
  return cap > 0 && level > cap ? cap : level;
}

/** addMountExp sends a mode, not a count: 1 = one item, anything else = ten (Go feedCount). */
export const feedCount = (mode: number): number => (mode === 1 ? 1 : 10);

/** Exp of `count` fed items: 5 % chance of 10, else 1..3 each. */
export function rollFeed(count: number, rng: () => number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += rng() < 0.05 ? 10 : Math.floor(rng() * 3) + 1;
  return total;
}

/** Evolve item for the current rank (3805, or 6273 from rank 8). */
export const evolveItem = (upLv: number): number => (upLv >= MOUNT_ADV_UPLV ? MountItem.EVOLVE_ADV : MountItem.EVOLVE);

export interface EvolveResult {
  ok: boolean;
  upLv: number;
  addRate: number;
  /** lucky points gained on a failure */
  gained: number;
}

/** One evolution attempt on rank `upLv`: success when roll < row.exp + addRate percent; a failure banks max(1, row.addRate) lucky points. */
export function rollEvolve(state: Pick<MountState, 'upLv' | 'addRate'>, row: MountRow, rng: () => number): EvolveResult {
  const percent = row.exp + state.addRate;
  if (rng() * 100 < percent) return { ok: true, upLv: state.upLv + 1, addRate: 0, gained: 0 };
  const gained = Math.max(1, row.addRate);
  return { ok: false, upLv: state.upLv, addRate: state.addRate + gained, gained };
}

/** Owned skins `{ id: expiry }`: rank skins are permanent (1), timed extras expire at their ms (> 1). */
export function ownedDresses(state: MountState, rows: readonly MountRow[], now: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let l = 0; l <= state.upLv; l++) {
    const id = rowAt(rows, 2, l)?.dressId ?? 0;
    if (id > 0) out.set(id, 1);
  }
  for (const [k, expiry] of Object.entries(state.extra)) {
    const id = Number(k);
    if (expiry === 1) out.set(id, 1);
    else if (expiry > now && out.get(id) !== 1) out.set(id, expiry);
  }
  return out;
}

type Pct = Pick<MountRow, 'life' | 'phyAttack' | 'magAttack' | 'phyDefense' | 'magDefense'>;

/** Percent bonuses while riding: the evolution row of the rank plus the worn skin (Go applyMountBonus used the rounded percents). */
export function mountBonuses(rank: Pct | undefined, dress: Pct | undefined): Bonuses {
  const b = emptyBonuses();
  const add = (p: Pct | undefined): void => {
    if (!p) return;
    const pairs: [keyof Bonuses['pct'], number][] = [
      ['maxHp', p.life], ['attack', p.phyAttack], ['magicAttack', p.magAttack], ['defense', p.phyDefense], ['magicDefense', p.magDefense],
    ];
    for (const [k, v] of pairs) if (v !== 0) b.pct[k] = (b.pct[k] ?? 0) + Math.round(v);
  };
  add(rank);
  add(dress);
  return b;
}
