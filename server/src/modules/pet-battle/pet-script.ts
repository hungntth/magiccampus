// Pure PPVE / pet-arena command script selection. It deliberately stops before skill casting:
// callers must resolve a selected skill through the normal combat skill catalogue.

import { BattleAction } from '@mc/shared';
import type { Fighter } from '../combat/battle.types';

/** Fixed-position rules are 50..54: the opposing pet at position 1..5 (battle slot % 10 == 5..9, AI_CONF_PANEL_U[15]). */
const FIXED_BASE = 50;
const FIXED_SLOTS = 5;
const FIXED_FIRST_POSITION = 5;

export interface PetScriptEntry {
  action: number;
  id: number;
  level: number;
  /** 1 random, 2 highest attack, 3 lowest HP, 4 fastest, 50..54 the opposing pet at position 1..5. */
  t: number;
}

/** Flash wire shape: an object keyed by the zero-based battle round. */
export type PetScript = Record<string, PetScriptEntry>;

export interface PetScriptChoice {
  action: number;
  skillId?: number;
  targetSlot: number;
}

function enemies(fighters: Iterable<Fighter>, own: Fighter): Fighter[] {
  return [...fighters].filter((f) => f.alive && f.side !== own.side);
}

/** Selects the command for a round. Missing / unlearned skills intentionally become a basic attack. */
export function selectPetScript(
  script: PetScript | undefined,
  round: number,
  own: Fighter,
  fighters: Iterable<Fighter>,
  rng: () => number,
): PetScriptChoice | null {
  const targets = enemies(fighters, own);
  if (targets.length === 0) return null;
  const rows = Object.keys(script ?? {}).sort((a, b) => Number(a) - Number(b)).map((key) => script![key]);
  const row = rows.length === 0 ? undefined : rows[(round - 1) % rows.length];
  const target = chooseTarget(row?.t ?? 1, targets, rng);
  if (!row || row.action !== BattleAction.SKILL || !own.skills?.includes(row.id)) {
    return { action: BattleAction.ATTACK, targetSlot: target.slot };
  }
  return { action: BattleAction.SKILL, skillId: row.id, targetSlot: target.slot };
}

/** Go scripted_pet.go scriptTarget: 1 random, 2 highest max(attack, magic attack), 3 lowest current HP, 4 fastest, 50 + k the opposing pet at position k + 1. */
function chooseTarget(rule: number, targets: Fighter[], rng: () => number): Fighter {
  const ordered = [...targets].sort((a, b) => a.slot - b.slot); // ties keep the lowest slot, like the participant order of the Go engine
  if (rule >= FIXED_BASE && rule < FIXED_BASE + FIXED_SLOTS) {
    const hit = ordered.find((f) => f.slot % 10 === FIXED_FIRST_POSITION + rule - FIXED_BASE);
    if (hit) return hit; // a dead or empty position falls back to a random target (below)
  }
  if (rule === 2) return best(ordered, (f) => Math.max(f.attack, f.magicAttack), true);
  if (rule === 3) return best(ordered, (f) => f.hp, false);
  if (rule === 4) return best(ordered, (f) => f.speed, true);
  return ordered[Math.min(ordered.length - 1, Math.floor(rng() * ordered.length))];
}

function best(list: Fighter[], score: (f: Fighter) => number, highest: boolean): Fighter {
  let pick = list[0];
  for (const f of list) if (highest ? score(f) > score(pick) : score(f) < score(pick)) pick = f;
  return pick;
}
