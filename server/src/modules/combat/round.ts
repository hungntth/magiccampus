// One battle round (legacy turn_processor.go + turn_builder.go): every living fighter acts once in speed order (random ties),
// the enemies always basic-attack a random living player-side fighter, the victory check runs after each actor.
// Pure apart from mutating the fighters (hp / alive / mp); builds the onBattlePlayList groups. A SKILL cast (cmd.skill) spends
// MP first; melee skills use the attack sequence, ranged / magic cast in place (bid 7), heals target the caster. Strike
// sequences (combo chain, counter chain, Miễn Tử, miss text) live in strike.ts.

import { BattleAction, BattleBehavior, BattleResult, catchRate, type BattlePlayList, type BattleStep } from '@mc/shared';
import type { Fighter, PlayerCommand, Rng } from './battle.types';
import { BASIC_ATTACK } from './damage';
import { canUseSkill, speedOf } from './mechanics/battle-buffs';
import { npcAct, type CastCtx } from './mechanics/npc-cast';
import { restoreBossMana, selectNpcCommand, type NpcCommand, type NpcEnv } from './mechanics/npc-ai';
import { STATUS } from './mechanics/npc-skills';
import { doomAtTurnStart } from './mechanics/death-mark';
import { doomsdaySteps } from './mechanics/doomsday';
import { applyDeathRule, roundRevives, type DeathRule } from './mechanics/revive';
import { splitStage } from './mechanics/split';
import { roundStartExpiry, turnStart } from './mechanics/turn-start';
import { castInPlace, healSelf, meleeAttack, step, type StrikeCtx } from './strike';

export const MAX_ROUNDS = 30;
const B = BattleBehavior;

export interface RoundOutcome {
  groups: BattlePlayList;
  ended: boolean;
  result: number; // BattleResult, valid when ended
  removed: Fighter[]; // M10 E2.2 / E2.4 corpses taken off the board this round (Battle.fallen)
}

const alive = (fs: Iterable<Fighter>, side: Fighter['side']): Fighter[] => [...fs].filter((f) => f.alive && f.side === side);

/** Winner of the board right now: null while both sides live. Both dead counts as an enemy win (Go). */
export function checkVictory(fighters: Iterable<Fighter>): number | null {
  const list = [...fighters];
  if (alive(list, 'player').length === 0) return BattleResult.LOSE;
  if (alive(list, 'enemy').length === 0) return BattleResult.WIN;
  return null;
}

/** Descending speed (Đóng Băng halves it), ties broken by an RNG draw per fighter. */
export function actOrder(fighters: readonly Fighter[], rng: Rng): Fighter[] {
  return fighters
    .filter((f) => f.alive)
    .map((f) => ({ f, tie: rng() }))
    .sort((a, b) => speedOf(b.f) - speedOf(a.f) || a.tie - b.tie)
    .map((x) => x.f);
}

type Ctx = StrikeCtx;

/** The player's attack or skill cast; a cast spends MP first and tags its first step with the banner and the new MP. */
function playerStrike(ctx: Ctx, p: Fighter, cmd: PlayerCommand): void {
  const target = ctx.fighters.get(cmd.targetSlot);
  const cast = cmd.skill;
  if (!cast || !canUseSkill(p)) return meleeAttack(ctx, p, target, BASIC_ATTACK); // silenced / confused: basic attack
  p.mp = Math.max(0, p.mp - cast.mpCost);
  const start = ctx.groups.length;
  if (cast.category === 'melee') meleeAttack(ctx, p, target, cast.spec, false);
  else if (cast.category === 'heal') healSelf(ctx, p, cast);
  else castInPlace(ctx, p, target, cast.spec);
  const first = ctx.groups[start]?.[0];
  if (first) first.sSObj = { skill: cast.name, uMp: p.mp };
}

/**
 * CATCH (-70, Go buildCatchActions): the rate comes from the target's HP now and the gates baked into the command. Success: the
 * creature dies with behaviour 10160 and is marked caught (it still counts as killed; the pet is created at settle). Failure: a
 * cast step whose sSObj.catchF tells the catcher the rate. A target that already died is a cast at nothing.
 */
function catchAct(ctx: Ctx, p: Fighter, cmd: PlayerCommand): void {
  const t = ctx.fighters.get(cmd.targetSlot);
  if (!t || !t.alive || t.side !== 'enemy' || p.kind !== 'character') {
    ctx.groups.push([step(p.slot, -1, B.MAGIC, 400, { tSObj: {} })], [step(p.slot, p.slot, B.TURNBACK, 300)]);
    return;
  }
  const rate = catchRate({
    catchable: cmd.catch?.catchable ?? 0, room: cmd.catch?.room ?? 0, ownerLevel: p.level, creatureLevel: t.level, hp: t.hp, hpMax: t.hpMax,
    creatureId: t.refId, bonusPoints: cmd.catch?.bonusPoints,
  });
  const caught = rate > 0 && Math.floor(ctx.rng() * 100) < rate;
  ctx.groups.push([step(p.slot, t.slot, B.TURNTO, 100)]);
  if (caught) {
    t.hp = 0;
    t.alive = false;
    t.caughtBy = p.slot;
    ctx.groups.push([step(p.slot, t.slot, B.MAGIC, 400)], [step(t.slot, p.slot, B.CATCHED, 400)]);
  } else {
    ctx.groups.push([step(p.slot, t.slot, B.MAGIC, 500, { sSObj: { catchF: { cid: p.refId, rate, selfCatch: p.level } } })]);
  }
  ctx.groups.push([step(p.slot, p.slot, B.TURNBACK, 300)]);
}

/** The player's own action; returns true when it ends the battle (flee). A queued leave (disconnect) runs away and drops out instead. */
function playerAct(ctx: Ctx, p: Fighter, cmd: PlayerCommand): boolean {
  switch (cmd.action) {
    case BattleAction.ESCAPE:
      ctx.groups.push([step(p.slot, -1, B.ESCAPE, 300)]);
      if (cmd.leave) {
        p.hp = 0;
        p.alive = false;
        return false;
      }
      return true;
    case BattleAction.ITEM: {
      const heal = cmd.heal ?? { hp: 0, mp: 0 };
      p.hp = Math.min(p.hpMax, p.hp + heal.hp);
      p.mp = Math.min(p.mpMax, p.mp + heal.mp);
      ctx.groups.push([step(p.slot, p.slot, B.MAGIC, 300, { tSObj: { rHp: p.hp, rMp: p.mp } })]);
      return false;
    }
    case BattleAction.CATCH:
      catchAct(ctx, p, cmd);
      return false;
    case BattleAction.DEFENCE:
    case BattleAction.TIMEOUT:
      // Defend and timeout look the same; only DEFENCE is added to ctx.defending (damage halving).
      ctx.groups.push([step(p.slot, p.slot, B.STAND, 300)]);
      return false;
    default:
      playerStrike(ctx, p, cmd);
      return false;
  }
}

const MISSING: PlayerCommand = { action: BattleAction.TIMEOUT, targetSlot: -1 };

/** No skill rows: every creature basic-attacks (tests, PvP). */
export const NO_NPC_SKILLS: NpcEnv = { skill: () => undefined, creaturePool: () => [] };

/** Go tauntedCommand: a Kích Nộ holder basic-attacks the living opposing caster instead of its command. */
function taunter(ctx: Ctx, f: Fighter): Fighter | undefined {
  for (const s of f.statuses ?? []) {
    if (s.type !== STATUS.TAUNT) continue;
    const src = ctx.fighters.get(s.sourceSlot);
    if (src?.alive && src.side !== f.side) return src;
  }
  return undefined;
}

/** A pet without a command attacks a random living enemy (Go: front line); with no target left it just stands. */
export function petFallbackCommand(fighters: Iterable<Fighter>, rng: Rng, side: Fighter['side'] = 'player'): PlayerCommand {
  const enemies = alive(fighters, side === 'player' ? 'enemy' : 'player');
  if (enemies.length === 0) return MISSING;
  return { action: BattleAction.ATTACK, targetSlot: enemies[Math.min(enemies.length - 1, Math.floor(rng() * enemies.length))].slot };
}

/**
 * Resolves the round: mutates the fighters and returns the playlist (with the end marker when the battle ended).
 * `cmds` is one command for the solo player, or the submitted commands by player slot (a missing one counts as a timeout).
 * Any member fleeing ends the battle for everyone (result FLED). A pet (kind 'pet') with no entry in the map acts on the
 * fallback command above; pets fight, can be targeted and count for the victory check like any player-side fighter.
 */
export function resolveRound(
  fighters: Map<number, Fighter>, cmds: PlayerCommand | ReadonlyMap<number, PlayerCommand>, round: number, rng: Rng,
  roundCap?: number, // M10 per-battle cap (Battle.ctx.roundCap): no winner by then = loss
  env: NpcEnv = NO_NPC_SKILLS, // M10 E2: NPC skill rows / pools for the AI
  deathRule?: DeathRule, // M10 E2.3 Battle.deathRule
): RoundOutcome {
  const players = alive(fighters.values(), 'player');
  // Command-driven fighters: every character / pet (PvP: both sides); only creatures run on enemy AI.
  const actors = [...fighters.values()].filter((f) => f.alive && f.kind !== 'creature');
  const pvp = [...fighters.values()].some((f) => f.side === 'enemy' && f.kind !== 'creature');
  const auto = new Map<number, PlayerCommand>();
  for (const p of actors) {
    if (p.kind === 'pet' && !(cmds instanceof Map && cmds.has(p.slot))) auto.set(p.slot, petFallbackCommand(fighters.values(), rng, p.side));
  }
  const cmdOf = (slot: number): PlayerCommand => auto.get(slot) ?? (cmds instanceof Map ? cmds.get(slot) ?? MISSING : (cmds as PlayerCommand));
  const defending = new Set<number>();
  for (const p of actors) if (cmdOf(p.slot).action === BattleAction.DEFENCE) defending.add(p.slot);
  const ctx: CastCtx = { fighters, rng, defending, groups: [], round, removed: [] };
  // Go splitRegenActions (round >= 2): same-round revives, then Hydra regeneration, before any command is chosen.
  ctx.groups.push(...roundRevives(fighters, round), ...splitStage(fighters, round, ctx.removed));
  const settle = (): number | null => {
    ctx.groups.push(...applyDeathRule(deathRule, fighters, round));
    return checkVictory(fighters.values());
  };

  // Go GenerateNPCCommands: boss mana upkeep, then the AI pick (front line first; a target that died by its turn is a miss).
  const npcCmds = new Map<number, NpcCommand>();
  if (players.length > 0) {
    for (const e of [...fighters.values()].filter((f) => f.alive && f.kind === 'creature')) {
      restoreBossMana(e, env);
      npcCmds.set(e.slot, selectNpcCommand(e, fighters, env, rng, round));
    }
  }
  roundStartExpiry(ctx, round);
  const order = actOrder([...fighters.values()], rng);

  // Go doomsdayActions: the world boss wipe runs before any actor, then the victory check.
  const doom = doomsdaySteps(fighters, round, (id) => env.skill(id)?.name);
  ctx.groups.push(...doom);
  let result: number | null = doom.length > 0 ? settle() : null;
  for (const actor of result === null ? order : []) {
    if (!actor.alive) continue;
    const ts = turnStart(ctx, actor, round, (f) => doomAtTurnStart(ctx, f));
    if (ts.died) {
      result = settle();
      if (result !== null) break;
      continue;
    }
    if (!ts.canAct) continue;
    const taunt = taunter(ctx, actor);
    if (taunt) {
      meleeAttack(ctx, actor, taunt, BASIC_ATTACK);
    } else if (actor.kind !== 'creature') {
      if (playerAct(ctx, actor, cmdOf(actor.slot))) {
        // PvE: the flee ends the battle for everyone. PvP: the side that flees loses (the result is from the attacker's view).
        result = pvp ? (actor.side === 'player' ? BattleResult.LOSE : BattleResult.WIN) : BattleResult.FLED;
        break;
      }
    } else {
      npcAct(ctx, actor, npcCmds.get(actor.slot) ?? { kind: 'attack' });
    }
    result = settle();
    if (result !== null) break;
  }
  if (result === null && pvp && round >= MAX_ROUNDS) result = BattleResult.FLED; // round cap is PvP only (legacy HasRoundLimit): a draw
  if (result === null && !pvp && roundCap !== undefined && roundCap > 0 && round >= roundCap) result = BattleResult.LOSE;
  if (result === null) return { groups: ctx.groups, ended: false, result: BattleResult.LOSE, removed: ctx.removed };
  ctx.groups.push([{ sid: -1, tid: -1, bid: B.STAND, end: true, result }]);
  return { groups: ctx.groups, ended: true, result, removed: ctx.removed };
}
