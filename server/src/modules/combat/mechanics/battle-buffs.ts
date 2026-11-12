// Battle buffs and statuses (M10 E2.0), port of Go domain/combat table_buff.go (stat deltas applied on landing and reverted
// on expiry), table_buff_props.go (flat-point props, immunity pseudo props 908-911), table_buff_dot.go / _hot.go (ticks),
// status_effect.go (control statuses, skip-turn, sleep wakes on hit), debuff.go (land chance) and control_immunity.go.
// State lives on the fighters (Fighter.buffs / statuses), so it survives between rounds with the Battle record.

import type { Fighter, Rng } from '../battle.types';
import { STATUS, type BuffDef, type BuffMod } from './npc-skills';

export interface ActiveBuff {
  id: number;
  expireAfter: number; // last round it is active (Go: applied round + rounds)
  appliedRound: number;
  deltas: Record<number, number>; // prop -> delta applied to the stat
  dot?: { def: NonNullable<BuffDef['dot']>; magic: number; attack: number };
  hot?: { def: NonNullable<BuffDef['hot']>; magic: number; attack: number };
  mpBurn?: number; // M13 G2 Pháp Lực Nhiên Thiêu: % of current MP lost at each turn start after the landing round
}

export interface ActiveStatus {
  type: number;
  duration: number;
  buffId: number;
  appliedRound: number;
  sourceSlot: number;
}

type StatKey =
  | 'hpMax' | 'attack' | 'magicAttack' | 'defense' | 'magicDefense' | 'hit' | 'dodge' | 'counter' | 'speed' | 'combo' | 'critical'
  | 'reduceHurt1' | 'reduceHurt2' | 'defy' | 'rebornRate' | 'resiCritical' | 'resiDefy' | 'enhPhyHurt' | 'enhMagicHurt'
  | 'immunePhys' | 'immuneMagic' | 'fullResistPhys' | 'fullResistMagic' | 'damageTaken' | 'reflectAll' | 'lifeSteal';

/**
 * H5-only pseudo prop for life steal (Go maps the text "X% sát thương chuyển hóa thành HP" to prop 41, but the seed rows that carry
 * prop 41 mean other things: Chiến Phách, Niết Bàn, Thần Chi Quỹ Tích). 901 / 903 are Go's pseudo props (no seed row uses them).
 */
export const PROP_LIFE_STEAL = 941;

/** GamePredef.BUFF_PROP_* → fighter stat (Go participantStatField / extraStatField). */
const PROP_STAT: Readonly<Record<number, StatKey>> = {
  1: 'hpMax', 4: 'attack', 5: 'magicAttack', 6: 'defense', 7: 'magicDefense', 8: 'hit', 9: 'dodge', 10: 'counter', 11: 'speed',
  12: 'combo', 13: 'critical', 15: 'reduceHurt1', 16: 'reduceHurt2', 14: 'defy', 34: 'rebornRate', 31: 'resiCritical',
  51: 'resiCritical', 61: 'resiDefy', 62: 'enhPhyHurt', 63: 'enhMagicHurt', 908: 'immunePhys', 909: 'immuneMagic',
  910: 'fullResistPhys', 911: 'fullResistMagic', 901: 'damageTaken', 903: 'reflectAll', [PROP_LIFE_STEAL]: 'lifeSteal',
};
/** Go isFlatPointProp: rates and pseudo props add their value whatever percent_flag says. */
const FLAT_PROPS = new Set([10, 12, 13, 14, 15, 16, 31, 34, 51, 61, 62, 63, 901, 903, 908, 909, 910, 911, PROP_LIFE_STEAL]);

/** Go DebuffKind: 0 generic, 1 dizzy, 2 confusion, 3 sleep, 4 poison, 5 rage, 6 light (petrify family). */
export const DEBUFF_KINDS = 7;
const DEBUFF_HIT: Readonly<Record<number, number>> = { 32: 0, 53: 1, 52: 2, 56: 3, 54: 4, 55: 5, 57: 6 };
const DEBUFF_RESIST: Readonly<Record<number, number>> = { 58: 0, 17: 1, 43: 1, 18: 2, 44: 2, 19: 3, 45: 3, 20: 4, 46: 4, 30: 5, 50: 5, 23: 6, 49: 6 };

export function debuffKindOf(status: number | undefined, dot: boolean): number {
  switch (status) {
    case STATUS.DIZZY: return 1;
    case STATUS.CONFUSION: return 2;
    case STATUS.SLEEP: return 3;
    case 40: case 50: return 4;
    case STATUS.REBELLION: case STATUS.TAUNT: return 5;
    case STATUS.LIGHT: case STATUS.STONE: case STATUS.ICE: case STATUS.BIND: return 6;
    default: return dot ? 4 : 0;
  }
}

const CONTROL = new Set<number>([10, 20, 30, 60, 70, 80, 90, 100, 110, 120]);
export const isControlStatus = (s: number): boolean => CONTROL.has(s);
const NO_ACT = new Set<number>([STATUS.DIZZY, STATUS.SLEEP, STATUS.LIGHT, STATUS.STONE, STATUS.BIND]);
const NO_SKILL = new Set<number>([...NO_ACT, STATUS.SILENCE, STATUS.CONFUSION]);
export const BOSS_HARD_CONTROL_RESIST = 150;

const stat = (f: Fighter, k: StatKey): number => f[k] ?? 0;

function delta(f: Fighter, mod: BuffMod): number {
  const k = PROP_STAT[mod.prop];
  if (FLAT_PROPS.has(mod.prop) || !mod.percent || !k) return Math.trunc(mod.value);
  f.statBase ??= {};
  const base = (f.statBase[k] ??= stat(f, k)); // Go SnapshotStatBase: percents scale the pre-buff value
  return Math.trunc((base * mod.value) / 100);
}

function addStat(f: Fighter, prop: number, d: number): void {
  const k = PROP_STAT[prop];
  if (k) {
    f[k] = stat(f, k) + d;
    return;
  }
  const hit = DEBUFF_HIT[prop];
  const res = DEBUFF_RESIST[prop];
  if (hit !== undefined) (f.debuffHit ??= new Array<number>(DEBUFF_KINDS).fill(0))[hit] += d;
  else if (res !== undefined) (f.debuffResist ??= new Array<number>(DEBUFF_KINDS).fill(0))[res] += d;
}

function revert(f: Fighter, b: ActiveBuff): void {
  for (const [prop, d] of Object.entries(b.deltas)) addStat(f, Number(prop), -d);
  if (f.hp > f.hpMax) f.hp = f.hpMax;
}

/** Go TableBuffManager.Apply: replaces the same id, applies every mod delta, captures the caster's stats for DOT / HOT. */
export function applyBuff(caster: Fighter, f: Fighter, def: BuffDef, round: number): void {
  removeBuff(f, def.id);
  const b: ActiveBuff = { id: def.id, appliedRound: round, expireAfter: round + Math.max(1, def.rounds), deltas: {} };
  for (const mod of def.mods) {
    const d = delta(f, mod);
    if (d === 0) continue;
    addStat(f, mod.prop, d);
    b.deltas[mod.prop] = (b.deltas[mod.prop] ?? 0) + d;
  }
  if (def.dot) b.dot = { def: def.dot, magic: caster.magicAttack, attack: caster.attack };
  if (def.hot) b.hot = { def: def.hot, magic: caster.magicAttack, attack: caster.attack };
  if (def.mpBurn) b.mpBurn = def.mpBurn;
  (f.buffs ??= []).push(b);
}

export function removeBuff(f: Fighter, id: number): void {
  if (!f.buffs) return;
  for (const b of f.buffs.filter((x) => x.id === id)) revert(f, b);
  f.buffs = f.buffs.filter((x) => x.id !== id);
}

/** Go TableBuffManager.Expire at round start: ids that ran out (reverted). */
export function expireBuffs(f: Fighter, round: number): number[] {
  if (!f.buffs?.length) return [];
  const out: number[] = [];
  f.buffs = f.buffs.filter((b) => {
    if (b.expireAfter >= round) return true;
    revert(f, b);
    if (b.id > 0) out.push(b.id);
    return false;
  });
  return out;
}

/** Go AddEffect / addEffectFrom: the same type refreshes (longer duration, latest caster). False = refused (immune). */
export function addStatus(f: Fighter, s: ActiveStatus, sourceSide: Fighter['side']): boolean {
  if (isControlStatus(s.type) && sourceSide !== f.side && (f.npc?.controlImmune || f.npc?.debuffImmune)) return false;
  const list = (f.statuses ??= []);
  const cur = list.find((x) => x.type === s.type);
  if (!cur) {
    list.push(s);
    return true;
  }
  cur.duration = Math.max(cur.duration, s.duration);
  cur.appliedRound = Math.max(cur.appliedRound, s.appliedRound);
  cur.sourceSlot = s.sourceSlot;
  if (s.buffId > 0) cur.buffId = s.buffId;
  return true;
}

export const hasStatus = (f: Fighter, type: number): boolean => !!f.statuses?.some((s) => s.type === type);
export const canUseSkill = (f: Fighter): boolean => !f.statuses?.some((s) => NO_SKILL.has(s.type));
export const speedOf = (f: Fighter): number => f.speed * (hasStatus(f, STATUS.ICE) ? 0.5 : 1);

/** Go ProcessTurnStartRound: whether the fighter can act, and the status icons that ran out (not ticked the round they land). */
export function tickStatuses(f: Fighter, round: number): { canAct: boolean; expired: number[] } {
  let canAct = true;
  const expired: number[] = [];
  f.statuses = (f.statuses ?? []).filter((s) => {
    if (NO_ACT.has(s.type)) canAct = false;
    if (s.appliedRound === round) return true;
    s.duration--;
    if (s.duration > 0) return true;
    if (s.buffId > 0) expired.push(s.buffId);
    return false;
  });
  return { canAct, expired };
}

/** Go WakeOnHit: a landed hit ends Mê Hồn (sleep); returns the buff ids to drop. */
export function wakeOnHit(f: Fighter): number[] {
  const sleep = f.statuses?.filter((s) => s.type === STATUS.SLEEP) ?? [];
  if (sleep.length === 0) return [];
  f.statuses = f.statuses!.filter((s) => s.type !== STATUS.SLEEP);
  return sleep.map((s) => s.buffId).filter((id) => id > 0);
}

/** Go DotDamage: the sum of every DOT tick (at least 1 each, caps from the caster's captured stats). */
export function dotDamage(f: Fighter): number {
  let total = 0;
  for (const b of f.buffs ?? []) {
    if (!b.dot) continue;
    const d = b.dot.def;
    let v = d.kind === 'magic' ? b.dot.magic * d.value : d.kind === 'maxHp' ? (f.hpMax * d.value) / 100
      : d.kind === 'curHp' ? (f.hp * d.value) / 100 : d.value;
    if (d.capAttack && b.dot.attack > 0) v = Math.min(v, b.dot.attack * d.capAttack);
    if (d.capMagic && b.dot.magic > 0) v = Math.min(v, b.dot.magic * d.capMagic);
    total += Math.max(1, Math.trunc(v));
  }
  return total;
}

/** Go HotAmounts: heal / MP ticks of buffs that landed in an earlier round. */
export function hotAmounts(f: Fighter, round: number): { hp: number; mp: number } {
  let hp = 0;
  let mp = 0;
  for (const b of f.buffs ?? []) {
    if (!b.hot || b.appliedRound >= round) continue;
    const h = b.hot.def;
    if (h.kind === 'maxMp') mp += Math.max(1, Math.trunc((f.mpMax * h.value) / 100));
    else {
      const v = h.kind === 'magic' ? (b.hot.magic * h.value) / 100 : h.kind === 'attack' ? (b.hot.attack * h.value) / 100
        : h.kind === 'maxHp' ? (f.hpMax * h.value) / 100 : h.value;
      hp += Math.max(1, Math.trunc(v));
    }
  }
  return { hp, mp };
}

/** Go clearDeathState: a dead fighter loses its buffs (reverted) and statuses; true when an icon may need clearing. */
export function clearOnDeath(f: Fighter): boolean {
  const had = (f.buffs?.length ?? 0) > 0 || (f.statuses?.length ?? 0) > 0;
  for (const b of f.buffs ?? []) revert(f, b);
  f.buffs = [];
  f.statuses = [];
  return had;
}

/** Go tableBuffBeneficial: no hostile (negative) mod, and something to give. */
export const beneficial = (def: BuffDef): boolean => def.mods.every((m) => m.value >= 0) && (def.mods.length > 0 || !!def.hot);
/** Go skillBuffHostile. */
export const hostile = (def: BuffDef): boolean => def.status !== undefined || !!def.dot || !beneficial(def);

/**
 * Go skillBuffChance: plain buff_rate on allies / beneficial buffs; on enemies the debuff accuracy / resist adjust it,
 * debuff-immune NPCs take nothing, and hard control on a boss row (or a minion with a control resist) follows
 * clamp((accuracy − resist) / 100, 0, 1) instead (control_immunity.go).
 */
export function landChance(a: Fighter, t: Fighter, def: BuffDef, rate: number): number {
  if (a.side === t.side || !hostile(def)) return rate;
  if (t.kind === 'creature' && t.npc?.debuffImmune) return 0;
  const kind = debuffKindOf(def.status, !!def.dot);
  const hit = (a.debuffHit?.[0] ?? 0) + (kind > 0 ? a.debuffHit?.[kind] ?? 0 : 0);
  if (def.status !== undefined && isControlStatus(def.status) && t.kind === 'creature') {
    if (t.npc?.controlImmune) return 0;
    const resist = t.bossFlag === 1 ? BOSS_HARD_CONTROL_RESIST : t.npc?.controlResist ?? 0;
    if (resist > 0) return Math.max(0, Math.min(1, (hit - resist) / 100));
  }
  const res = (t.debuffResist?.[0] ?? 0) + (kind > 0 ? t.debuffResist?.[kind] ?? 0 : 0);
  return Math.max(0, Math.min(1, rate + (hit - res) / 100));
}

export const rollLand = (a: Fighter, t: Fighter, def: BuffDef, rate: number, rng: Rng): boolean => rng() < landChance(a, t, def, rate);
