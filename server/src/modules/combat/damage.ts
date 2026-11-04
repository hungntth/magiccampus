// Damage resolution (legacy domain/combat/damage.go V1 formula, a Go construction we adopt as our rule). Pure and
// deterministic given the injected RNG. H5 deviation: the position modifier is 1.0 (Go's x0.7 on every melee hit was an accident).

import type { CombatStats, Rng } from './battle.types';

export const DMG = {
  MAX_DODGE: 0.5, MAX_CRIT: 0.5, MAX_REDUCE: 0.75, MAX_RESI_DEFY: 0.8, MAX_COMBO: 0.25, MAX_COUNTER: 0.3,
  COMBO_MULT: 0.6, COUNTER_MULT: 0.5, BASE_CRIT_DMG: 150,
} as const;

export interface SkillSpec {
  magic: boolean;
  mult: number;
  base: number;
}

/** Skill 1001 as the Go adapter resolves it: base 10, mult 1.0, physical melee. */
export const BASIC_ATTACK: SkillSpec = { magic: false, mult: 1, base: 10 };
/** Counter strike (turn_builder.go): base 5, mult 0.5. */
export const COUNTER_ATTACK: SkillSpec = { magic: false, mult: DMG.COUNTER_MULT, base: 5 };
/** Combo follow-up: the same strike at 60 % of base and multiplier. */
export const comboAttack = (sk: SkillSpec): SkillSpec => ({ ...sk, mult: sk.mult * DMG.COMBO_MULT, base: sk.base * DMG.COMBO_MULT });

export interface HitResult {
  miss: boolean;
  damage: number;
  crit: boolean;
}

export interface HitActor extends CombatStats {
  level: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** One strike. `defending` halves the final damage (truncated, so it can reach 0). */
export function resolveHit(a: HitActor, d: HitActor, sk: SkillSpec, defending: boolean, rng: Rng): HitResult {
  const dodge = clamp((d.dodge - a.hit) / 100, 0, DMG.MAX_DODGE);
  if (dodge > 0 && rng() < dodge) return { miss: true, damage: 0, crit: false };

  let atk = (sk.magic ? a.magicAttack : a.attack) * sk.mult + sk.base;
  atk *= 1 + a.level * 0.02;
  const pen = ((sk.magic ? a.praMagDef : a.praDef) / 100) * (1 - clamp(d.resiDefy / 100, 0, DMG.MAX_RESI_DEFY));
  const def = Math.max(0, (sk.magic ? d.magicDefense : d.defense) * (1 - pen));
  const c = 300 + a.level * 5; // attacker level, as in Go
  let dmg = atk * (c / (c + def));
  dmg *= 1 + (sk.magic ? a.enhMagicHurt : a.enhPhyHurt) / 100;
  dmg *= 1 - clamp((sk.magic ? d.reduceHurt2 : d.reduceHurt1) / 100, 0, DMG.MAX_REDUCE);

  const critChance = clamp(a.critical / 100 - d.resiCritical / 100, 0, DMG.MAX_CRIT);
  const crit = critChance > 0 && rng() < critChance;
  if (crit) {
    const extra = Math.max(0, a.criticalDmg >= DMG.BASE_CRIT_DMG ? a.criticalDmg - DMG.BASE_CRIT_DMG : a.criticalDmg);
    dmg *= 1.5 * (1 + extra / 100);
  }
  dmg = Math.max(1, dmg);
  dmg *= 0.9 + rng() * 0.2; // elements are not used in M2 (all neutral)
  let out = Math.max(1, Math.round(dmg)); // position modifier is 1.0 (H5)
  if (defending) out = Math.trunc(out / 2);
  return { miss: false, damage: out, crit };
}

/** Chance of a second strike after a hit that leaves the target alive (combo, capped at 25 %). */
export const comboChance = (a: CombatStats): number => clamp(a.combo / 100, 0, DMG.MAX_COMBO);
/** Chance the defender strikes back after being hit (counter, capped at 30 %). */
export const counterChance = (d: CombatStats): number => clamp(d.counter / 100, 0, DMG.MAX_COUNTER);

/** Heal skill (Go executeHealSkill): trunc((base + magAtk * mult) * (1 + level * 0.01) * [0.9, 1.1]). */
export function healAmount(a: HitActor, sk: SkillSpec, rng: Rng): number {
  return Math.max(0, Math.trunc((sk.base + a.magicAttack * sk.mult) * (1 + a.level * 0.01) * (0.9 + rng() * 0.2)));
}
