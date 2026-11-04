// One battle round (legacy turn_processor.go + turn_builder.go): every living fighter acts once in speed order (random ties),
// the enemies always basic-attack a random living player-side fighter, the victory check runs after each actor.
// Pure apart from mutating the fighters (hp / alive / mp); builds the onBattlePlayList groups. A SKILL cast (cmd.skill) spends
// MP first; melee skills use the attack sequence, ranged / magic cast in place (bid 7), heals target the caster.

import { BattleAction, BattleBehavior, BattleResult, type BattlePlayList, type BattleStep } from '@mc/shared';
import type { Fighter, PlayerCommand, Rng, SkillCast } from './battle.types';
import {
  BASIC_ATTACK, COUNTER_ATTACK, comboAttack, comboChance, counterChance, healAmount, resolveHit, type SkillSpec,
} from './damage';

export const MAX_ROUNDS = 30;
const B = BattleBehavior;

export interface RoundOutcome {
  groups: BattlePlayList;
  ended: boolean;
  result: number; // BattleResult, valid when ended
}

type Group = BattleStep[];

const alive = (fs: Iterable<Fighter>, side: Fighter['side']): Fighter[] => [...fs].filter((f) => f.alive && f.side === side);

/** Winner of the board right now: null while both sides live. Both dead counts as an enemy win (Go). */
export function checkVictory(fighters: Iterable<Fighter>): number | null {
  const list = [...fighters];
  if (alive(list, 'player').length === 0) return BattleResult.LOSE;
  if (alive(list, 'enemy').length === 0) return BattleResult.WIN;
  return null;
}

/** Descending speed, ties broken by an RNG draw per fighter. */
export function actOrder(fighters: readonly Fighter[], rng: Rng): Fighter[] {
  return fighters
    .filter((f) => f.alive)
    .map((f) => ({ f, tie: rng() }))
    .sort((a, b) => b.f.speed - a.f.speed || a.tie - b.tie)
    .map((x) => x.f);
}

const step = (sid: number, tid: number, bid: number, delay = 0, extra: Partial<BattleStep> = {}): BattleStep => ({
  sid, tid, bid, delay, ...extra,
});

interface Ctx {
  fighters: Map<number, Fighter>;
  rng: Rng;
  defending: Set<number>;
  groups: Group[];
}

/** One strike a -> t, emitted as the [attack, hurt] pair (or a lone miss). Returns whether it hit. */
function strike(ctx: Ctx, a: Fighter, t: Fighter, sk: SkillSpec, attackBid: number = B.ATTACK): boolean {
  const defending = ctx.defending.has(t.slot);
  const r = resolveHit(a, t, sk, defending, ctx.rng);
  if (r.miss) {
    ctx.groups.push([step(a.slot, t.slot, attackBid, 400, { tSObj: { miss: true } })]);
    return false;
  }
  const preHp = t.hp;
  t.hp = Math.max(0, preHp - r.damage);
  if (t.hp <= 0) t.alive = false;
  // hHp is the unclamped new hp so the client popup shows the full damage on overkill.
  const tSObj = { hHp: preHp - r.damage, ...(r.crit ? { cri: 1 } : {}) };
  ctx.groups.push([
    step(a.slot, t.slot, attackBid, 400, { tSObj }),
    step(t.slot, a.slot, defending ? B.DEFENCE : B.HURT, 100),
  ]);
  if (!t.alive) ctx.groups.push([step(t.slot, a.slot, t.kind === 'creature' ? B.DIE : B.DEAD, 200)]);
  else ctx.groups.push([step(t.slot, -1, B.STAND, 0)]);
  return true;
}

/** Full melee sequence: TurnTo, Run, strike, [combo], [counter], Back, TurnBack. */
function meleeAttack(ctx: Ctx, a: Fighter, t: Fighter | undefined, sk: SkillSpec): void {
  if (!t || !t.alive) {
    // The target died before this actor's turn: attack in place, no retarget (Go).
    ctx.groups.push([step(a.slot, -1, B.ATTACK, 400, { tSObj: {} })], [step(a.slot, a.slot, B.TURNBACK, 300)]);
    return;
  }
  ctx.groups.push([step(a.slot, t.slot, B.TURNTO, 100)], [step(a.slot, t.slot, B.RUN_FAST, 200)]);
  const hit = strike(ctx, a, t, sk);
  if (hit && t.alive && ctx.rng() < comboChance(a)) strike(ctx, a, t, comboAttack(sk));
  if (hit && t.alive && a.alive && ctx.rng() < counterChance(t)) strike(ctx, t, a, COUNTER_ATTACK);
  if (!a.alive) return;
  ctx.groups.push([step(a.slot, t.slot, B.BACK, 0)], [step(a.slot, a.slot, B.TURNBACK, 300)]);
}

/** Ranged / magic skill: face the target, cast in place (bid 7, the hit lands on the cast step), no combo or counter. */
function castInPlace(ctx: Ctx, a: Fighter, t: Fighter | undefined, sk: SkillSpec): void {
  if (!t || !t.alive) {
    ctx.groups.push([step(a.slot, -1, B.MAGIC, 400, { tSObj: {} })], [step(a.slot, a.slot, B.TURNBACK, 300)]);
    return;
  }
  ctx.groups.push([step(a.slot, t.slot, B.TURNTO, 100)]);
  strike(ctx, a, t, sk, B.MAGIC);
  if (a.alive) ctx.groups.push([step(a.slot, a.slot, B.TURNBACK, 300)]);
}

/** Heal skill: the caster is the target; the popup comes from tSObj.rHp. */
function healSelf(ctx: Ctx, p: Fighter, cast: SkillCast): void {
  p.hp = Math.min(p.hpMax, p.hp + healAmount(p, cast.spec, ctx.rng));
  ctx.groups.push([step(p.slot, p.slot, B.MAGIC, 300, { tSObj: { rHp: p.hp } })]);
}

/** The player's attack or skill cast; a cast spends MP first and tags its first step with the banner and the new MP. */
function playerStrike(ctx: Ctx, p: Fighter, cmd: PlayerCommand): void {
  const target = ctx.fighters.get(cmd.targetSlot);
  const cast = cmd.skill;
  if (!cast) return meleeAttack(ctx, p, target, BASIC_ATTACK);
  p.mp = Math.max(0, p.mp - cast.mpCost);
  const start = ctx.groups.length;
  if (cast.category === 'melee') meleeAttack(ctx, p, target, cast.spec);
  else if (cast.category === 'heal') healSelf(ctx, p, cast);
  else castInPlace(ctx, p, target, cast.spec);
  const first = ctx.groups[start]?.[0];
  if (first) first.sSObj = { skill: cast.name, uMp: p.mp };
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

/**
 * Resolves the round: mutates the fighters and returns the playlist (with the end marker when the battle ended).
 * `cmds` is one command for the solo player, or the submitted commands by player slot (a missing one counts as a timeout).
 * Any member fleeing ends the battle for everyone (result FLED).
 */
export function resolveRound(
  fighters: Map<number, Fighter>, cmds: PlayerCommand | ReadonlyMap<number, PlayerCommand>, round: number, rng: Rng,
): RoundOutcome {
  const cmdOf = (slot: number): PlayerCommand => (cmds instanceof Map ? cmds.get(slot) ?? MISSING : (cmds as PlayerCommand));
  const defending = new Set<number>();
  const players = alive(fighters.values(), 'player');
  for (const p of players) if (cmdOf(p.slot).action === BattleAction.DEFENCE) defending.add(p.slot);
  const ctx: Ctx = { fighters, rng, defending, groups: [] };

  // Enemy targets are drawn up front like Go's GenerateNPCCommands; a target that died by its turn becomes a miss.
  const enemyTarget = new Map<number, Fighter>();
  for (const e of alive(fighters.values(), 'enemy')) {
    if (players.length > 0) enemyTarget.set(e.slot, players[Math.min(players.length - 1, Math.floor(rng() * players.length))]);
  }

  let result: number | null = null;
  for (const actor of actOrder([...fighters.values()], rng)) {
    if (!actor.alive) continue;
    if (actor.side === 'player') {
      if (playerAct(ctx, actor, cmdOf(actor.slot))) {
        result = BattleResult.FLED;
        break;
      }
    } else {
      meleeAttack(ctx, actor, enemyTarget.get(actor.slot), BASIC_ATTACK);
    }
    result = checkVictory(fighters.values());
    if (result !== null) break;
  }
  if (result === null && round >= MAX_ROUNDS) result = BattleResult.LOSE; // round cap: the enemy wins
  if (result === null) return { groups: ctx.groups, ended: false, result: BattleResult.LOSE };
  ctx.groups.push([{ sid: -1, tid: -1, bid: B.STAND, end: true, result }]);
  return { groups: ctx.groups, ended: true, result };
}
