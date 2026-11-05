// Mid-battle summons (M10 E2.2), port of Go domain/combat npc_summon.go: a SummonPlan on an enemy NPC is due from
// StartRound every Every rounds while units are pending and a slot is free (front row 0,2,1,4,3, then 5,7,6,9,8; a Refill
// plan also reuses dead non-caster slots, the corpse leaves the board). The summon costs the caster's turn; nothing
// placeable = basic attack. Playback (buildNPCSummonActions): caster bid 16000 with type 2 + creList, then one 18000 per
// new unit, then the caster's 10100. New units act from the next round and cannot summon.

import { BATTLE_ENEMY_SLOTS, BattleBehavior, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { toParticipant } from '../fighters';
import { step } from '../strike';

const B = BattleBehavior;
export const ENEMY_PET_SLOTS: readonly number[] = [5, 7, 6, 9, 8];
export const SUMMON_TYPE_CREATURES = 2;

export interface SummonPlan {
  startRound: number;
  perRound: number; // 0 = never through the AI (Hydra split spends its pool at round start)
  every: number;
  refill: boolean;
  split: number; // E2.4 clones per dead unit
  pending: Fighter[]; // units waiting (built at battle start with the line-up stats)
}

/** Go SummonPlan.Due. */
export function summonDue(p: SummonPlan | undefined, round: number): boolean {
  if (!p || p.pending.length === 0 || p.perRound <= 0) return false;
  const start = Math.max(1, p.startRound);
  return round >= start && (round - start) % Math.max(1, p.every) === 0;
}

/** Go FreeEnemySlots + summonSlots: empty enemy slots in battle-start order, then (Refill) dead non-caster slots. */
export function summonSlots(fighters: ReadonlyMap<number, Fighter>, caster: Fighter | undefined, refill: boolean): number[] {
  const order = [...BATTLE_ENEMY_SLOTS, ...ENEMY_PET_SLOTS];
  const free = order.filter((s) => !fighters.has(s));
  if (!refill || !caster) return free;
  return [...free, ...order.filter((s) => s !== caster.slot && fighters.get(s)?.alive === false && fighters.get(s)?.side === 'enemy')];
}

/**
 * Go placeSummons: moves up to `want` pending units into `slots` (full HP, enemy side). A corpse a unit replaces is pushed
 * to `removed` (its rewards still count, decision 14).
 */
export function placeSummons(fighters: Map<number, Fighter>, plan: SummonPlan, want: number, slots: readonly number[], removed: Fighter[]): Fighter[] {
  const n = Math.min(want, plan.pending.length, slots.length);
  const out: Fighter[] = [];
  for (let i = 0; i < n; i++) {
    const unit = plan.pending.shift()!;
    const old = fighters.get(slots[i]);
    if (old) removed.push(old);
    unit.slot = slots[i];
    unit.side = 'enemy';
    unit.alive = true;
    if (unit.hp <= 0) unit.hp = unit.hpMax;
    delete unit.summon; // a summoned unit cannot summon (Go AC/npc_summon.go)
    fighters.set(unit.slot, unit);
    out.push(unit);
  }
  return out;
}

/** Go buildNPCSummonActions: [16000 + creList], [18000 per unit], [10100]. */
export function summonSteps(caster: Fighter, units: readonly Fighter[]): BattleStep[][] {
  return [
    [step(caster.slot, -1, B.SUMMON, 500, { type: SUMMON_TYPE_CREATURES, creList: units.map(toParticipant) })],
    units.map((u) => step(u.slot, -1, B.SUMMONED, 0)),
    [step(caster.slot, caster.slot, B.TURNBACK, 300)],
  ];
}

/** Go executeSummon: places the due units; false when nothing could be placed (the caster basic-attacks instead). */
export function executeSummon(fighters: Map<number, Fighter>, caster: Fighter, groups: BattleStep[][], removed: Fighter[]): boolean {
  const plan = caster.summon;
  if (!plan) return false;
  const units = placeSummons(fighters, plan, plan.perRound, summonSlots(fighters, caster, plan.refill), removed);
  if (units.length === 0) return false;
  groups.push(...summonSteps(caster, units));
  return true;
}
