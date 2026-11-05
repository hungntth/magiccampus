// Headless pet battle runner for PPVE floors and the pet arena: the pure round engine (combat/round.ts, incl. the M10 NPC mechanics)
// driven by per-pet scripts, with no sessions and no BattleManager. Pets act on their cmdList (pet-script.ts); a pet without a script
// takes the engine's fallback (attack a random living enemy), creatures run on NPC AI. It produces the onBattleStart-shaped start
// payload and the play-list groups exactly as live battles emit them (all rounds concatenated, closed by one bare end marker so the
// client takes the replay-end branch instead of the battle report). Pure apart from mutating the fighters it clones.

import {
  BattleAction, BattleBehavior, BattleResult, PET_SIM_MAX_ROUNDS, PPVE_RESULT, type BattlePlayList, type BattleStart, type PpveResult,
} from '@mc/shared';
import type { Fighter, PlayerCommand, Rng } from '../combat/battle.types';
import { buildBattleStart } from '../combat/fighters';
import type { NpcEnv } from '../combat/mechanics/npc-ai';
import { NO_NPC_SKILLS, resolveRound } from '../combat/round';
import { planCast } from '../combat/skill-cast';
import type { SkillTemplate } from '../gamedata/skill-data';
import { selectPetScript, type PetScript, type PetScriptChoice } from './pet-script';

export interface PetSimInput {
  /** The board: every participant with its slot and side. Cloned, the caller's objects are not touched. */
  fighters: readonly Fighter[];
  /** Per-fighter script by slot (a missing or empty one = engine fallback). */
  scripts?: ReadonlyMap<number, PetScript>;
  skill?: (id: number) => SkillTemplate | undefined;
  rng: Rng;
  /** Default 24 (PPVE and arena). */
  roundLimit?: number;
  env?: NpcEnv;
  battleFieldId: string;
}

export interface HpShare {
  player: number;
  enemy: number;
}

export interface PetSimResult {
  /** From the player (attacker) side: 1 win, 2 loss, -1 nobody won within the round limit. */
  outcome: PpveResult;
  rounds: number;
  start: BattleStart;
  /** Every round's groups in order, closed by the bare end marker. */
  playList: BattlePlayList;
  /** Remaining HP / max HP per side at the end (the arena decides an unfinished fight with it). */
  hpShare: HpShare;
}

/** The bare end marker of a replay: no result and no report, so the client runs its replay-end path. */
export const REPLAY_END_GROUP = [{ sid: -1, tid: -1, bid: BattleBehavior.STAND, end: true }] as const;

/** A scripted choice as the round's command: a skill is planned against the pet's MP, a heal targets the caster, anything else is a basic attack. */
export function choiceToCommand(choice: PetScriptChoice, own: Fighter, skill: (id: number) => SkillTemplate | undefined): PlayerCommand {
  const basic: PlayerCommand = { action: BattleAction.ATTACK, targetSlot: choice.targetSlot };
  if (choice.action !== BattleAction.SKILL || choice.skillId === undefined) return basic;
  const tpl = skill(choice.skillId);
  if (!tpl) return basic;
  const plan = planCast(tpl, own.mp, own.mpMax);
  if (plan.kind !== 'cast') return basic; // passive / unsupported / not enough MP: basic attack
  return { action: BattleAction.ATTACK, targetSlot: plan.cast.category === 'heal' ? own.slot : choice.targetSlot, skill: plan.cast };
}

/** Commands of one round for every living scripted pet (round is 1-based; the script row is `(round - 1) % length`). */
export function scriptedCommands(
  board: ReadonlyMap<number, Fighter>, scripts: ReadonlyMap<number, PetScript>, round: number, rng: Rng,
  skill: (id: number) => SkillTemplate | undefined,
): Map<number, PlayerCommand> {
  const cmds = new Map<number, PlayerCommand>();
  for (const f of board.values()) {
    const script = scripts.get(f.slot);
    if (f.kind !== 'pet' || !f.alive || !script || Object.keys(script).length === 0) continue;
    const choice = selectPetScript(script, round, f, board.values(), rng);
    if (choice) cmds.set(f.slot, choiceToCommand(choice, f, skill));
  }
  return cmds;
}

export function hpShareOf(board: Iterable<Fighter>): HpShare {
  const sum = { player: { hp: 0, max: 0 }, enemy: { hp: 0, max: 0 } };
  for (const f of board) {
    const s = sum[f.side];
    s.hp += Math.max(0, f.hp);
    s.max += f.hpMax;
  }
  const share = (s: { hp: number; max: number }): number => (s.max > 0 ? s.hp / s.max : 0);
  return { player: share(sum.player), enemy: share(sum.enemy) };
}

/** An unfinished fight goes to the side with the higher remaining HP share; the attacker (player side) wins a tie. */
export function winnerByHp(share: HpShare): 'player' | 'enemy' {
  return share.player >= share.enemy ? 'player' : 'enemy';
}

export function simulatePetBattle(input: PetSimInput): PetSimResult {
  const board = new Map<number, Fighter>(input.fighters.map((f) => [f.slot, { ...f }]));
  const skill = input.skill ?? ((): undefined => undefined);
  const scripts = input.scripts ?? new Map<number, PetScript>();
  const limit = input.roundLimit ?? PET_SIM_MAX_ROUNDS;
  const start = buildBattleStart(input.battleFieldId, 0, board.values(), 0);
  const playList: BattlePlayList = [];
  let outcome: PpveResult = PPVE_RESULT.NOT_END;
  let rounds = 0;
  for (let round = 1; round <= limit; round++) {
    rounds = round;
    const cmds = scriptedCommands(board, scripts, round, input.rng, skill);
    // No roundCap: the limit is ours (a PPVE draw is "not ended", the arena decides by HP share).
    const out = resolveRound(board, cmds, round, input.rng, undefined, input.env ?? NO_NPC_SKILLS);
    const groups = out.ended ? out.groups.slice(0, -1) : out.groups; // the engine's end marker carries a result: replaced below
    playList.push(...groups);
    if (out.ended) {
      outcome = out.result === BattleResult.WIN ? PPVE_RESULT.WIN : PPVE_RESULT.LOSE;
      break;
    }
  }
  playList.push([...REPLAY_END_GROUP]);
  return { outcome, rounds, start, playList, hpShare: hpShareOf(board.values()) };
}
