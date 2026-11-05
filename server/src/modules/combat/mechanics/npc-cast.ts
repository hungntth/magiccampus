// NPC skill execution (M10 E2.0), port of Go domain/combat turn_executor.go executeSkill / executeHealSkill,
// turn_state_skill.go buildStateSkillActions and skill_buff.go applySkillBuff, played back like Go's
// playback_rounds.go: a single target keeps the ordinary strike sequence; several targets play one cast (tSObj {}),
// then one hurt wave per hit (each unit at most once per group, playback_waves.go) and its die / stand group. Landed buffs
// follow as idle steps owned by the recipient (sSObj.buffAdd), so the Flash-style icon bar updates on that unit.

import { BattleBehavior, type BattleStateObj, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { BASIC_ATTACK, healAmount } from '../damage';
import { castInPlace, followStep, landHit, meleeAttack, step, type StrikeCtx } from '../strike';
import { addStatus, applyBuff, beneficial, canUseSkill, hostile, rollLand } from './battle-buffs';
import { npcSkillCost, type BuffDef, type NpcSkill } from './npc-skills';
import type { NpcCommand } from './npc-ai';
import { executeSummon } from './summon';
import { frontlineTarget, resolveTargets } from './targets';

const B = BattleBehavior;
export const RESISTED_TEXT = 'Kháng cự';

export interface CastCtx extends StrikeCtx {
  round: number;
  removed: Fighter[]; // corpses a summon / split took off the board (Battle.fallen)
}

const buffAdd = (def: BuffDef): BattleStateObj => ({ buffAdd: { id: def.id, round: Math.max(1, def.rounds) + 1, icon: def.icon } });
const idle = (f: Fighter, sSObj: BattleStateObj): BattleStep => step(f.slot, -1, B.STAND, 0, { sSObj });

/**
 * Lands a skill buff on t (Go landSkillBuff / applyStateSkill): a status goes through the status layer (refused when
 * immune), a table buff applies its deltas; on a damage / heal skill a beneficial non-DOT buff lands on the caster.
 * Returns the recipient and its sSObj, or null when nothing landed.
 */
export function landBuff(ctx: CastCtx, a: Fighter, t: Fighter, def: BuffDef, state: boolean): { to: Fighter; obj: BattleStateObj } | null {
  if (!t.alive) return null;
  if (def.status !== undefined) {
    const ok = addStatus(t, { type: def.status, duration: Math.max(1, def.rounds), buffId: def.id, appliedRound: ctx.round, sourceSlot: a.slot }, a.side);
    return ok ? { to: t, obj: buffAdd(def) } : null;
  }
  if (!state && def.mods.length === 0 && !def.dot && !def.hot) return null;
  const to = !state && !def.dot && beneficial(def) ? a : t;
  if (!to.alive) return null;
  applyBuff(a, to, def, ctx.round);
  return { to, obj: buffAdd(def) };
}

/** Go applySkillBuff: the buff rate rolled per landed target. */
function hitBuffs(ctx: CastCtx, a: Fighter, sk: NpcSkill, targets: readonly Fighter[]): void {
  const b = sk.buff;
  if (!b || b.rate <= 0) return;
  const group: BattleStep[] = [];
  for (const t of targets) {
    if (!t.alive || !rollLand(a, t, b.def, b.rate, ctx.rng)) continue;
    const r = landBuff(ctx, a, t, b.def, false);
    if (r) group.push(idle(r.to, r.obj));
  }
  if (group.length) ctx.groups.push(group);
}

/** Several targets: the cast, then per hit index a hurt group and a die / stand group. Returns the landed targets. */
function clusterDamage(ctx: CastCtx, a: Fighter, sk: NpcSkill, targets: Fighter[], banner: BattleStateObj): Fighter[] {
  const bid = sk.physical ? B.ATTACK : B.MAGIC;
  if (sk.approach) ctx.groups.push([step(a.slot, targets[0].slot, B.TURNTO, 100)], [step(a.slot, targets[0].slot, B.RUN_FAST, 200)]);
  ctx.groups.push([step(a.slot, targets[0].slot, bid, sk.physical ? 400 : 500, { sSObj: banner, tSObj: {} })]);
  const landed = new Set<Fighter>();
  for (let i = 0; i < sk.hits && a.alive; i++) {
    const hurt: BattleStep[] = [];
    const follow: BattleStep[] = [];
    for (const t of targets) {
      if (!t.alive) continue;
      const h = landHit(ctx, a, t, sk.spec, true, { kill: sk.kill, maxHpPct: sk.maxHpPct });
      if (h.outcome !== 'hit') {
        hurt.push(idle(t, h.state));
        continue;
      }
      landed.add(t);
      hurt.push(step(t.slot, a.slot, ctx.defending.has(t.slot) ? B.DEFENCE : B.HURT, 100, { sSObj: h.state }));
      follow.push(followStep(t, a.slot, h));
    }
    if (hurt.length) ctx.groups.push(hurt);
    if (follow.length) ctx.groups.push(follow);
  }
  if (sk.approach && a.alive) ctx.groups.push([step(a.slot, a.slot, B.BACK, 0)]);
  if (a.alive && (sk.approach || !sk.physical)) ctx.groups.push([step(a.slot, a.slot, B.TURNBACK, 300)]);
  return [...landed];
}

function castDamage(ctx: CastCtx, a: Fighter, sk: NpcSkill, targets: Fighter[], banner: BattleStateObj): void {
  if (targets.length > 1) {
    hitBuffs(ctx, a, sk, clusterDamage(ctx, a, sk, targets, banner));
    return;
  }
  const t = targets[0];
  const before = t.hp;
  const start = ctx.groups.length;
  const opts = { hits: sk.hits, mods: { kill: sk.kill, maxHpPct: sk.maxHpPct }, bid: sk.physical ? B.ATTACK : B.MAGIC };
  if (sk.approach) meleeAttack(ctx, a, t, sk.spec, false, opts);
  else castInPlace(ctx, a, t, sk.spec, opts);
  const first = ctx.groups[start]?.[0];
  if (first) first.sSObj = { ...first.sSObj, ...banner };
  // A landed hit shows hHp on t; the buff rolls only then (Go landedSkillHit).
  const hit = ctx.groups.slice(start).some((g) => g.some((s) => s.tid === t.slot && s.tSObj?.hHp !== undefined));
  if (hit || t.hp < before) hitBuffs(ctx, a, sk, [t]);
}

function castHeal(ctx: CastCtx, a: Fighter, sk: NpcSkill, targets: Fighter[], banner: BattleStateObj): void {
  const list = targets.length > 0 ? targets : [a];
  const heal = (t: Fighter): BattleStateObj => {
    t.hp = Math.min(t.hpMax, t.hp + healAmount(a, sk.spec, ctx.rng));
    return { rHp: t.hp };
  };
  if (list.length === 1) ctx.groups.push([step(a.slot, list[0].slot, B.MAGIC, 500, { sSObj: banner, tSObj: heal(list[0]) })]);
  else {
    ctx.groups.push([step(a.slot, list[0].slot, B.MAGIC, 500, { sSObj: banner, tSObj: {} })]);
    ctx.groups.push(list.map((t) => idle(t, heal(t))));
  }
  hitBuffs(ctx, a, sk, list);
  ctx.groups.push([step(a.slot, a.slot, B.TURNBACK, 300)]);
}

/** Go buildStateSkillActions: the cast, then per target its landed buff (or "Kháng cự" for a hostile one that failed). */
function castState(ctx: CastCtx, a: Fighter, sk: NpcSkill, targets: Fighter[], banner: BattleStateObj): void {
  const bid = sk.physical ? B.ATTACK : B.MAGIC;
  ctx.groups.push([step(a.slot, targets[0].slot, bid, 500, { sSObj: banner, tSObj: {} })]);
  const group: BattleStep[] = [];
  const b = sk.buff;
  for (const t of targets) {
    if (!b || !t.alive) continue;
    if (!rollLand(a, t, b.def, b.rate, ctx.rng)) {
      if (t.side !== a.side && hostile(b.def)) group.push(idle(t, { status: RESISTED_TEXT }));
      continue;
    }
    const r = landBuff(ctx, a, t, b.def, true);
    group.push(idle(t, r ? r.obj : { status: RESISTED_TEXT }));
  }
  if (group.length) ctx.groups.push(group);
  if (bid === B.MAGIC) ctx.groups.push([step(a.slot, a.slot, B.TURNBACK, 300)]);
}

/** Runs one NPC command (Go executeCommand): a skill it cannot pay for (or is silenced for) is a basic attack. */
export function npcAct(ctx: CastCtx, a: Fighter, cmd: NpcCommand): void {
  if (cmd.kind === 'summon') {
    if (!executeSummon(ctx.fighters, a, ctx.groups, ctx.removed)) meleeAttack(ctx, a, frontlineTarget(ctx.fighters.values(), a.side === 'enemy' ? 'player' : 'enemy', ctx.rng), BASIC_ATTACK);
    return;
  }
  if (cmd.kind === 'attack' || !canUseSkill(a)) {
    meleeAttack(ctx, a, cmd.target, BASIC_ATTACK);
    return;
  }
  const sk = cmd.skill;
  const cost = npcSkillCost(sk, a.mpMax);
  if (a.mp < cost || sk.kind === 'passive' || sk.kind === 'unsupported') {
    meleeAttack(ctx, a, cmd.target, BASIC_ATTACK);
    return;
  }
  a.mp -= cost;
  const banner: BattleStateObj = { skill: sk.name, uMp: a.mp };
  const targets = resolveTargets(ctx.fighters, a, cmd.target.slot, sk.target, sk.area, sk.areaSize, ctx.rng);
  if (targets.length === 0) {
    ctx.groups.push([step(a.slot, -1, B.MAGIC, 400, { sSObj: banner, tSObj: {} })], [step(a.slot, a.slot, B.TURNBACK, 300)]);
    return;
  }
  if (sk.kind === 'heal') castHeal(ctx, a, sk, targets, banner);
  else if (sk.kind === 'state') castState(ctx, a, sk, targets, banner);
  else castDamage(ctx, a, sk, targets, banner);
}
