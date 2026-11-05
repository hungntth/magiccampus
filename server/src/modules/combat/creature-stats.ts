// Creature -> combat stats (legacy application/combat/npc_stats.go + domain/stats/profile.go; Go-invented numbers we adopt).
// Pure: the template comes from GameDataService, the player's level only feeds the encounter level cap.

import type { CreatureTemplate } from '../gamedata/combat-data';
import type { CombatStats } from './battle.types';

export interface CreatureCombat extends CombatStats {
  level: number;
  hpMax: number;
  mpMax: number;
}

const trunc = Math.trunc;

/** Raw attribute -> effective value: (att + att * apt / 1000) * scale, scale = max(1, grow_base). */
const eff = (att: number, apt: number, scale: number): number => (att + (att * apt) / 1000) * scale;

/** Stats of a creature template at `level` (npc_stats.go CalculateCreatureStats + level scaling + life percent). */
export function creatureStatsAt(c: CreatureTemplate, level: number): CreatureCombat {
  const scale = Math.max(1, c.growBase);
  const S = eff(c.att.str, c.apt.str, scale);
  const A = eff(c.att.agi, c.apt.agi, scale);
  const T = eff(c.att.sta, c.apt.sta, scale);
  const I = eff(c.att.int, c.apt.int, scale);
  const E = eff(c.att.eng, c.apt.eng, scale);
  const hpMult = Math.max(1, (level * level * level) / 1000);
  const dmgMult = Math.max(1, level / 10);
  let hpMax = trunc((50 + trunc(T * 8.5)) * hpMult);
  const mpMax = trunc((20 + trunc(I * 4.07) + trunc(E * 5.75)) * hpMult);
  hpMax = Math.max(1, trunc((hpMax * c.life) / 10000));
  return {
    level,
    hpMax,
    mpMax,
    attack: trunc((trunc(S * 1.9) + trunc(A * 0.5)) * dmgMult),
    defense: trunc((trunc(T * 2.57) + trunc(A * 0.85)) * dmgMult),
    magicAttack: trunc((trunc(I * 2.0) + trunc(E * 0.6)) * dmgMult),
    magicDefense: trunc((trunc(I * 2.71) + trunc(E * 4.6)) * dmgMult),
    hit: 100 + trunc(S * 0.08) + trunc(A * 0.05) + c.propHit,
    dodge: trunc(A * 0.11) + c.propDodge,
    speed: 100 + trunc(A * 1.7) + c.propSpeed,
    critical: trunc(A * 0.1) + c.propCritical,
    criticalDmg: 200, // Go npc_stats.go: BaseCriticalDamage (bonus 0, crit × 2.0)
    combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0,
    reduceHurt1: 0, reduceHurt2: 0, enhPhyHurt: 0, enhMagicHurt: 0,
  };
}

/** Level a spawn row fights at: row level, else use_lv, else map level, else 10 (encounters.go:157-171). */
export function spawnLevel(rowLevel: number, useLevel: number, mapLevel: number): number {
  if (rowLevel > 0) return rowLevel;
  if (useLevel > 0) return useLevel;
  if (mapLevel > 0) return mapLevel;
  return 10;
}

/**
 * Level cap for random encounters (npc_stats.go:39-66): a non-boss creature above playerLevel + 5 is scaled down to that
 * level, its stats multiplied by lvl / level with Go's floors. Bosses are never capped.
 */
export function capToPlayer(s: CreatureCombat, playerLevel: number, boss: boolean): CreatureCombat {
  const max = playerLevel + 5;
  if (boss || s.level <= max) return s;
  const lvl = max;
  const r = lvl / s.level;
  const sc = (v: number, floor: number): number => Math.max(floor, trunc(v * r));
  return {
    ...s,
    level: lvl,
    hpMax: Math.max(100 + lvl * 20, trunc(s.hpMax * r)),
    mpMax: Math.max(50 + lvl * 10, trunc(s.mpMax * r)),
    attack: sc(s.attack, 20 + lvl * 3),
    defense: sc(s.defense, 10 + lvl * 2),
    magicAttack: sc(s.magicAttack, 15 + lvl * 2),
    magicDefense: sc(s.magicDefense, 10 + lvl),
    speed: 100 + Math.max(lvl, trunc((s.speed - 100) * r)),
    hit: 100 + trunc((s.hit - 100) * r),
    dodge: s.dodge > 0 ? Math.max(1, trunc(s.dodge * r)) : 0,
    critical: s.critical > 0 ? Math.max(1, trunc(s.critical * r)) : 0,
  };
}

/** applyTemplateStats fallbacks for zero stats (npc_stats.go:167-229). */
export function withDefaults(s: CreatureCombat): CreatureCombat {
  const l = s.level;
  const pos = (v: number, d: number): number => (v > 0 ? v : d);
  return {
    ...s,
    hpMax: pos(s.hpMax, 100 + l * 20),
    mpMax: pos(s.mpMax, 50 + l * 10),
    attack: pos(s.attack, 20 + l * 3),
    defense: pos(s.defense, 10 + l * 2),
    magicAttack: pos(s.magicAttack, 15 + l * 2),
    magicDefense: pos(s.magicDefense, 10 + l),
    speed: pos(s.speed, 100 + l),
    hit: pos(s.hit, 100),
    dodge: pos(s.dodge, 5),
    critical: pos(s.critical, 5),
  };
}
