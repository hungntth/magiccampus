// Hydra split (M10 E2.4, nine boss floor 6), port of Go domain/combat npc_split.go splitRegen: at round start (round >= 2)
// a host whose SummonPlan has Split > 0 revives at full HP when dead, its dead clones leave the board and Split × dead new
// clones come from the finite pool into free slots (summon playback). Win = host and every clone dead in one round; an
// empty pool stops the regeneration.

import type { BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { selfRevive } from './revive';
import { placeSummons, summonSlots, summonSteps } from './summon';

/** One host's regeneration; `removed` collects the dead clones taken off the board (they still count for rewards). */
export function splitRegen(fighters: Map<number, Fighter>, host: Fighter, removed: Fighter[]): BattleStep[][] {
  const plan = host.summon;
  if (!plan || plan.split <= 0 || plan.pending.length === 0) return [];
  const clone = plan.pending[0].refId;
  const others = [...fighters.values()].filter((f) => f.side === 'enemy' && f !== host);
  const dead = others.filter((f) => f.refId === clone && !f.alive);
  const anyAlive = host.alive || others.some((f) => f.alive);
  if (!anyAlive || (host.alive && dead.length === 0)) return [];
  const out: BattleStep[][] = host.alive ? [] : selfRevive(host);
  if (dead.length === 0) return out;
  for (const d of dead) {
    fighters.delete(d.slot);
    removed.push(d);
  }
  const units = placeSummons(fighters, plan, plan.split * dead.length, summonSlots(fighters, host, false), removed);
  if (units.length > 0) out.push(...summonSteps(host, units));
  return out;
}

/** Go splitRegenActions: round revives first (caller), then every split host. */
export function splitStage(fighters: Map<number, Fighter>, round: number, removed: Fighter[]): BattleStep[][] {
  if (round <= 1) return [];
  return [...fighters.values()].filter((f) => f.side === 'enemy' && (f.summon?.split ?? 0) > 0).flatMap((h) => splitRegen(fighters, h, removed));
}
