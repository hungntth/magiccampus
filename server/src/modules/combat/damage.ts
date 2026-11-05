// Damage resolution: port of the current Go formula (domain/combat/damage.go CalculateDamageWithAccuracy +
// CalculateDamageWithPosition, dodge_chance.go, evasion_rule.go, level_gap.go; M10 E2.-1, replacing M2's V1). Pure and
// deterministic given the injected RNG. Order: melee dodge → base (× NPC level bonus) → XPN (defy) → Miễn Giảm 100 % resist →
// defence (atk / (atk + def / 4)) → enhance → Miễn Giảm → Giảm ST Cuối (75 % cap) → crit ((base 200 | 250 Xạ Thủ) + bonus) →
// floor 1 → element → 10-level gap → variance → round → position (main hit only) → defend halves.
// Skill damage keeps the exp_skill / dex_skill base of the cast (CORE_LOOP decision 4).

import type { CombatStats, Rng } from './battle.types';

export const DMG = {
  MAX_DODGE: 0.5, DODGE_HIT_WEIGHT: 9, MAX_CRIT: 1, MAX_FINAL_REDUCE: 0.75, MAX_MIEN_GIAM: 1, MAX_DEFY: 1,
  MAX_COMBO: 1, MAX_COUNTER: 1, MAX_COUNTER_CHAIN: 5, MAX_COMBO_HITS: 11, COMBO_MULT: 0.6, COUNTER_MULT: 0.5,
  BASE_CRIT_DMG: 200, SHOOTER_CRIT_DMG: 250, HEAL_CRIT_DMG: 150, CLASS_SHOOTER: 4, DEFENSE_DIVISOR: 4,
  NPC_DAMAGE_LEVEL_BONUS: 0.02, NPC_HEAL_LEVEL_BONUS: 0.01, RESIST_REDUCE_HURT: 100, LEVEL_GAP: 10, LEVEL_GAP_SCALE: 0.2,
  FRONT_ROW_BONUS: 1.1, BACK_ROW_REDUCTION: 0.9, MELEE_BACK_ROW_PENALTY: 0.7, RANGED_FRONT_ROW_PENALTY: 0.9,
} as const;

export interface SkillSpec {
  magic: boolean;
  mult: number;
  base: number;
  ranged?: boolean; // range > 1: no dodge roll, ranged position rules
}

/** Skill 1001 as the Go adapter resolves it: base 10, mult 1.0, physical melee. */
export const BASIC_ATTACK: SkillSpec = { magic: false, mult: 1, base: 10 };
/** Counter strike (Go counterSkillTemplate): base 5, mult 0.5. */
export const COUNTER_ATTACK: SkillSpec = { magic: false, mult: DMG.COUNTER_MULT, base: 5 };
/** Combo follow-up (Go buildComboActions): the same strike at 60 % of base and multiplier. */
export const comboAttack = (sk: SkillSpec): SkillSpec => ({ ...sk, mult: sk.mult * DMG.COMBO_MULT, base: Math.trunc(sk.base * DMG.COMBO_MULT) });

export interface HitResult {
  miss: boolean;
  resisted?: boolean; // Miễn Giảm >= 100 % without XPN ("Kháng cự"); counts as a miss for damage
  defy?: boolean; // XPN proc
  damage: number;
  crit: boolean;
}

export interface HitActor extends CombatStats {
  level: number;
  slot?: number; // battle position (Go Position), used by the position modifier
  side?: 'player' | 'enemy';
  kind?: 'character' | 'creature' | 'pet';
  classId?: number;
  element?: number; // 0 Vô … 6 Hỏa
}

export interface HitOpts {
  /** Main hit of an action (Go CalculateDamageWithPosition); combo / counter hits skip the position modifier. */
  position?: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const isNpc = (f: HitActor): boolean => f.kind === 'creature';

/** Go DodgeChance: proportional, 0 without dodge, MAX at hit 0. */
export function dodgeChance(dodge: number, hit: number): number {
  if (dodge <= 0) return 0;
  if (hit <= 0) return DMG.MAX_DODGE;
  return (DMG.MAX_DODGE * dodge) / (dodge + DMG.DODGE_HIT_WEIGHT * hit);
}

/** Go defenseReduction: atk / (atk + def / 4); the level constant only for a zero attack stat. */
export function defenseReduction(attack: number, defense: number, level: number): number {
  if (defense <= 0) return 1;
  const weighted = defense / DMG.DEFENSE_DIVISOR;
  if (attack <= 0) {
    const c = 300 + level * 5;
    return c / (c + weighted);
  }
  return attack / (attack + weighted);
}

/** Crit multiplier: (class base + bonus) / 100; `criticalDmg` holds base + bonus (characters) or the bonus alone. */
export function critMultiplier(a: Pick<HitActor, 'criticalDmg' | 'classId'>, base?: number): number {
  const b = base ?? (a.classId === DMG.CLASS_SHOOTER ? DMG.SHOOTER_CRIT_DMG : DMG.BASE_CRIT_DMG);
  const bonus = a.criticalDmg >= DMG.BASE_CRIT_DMG ? a.criticalDmg - DMG.BASE_CRIT_DMG : a.criticalDmg;
  return (b + bonus) / 100;
}

const ELEMENT_ADVANTAGE: Readonly<Record<string, number>> = {
  '3,4': 1.25, '4,5': 1.25, '5,6': 1.25, '6,3': 1.25, '4,3': 0.8, '5,4': 0.8, '6,5': 0.8, '3,6': 0.8,
  '1,2': 1.5, '2,1': 0.5, '2,3': 1.1, '2,4': 1.1, '2,5': 1.1, '2,6': 1.1, '1,3': 0.9, '1,4': 0.9, '1,5': 0.9, '1,6': 0.9,
};

/** Go getElementModifier (owner 2026-10-30 table). */
export function elementModifier(attacker: number, defender: number): number {
  if (attacker === defender) return 1;
  if (attacker === 0) return 0.9;
  if (defender === 0) return 1.1;
  return ELEMENT_ADVANTAGE[`${attacker},${defender}`] ?? 1;
}

/** Go LevelGapDamageScale: a player-side non-NPC attacker more than 10 levels below an enemy NPC deals × 0.2. */
export function levelGapScale(a: HitActor, d: HitActor): number {
  if (isNpc(a) || a.side === 'enemy' || !isNpc(d) || d.side === 'player') return 1;
  return d.level - a.level > DMG.LEVEL_GAP ? DMG.LEVEL_GAP_SCALE : 1;
}

/** Go GetRowForSide over the BattleGridCoords table: 0 front, 1 middle, 2 back. */
export function rowOf(slot: number, side: 'player' | 'enemy'): number {
  const y = slot < 5 ? 0 : slot < 10 ? 1 : slot < 15 ? 3 : 2;
  if (side === 'player') return y === 0 ? 0 : y >= 3 ? 2 : 1;
  return y === 3 ? 0 : y === 0 ? 2 : 1;
}

/** Go getPositionModifier (front attacker × 1.1; back-row target × 0.7 melee / × 0.9 ranged; ranged on front × 0.9). */
export function positionModifier(a: HitActor, d: HitActor, sk: SkillSpec): number {
  if (a.slot === undefined || d.slot === undefined || !a.side || !d.side) return 1;
  let m = 1;
  if (rowOf(a.slot, a.side) === 0) m *= DMG.FRONT_ROW_BONUS;
  const dRow = rowOf(d.slot, d.side);
  if (dRow === 2) m *= sk.ranged ? DMG.BACK_ROW_REDUCTION : DMG.MELEE_BACK_ROW_PENALTY;
  if (sk.ranged && dRow === 0) m *= DMG.RANGED_FRONT_ROW_PENALTY;
  return m;
}

/** One strike. `defending` halves the final damage (truncated, so it can reach 0). */
export function resolveHit(a: HitActor, d: HitActor, sk: SkillSpec, defending: boolean, rng: Rng, opts: HitOpts = {}): HitResult {
  if (!sk.ranged) {
    const dodge = clamp(dodgeChance(d.dodge, a.hit), 0, DMG.MAX_DODGE);
    if (rng() < dodge) return { miss: true, damage: 0, crit: false };
  }
  const magic = sk.magic;
  // M10 E2.6 buff props 910 / 911 (full Miễn Giảm): every hit of that kind is resisted, XPN included (Go hitFullyResisted).
  if ((magic ? d.fullResistMagic ?? 0 : d.fullResistPhys ?? 0) > 0) return { miss: true, resisted: true, damage: 0, crit: false };
  const attackStat = magic ? a.magicAttack : a.attack;
  let base = attackStat * sk.mult + sk.base;
  if (isNpc(a)) base *= 1 + a.level * DMG.NPC_DAMAGE_LEVEL_BONUS;

  const defy = rng() < clamp(((a.defy ?? 0) - d.resiDefy) / 100, 0, DMG.MAX_DEFY);
  const mienGiam = magic ? d.reduceHurt2 : d.reduceHurt1;
  if (!defy && mienGiam >= DMG.RESIST_REDUCE_HURT) return { miss: true, resisted: true, damage: 0, crit: false };

  let dmg = base * defenseReduction(attackStat, defy ? 0 : magic ? d.magicDefense : d.defense, a.level);
  dmg *= 1 + (magic ? a.enhMagicHurt : a.enhPhyHurt) / 100;
  if (!defy) dmg *= 1 - clamp(mienGiam / 100, 0, DMG.MAX_MIEN_GIAM);
  dmg *= 1 - clamp((magic ? d.praMagDef : d.praDef) / 100, 0, DMG.MAX_FINAL_REDUCE); // Giảm ST Cuối, also on XPN

  const crit = rng() < clamp((a.critical - d.resiCritical) / 100, 0, DMG.MAX_CRIT);
  if (crit) dmg *= critMultiplier(a);
  dmg = Math.max(1, dmg);
  dmg *= elementModifier(a.element ?? 0, d.element ?? 0);
  if (!defy) dmg *= levelGapScale(a, d);
  dmg *= 0.9 + rng() * 0.2;
  let out = Math.round(dmg);
  if (opts.position) out = Math.max(1, Math.trunc(out * positionModifier(a, d, sk)));
  if (defending) out = Math.trunc(out / 2);
  // M10 E2.6 buff props 908 / 909 (immunity): the hit lands for 0 (Go absorbIncoming).
  if ((magic ? d.immuneMagic ?? 0 : d.immunePhys ?? 0) > 0) out = 0;
  return { miss: false, damage: out, crit, ...(defy ? { defy: true } : {}) };
}

/** Single extra hit chance (skills; Go CheckCombo, cap 100 %). */
export const comboChance = (a: CombatStats): number => clamp(a.combo / 100, 0, DMG.MAX_COMBO);
/** Chance the defender strikes back (Go CounterChance, cap 100 % since 2026-11-01). */
export const counterChance = (d: CombatStats): number => clamp(d.counter / 100, 0, DMG.MAX_COUNTER);

/** Go ComboExtraHits: basic-attack chain, each extra hit at combo / 100 until a roll fails, at most 10; combo >= 100 chains fully. */
export function comboExtraHits(a: CombatStats, rng: Rng): number {
  const max = DMG.MAX_COMBO_HITS - 1;
  if (a.combo >= 100) return max;
  const chance = clamp(a.combo / 100, 0, 1);
  let extra = 0;
  while (extra < max && rng() < chance) extra++;
  return extra;
}

/** Heal skill (Go CalculateHealingWithCrit, base path): (base + magAtk × mult) × NPC level bonus × [0.9, 1.1], crit × 1.5 + bonus. */
export function healAmount(a: HitActor, sk: SkillSpec, rng: Rng): number {
  let heal = sk.base + a.magicAttack * sk.mult;
  if (isNpc(a)) heal *= 1 + a.level * DMG.NPC_HEAL_LEVEL_BONUS;
  heal *= 0.9 + rng() * 0.2;
  if (rng() < clamp(a.critical / 100, 0, DMG.MAX_CRIT)) heal *= critMultiplier(a, DMG.HEAL_CRIT_DMG);
  return Math.max(0, Math.trunc(heal));
}

/** Go ResolveDeathImmune (Miễn Tử): a lethal hit leaves 1 HP once per battle at (rebornRate − breakReborn) / 100. */
export function deathImmune(a: Pick<HitActor, 'breakReborn'> | undefined, d: HitActor & { hp: number; deathImmuneUsed?: boolean }, damage: number, rng: Rng): number | null {
  if (d.deathImmuneUsed || damage < d.hp || d.hp <= 0) return null;
  const chance = clamp(((d.rebornRate ?? 0) - (a?.breakReborn ?? 0)) / 100, 0, 1);
  if (chance <= 0 || rng() >= chance) return null;
  d.deathImmuneUsed = true;
  return d.hp - 1;
}
