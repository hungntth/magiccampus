// Pure PvP battle rules (M6 phase C): the two-sided board (attacker 'player' at slot 10 / pet 15, target 'enemy' at slot 0 / pet 5),
// the result from each viewer's side, the vitals floor at settle (no death or revive for PK) and who loses on a disconnect.
// The battle result is always stored from the ATTACKER's view (WIN = the attacker's side won).

import { BATTLE_PET_SLOT_OFFSET, BattleResult, PK_SLOTS, type BattleReport, type BattleStep } from '@mc/shared';
import type { Fighter, Side } from './battle.types';

/** The PvP board: every fighter re-slotted and re-sided; pets are optional. */
export function pvpBoard(attacker: Fighter, attackerPet: Fighter | undefined, target: Fighter, targetPet: Fighter | undefined): Map<number, Fighter> {
  const board = new Map<number, Fighter>();
  const put = (f: Fighter | undefined, slot: number, side: Side): void => {
    if (f) board.set(slot, { ...f, slot, side });
  };
  put(attacker, PK_SLOTS.attacker, 'player');
  put(attackerPet, PK_SLOTS.attackerPet, 'player');
  put(target, PK_SLOTS.target, 'enemy');
  put(targetPet, PK_SLOTS.targetPet, 'enemy');
  return board;
}

/** The result as the viewer on `side` should see it: the target (side 'enemy') sees WIN and LOSE swapped; a draw stays a draw. */
export function viewResult(pvp: boolean | undefined, side: Side, result: number): number {
  if (!pvp || side === 'player') return result;
  if (result === BattleResult.WIN) return BattleResult.LOSE;
  if (result === BattleResult.LOSE) return BattleResult.WIN;
  return result;
}

/** The side that lost, from the attacker-view result (null on a draw). */
export function loserSide(result: number): Side | null {
  if (result === BattleResult.WIN) return 'enemy';
  if (result === BattleResult.LOSE) return 'player';
  return null;
}

/** A disconnecting player loses (Go let the target "win" by quirk, not copied): the attacker leaving is a LOSE, the target leaving a WIN. */
export function leaveResult(leaverSide: Side): number {
  return leaverSide === 'player' ? BattleResult.LOSE : BattleResult.WIN;
}

/**
 * H5 has no death or revive for PK: every character leaves the battle with at least 1 HP (the loser at 1 HP when it went down).
 * Mutates the characters' hp and returns the slots of the loser's characters. A draw has no loser.
 */
export function applyPvpVitals(fighters: Iterable<Fighter>, result: number): number[] {
  const lost = loserSide(result);
  const losers: number[] = [];
  for (const f of fighters) {
    if (f.kind !== 'character') continue;
    f.hp = Math.max(1, f.hp);
    if (f.side === lost) losers.push(f.slot);
  }
  return losers;
}

/**
 * The end marker one viewer receives. PvE: the marker plus that member's own report. PvP: no report (nothing is granted) and the
 * result swapped for the target's client (the stored result is the attacker's view).
 */
export function endStepFor(pvp: boolean | undefined, side: Side, marker: BattleStep, report: BattleReport): BattleStep {
  if (!pvp) return { ...marker, report };
  return { ...marker, result: viewResult(true, side, marker.result ?? BattleResult.LOSE) };
}

/** M14 H system PvP: character slots of the attacking side (10..14, pets +5) and of the target side (0, 2, 1, 4, 3 as Go placed them). */
export const SYSTEM_SLOTS = { attacker: [10, 11, 12, 13, 14], target: [0, 2, 1, 4, 3] } as const;

export interface SideEntry {
  character: Fighter;
  pet?: Fighter;
}

/**
 * The board of a system PvP battle: up to 5 entries per side. The first side is the attacker ('player', slots 10..14, pets 15..19), the
 * second the target ('enemy', slots 0, 2, 1, 4, 3, pets +5). A duel is the one-entry case (slots 10 / 0, pets 15 / 5).
 */
export function systemBoard(attackers: readonly SideEntry[], targets: readonly SideEntry[]): Map<number, Fighter> {
  const board = new Map<number, Fighter>();
  const put = (f: Fighter | undefined, slot: number, side: Side): void => {
    if (f) board.set(slot, { ...f, slot, side });
  };
  attackers.forEach((e, i) => {
    put(e.character, SYSTEM_SLOTS.attacker[i], 'player');
    put(e.pet, SYSTEM_SLOTS.attacker[i] + BATTLE_PET_SLOT_OFFSET, 'player');
  });
  targets.forEach((e, i) => {
    put(e.character, SYSTEM_SLOTS.target[i], 'enemy');
    put(e.pet, SYSTEM_SLOTS.target[i] + BATTLE_PET_SLOT_OFFSET, 'enemy');
  });
  return board;
}

/** Living characters of one side (the 3v3 scorer decides wipes from these). */
export function aliveCharacters(fighters: Iterable<Fighter>, side: Side): number {
  let n = 0;
  for (const f of fighters) if (f.kind === 'character' && f.side === side && f.alive) n++;
  return n;
}

/** System PvP leaves everyone full: HP / MP back to their maximum for every character and pet. */
export function restoreFull(fighters: Iterable<Fighter>): void {
  for (const f of fighters) {
    f.hp = f.hpMax;
    f.mp = f.mpMax;
    f.alive = true;
  }
}
