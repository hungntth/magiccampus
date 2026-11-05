// Revives and death rules (M10 E2.3), port of Go domain/combat npc_split.go roundReviveActions (same-round revives,
// nine boss floor 7 Atula), vdrl_death_rule.go (Battle.DeathRule asked after every death settle, before the victory
// check; selfReviveAction) and application/trials/vdrl_rules.go (guardedReviveRule floor 2, twinRule floor 4).
// Playback: an idle step {sSObj: {reborn: hp, buffClear: 1}} then the 12000 stand-up (relive_playback.go).

import { BattleBehavior, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { step } from '../strike';
import { clearOnDeath } from './battle-buffs';

const B = BattleBehavior;

/** Battle.deathRule: units to bring back right now (asked after each death settle, Go DeathRule.Revivals). */
export interface DeathRule {
  revivals(fighters: ReadonlyMap<number, Fighter>, round: number): Fighter[];
}

/** Go selfReviveAction + reviveParticipant: full HP, marks / buffs / statuses cleared; the reborn idle step and the 12000. */
export function selfRevive(f: Fighter): BattleStep[][] {
  clearOnDeath(f);
  f.deathMarks = 0;
  f.alive = true;
  f.hp = f.hpMax;
  return [[step(f.slot, -1, B.STAND, 0, { sSObj: { reborn: f.hp, buffClear: 1 } })], [step(f.slot, f.slot, B.RELIVE, 0)]];
}

/** Go roundReviveActions (round >= 2, any enemy alive): every dead enemy with RoundRevives left returns, −1. */
export function roundRevives(fighters: ReadonlyMap<number, Fighter>, round: number): BattleStep[][] {
  if (round <= 1) return [];
  const enemies = [...fighters.values()].filter((f) => f.side === 'enemy');
  if (!enemies.some((f) => f.alive)) return [];
  const out: BattleStep[][] = [];
  for (const f of enemies) {
    if (f.alive || (f.roundRevives ?? 0) <= 0 || f.hpMax <= 0) continue;
    f.roundRevives = (f.roundRevives ?? 0) - 1;
    out.push(...selfRevive(f));
  }
  return out;
}

/** Go applyDeathRule: revives what the rule returns (dead, with max HP). */
export function applyDeathRule(rule: DeathRule | undefined, fighters: ReadonlyMap<number, Fighter>, round: number): BattleStep[][] {
  if (!rule) return [];
  return rule.revivals(fighters, round).filter((f) => !f.alive && f.hpMax > 0).flatMap(selfRevive);
}

const enemyCreature = (f: Fighter, id: number): boolean => f.side === 'enemy' && f.kind === 'creature' && f.refId === id;

/** Go guardedReviveRule (VDRL floor 2): the boss comes back once while one of its guards lives. */
export function guardedRevive(boss: number, guards: readonly number[]): DeathRule {
  const used = new Set<number>();
  return {
    revivals(fighters) {
      const list = [...fighters.values()];
      if (!list.some((f) => f.alive && f.side === 'enemy' && guards.includes(f.refId))) return [];
      const out = list.filter((f) => enemyCreature(f, boss) && !f.alive && !used.has(f.slot));
      for (const f of out) used.add(f.slot);
      return out;
    },
  };
}

/** Go twinRule (VDRL floor 4): a dead twin returns `rounds` rounds after its death while the other twin lives. */
export function twinRevive(a: number, b: number, rounds: number): DeathRule {
  const died = new Map<number, number>();
  return {
    revivals(fighters, round) {
      const twins = [...fighters.values()].filter((f) => enemyCreature(f, a) || enemyCreature(f, b));
      const aliveA = twins.some((f) => f.refId === a && f.alive);
      const aliveB = twins.some((f) => f.refId === b && f.alive);
      for (const f of twins) {
        if (f.alive) died.delete(f.slot);
        else if (!died.has(f.slot)) died.set(f.slot, round);
      }
      return twins.filter((f) => {
        if (f.alive || !(f.refId === b ? aliveA : aliveB) || round - (died.get(f.slot) ?? round) < rounds) return false;
        died.delete(f.slot);
        return true;
      });
    },
  };
}
