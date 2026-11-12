// Strike sequences of one actor (Go turn_builder.go buildDamageActions / buildComboActions / counterActionsAt, M10 E2.-1):
// the main hit (position modifier), the combo (basic attack: chain of up to 10 ×0.6 hits rolled even after a miss, moving
// to a random living enemy when the target dies; skills: one extra hit at combo / 100), the counter (needs a landed or
// resisted main hit of a melee basic attack, struck in place, chains its own combo, can be countered back up to 5 times),
// Miễn Tử (lethal hit leaves 1 HP once, tSObj.reborn) and the miss text (tSObj.status "Né tránh" / "Kháng cự").
// M13 G2: damage taken (901) scales the hit; mechanics/hit-reactions.ts adds life steal, fairy procs and reflect after it.

import { BattleBehavior, type BattleStateObj, type BattleStep } from '@mc/shared';
import type { Fighter, Rng, SkillCast } from './battle.types';
import {
  COUNTER_ATTACK, DMG, comboAttack, comboChance, comboExtraHits, counterChance, deathImmune, elementModifier, healAmount, resolveHit,
  type SkillSpec,
} from './damage';
import { clearOnDeath, wakeOnHit } from './mechanics/battle-buffs';
import { markHit } from './mechanics/death-mark';
import { hitReactions, takenDamage } from './mechanics/hit-reactions';

const B = BattleBehavior;
export const DODGE_TEXT = 'Né tránh';
export const RESIST_TEXT = 'Kháng cự';

export type Group = BattleStep[];

export interface StrikeCtx {
  fighters: Map<number, Fighter>;
  rng: Rng;
  defending: Set<number>;
  groups: Group[];
  round?: number; // the round being resolved (fairy procs: once per round); CastCtx always sets it
}

export type StrikeOutcome = 'hit' | 'miss' | 'resisted';

export const step = (sid: number, tid: number, bid: number, delay = 0, extra: Partial<BattleStep> = {}): BattleStep => ({
  sid, tid, bid, delay, ...extra,
});

/** A random living fighter opposing `a` (Go SelectRandomTarget), or undefined. */
function randomOpponent(ctx: StrikeCtx, a: Fighter): Fighter | undefined {
  const list = [...ctx.fighters.values()].filter((f) => f.alive && f.side !== a.side);
  return list.length > 0 ? list[Math.min(list.length - 1, Math.floor(ctx.rng() * list.length))] : undefined;
}

export interface HitMods {
  kill?: boolean; // type 23 kill text: a non-boss target loses its whole HP (Miễn Tử still saves)
  maxHpPct?: { max: number; min: number }; // Diệt Thần Trảm: share of the target's max HP (non-boss)
}

export interface LandedHit {
  outcome: StrikeOutcome;
  state: BattleStateObj; // the target's popup state (hHp / cri / reborn / buffDel, or miss + status)
  died: boolean;
  cleared: boolean; // the dead target had buffs / statuses: the die step carries buffClear
  src?: BattleStateObj; // M13 G2: the attacker's own state on the hit step (life steal rHp)
  after?: Group[]; // M13 G2: fairy proc buffs and the reflect hurt, played after the hit's die / stand group
}

/** Resolves and applies one hit a -> t without emitting steps (single strikes and multi-target clusters share it). */
export function landHit(ctx: StrikeCtx, a: Fighter, t: Fighter, sk: SkillSpec, main = false, mods: HitMods = {}): LandedHit {
  const defending = ctx.defending.has(t.slot);
  const r = resolveHit(a, t, sk, defending, ctx.rng, { position: main });
  if (r.miss) {
    return { outcome: r.resisted ? 'resisted' : 'miss', state: { miss: true, status: r.resisted ? RESIST_TEXT : DODGE_TEXT }, died: false, cleared: false };
  }
  const preHp = t.hp;
  let raw = r.damage;
  if (t.bossFlag === 0 && mods.kill) raw = preHp;
  else if (t.bossFlag === 0 && mods.maxHpPct) {
    const pct = Math.max(mods.maxHpPct.min, Math.min(mods.maxHpPct.max, mods.maxHpPct.max * Math.min(1, elementModifier(a.element ?? 0, t.element ?? 0))));
    raw = Math.max(1, Math.round(t.hpMax * pct));
    if (defending) raw = Math.trunc(raw / 2);
  } else raw = takenDamage(t, raw); // M13 G2 Go DamageTakenUp (901, fairy Chi Diệp)
  const saved = deathImmune(a, t, raw, ctx.rng);
  const damage = saved ?? raw;
  t.hp = Math.max(0, preHp - damage);
  if (t.hp <= 0) t.alive = false;
  const woken = wakeOnHit(t);
  // hHp is the unclamped new hp so the client popup shows the full damage on overkill.
  const state: BattleStateObj = {
    hHp: preHp - damage, ...(r.crit ? { cri: 1 } : {}), ...(saved !== null ? { reborn: t.hp } : {}), ...(woken.length ? { buffDel: woken } : {}),
  };
  const mark = markHit(a, t); // E2.7 Mehdi death mark stack on every landed hit
  if (mark) Object.assign(state, mark);
  const cleared = !t.alive && clearOnDeath(t);
  const react = hitReactions(ctx, a, t, damage, !mods.kill && !mods.maxHpPct);
  return { outcome: 'hit', state, died: !t.alive, cleared, ...(react.src ? { src: react.src } : {}), ...(react.after.length ? { after: react.after } : {}) };
}

/** The die (or stand) step that follows a hit on t. */
export const followStep = (t: Fighter, by: number, h: Pick<LandedHit, 'died' | 'cleared'>): BattleStep =>
  h.died ? step(t.slot, by, t.kind === 'creature' ? B.DIE : B.DEAD, 200, h.cleared ? { sSObj: { buffClear: 1 } } : {}) : step(t.slot, -1, B.STAND, 0);

/** One strike a -> t, emitted as the [attack, hurt] pair (or a lone miss / resist). */
export function strike(
  ctx: StrikeCtx, a: Fighter, t: Fighter, sk: SkillSpec, attackBid: number = B.ATTACK, main = false, mods: HitMods = {},
): StrikeOutcome {
  const h = landHit(ctx, a, t, sk, main, mods);
  if (h.outcome !== 'hit') {
    ctx.groups.push([step(a.slot, t.slot, attackBid, 400, { tSObj: h.state })]);
    return h.outcome;
  }
  ctx.groups.push([
    step(a.slot, t.slot, attackBid, 400, { tSObj: h.state, ...(h.src ? { sSObj: h.src } : {}) }),
    step(t.slot, a.slot, ctx.defending.has(t.slot) ? B.DEFENCE : B.HURT, 100),
  ]);
  ctx.groups.push([followStep(t, a.slot, h)]);
  if (h.after) ctx.groups.push(...h.after);
  return 'hit';
}

/** Counter c -> o in place (TurnTo, Attack, hurt, [combo chain], TurnBack); o may counter back while depth < 5. */
function counterChain(ctx: StrikeCtx, c: Fighter, o: Fighter, depth: number): void {
  ctx.groups.push([step(c.slot, o.slot, B.TURNTO, 100)]);
  const r = strike(ctx, c, o, COUNTER_ATTACK);
  if (r === 'hit') {
    for (let i = 0, n = comboExtraHits(c, ctx.rng); i < n && o.alive && c.alive; i++) strike(ctx, c, o, comboAttack(COUNTER_ATTACK));
  }
  if (c.alive) ctx.groups.push([step(c.slot, c.slot, B.TURNBACK, 300)]);
  if (depth < DMG.MAX_COUNTER_CHAIN && r !== 'miss' && o.alive && c.alive && ctx.rng() < counterChance(o)) counterChain(ctx, o, c, depth + 1);
}

export interface StrikeOpts {
  hits?: number; // skill attack_num: main hits, retargeting a random living enemy when the target dies (Go)
  mods?: HitMods;
  bid?: number; // in-place cast behaviour (7 magic, 3 physical)
}

/** Full melee sequence: TurnTo, Run, main hit(s), [combo], [counter], Back, TurnBack. `basic` = basic attack (chain + counter). */
export function meleeAttack(ctx: StrikeCtx, a: Fighter, t: Fighter | undefined, sk: SkillSpec, basic = true, o: StrikeOpts = {}): void {
  if (!t || !t.alive) {
    // The target died before this actor's turn: attack in place, no retarget (Go).
    ctx.groups.push([step(a.slot, -1, B.ATTACK, 400, { tSObj: {} })], [step(a.slot, a.slot, B.TURNBACK, 300)]);
    return;
  }
  ctx.groups.push([step(a.slot, t.slot, B.TURNTO, 100)], [step(a.slot, t.slot, B.RUN_FAST, 200)]);
  let target = t;
  let first: StrikeOutcome = strike(ctx, a, t, sk, B.ATTACK, true, o.mods);
  for (let i = 1; i < (o.hits ?? 1) && a.alive; i++) {
    if (!target.alive) {
      const next = randomOpponent(ctx, a);
      if (!next) break;
      target = next;
      ctx.groups.push([step(a.slot, target.slot, B.TURNTO, 100)], [step(a.slot, target.slot, B.RUN_FAST, 200)]);
    }
    const r = strike(ctx, a, target, sk, B.ATTACK, true, o.mods);
    if (first === 'miss') first = r;
  }
  if (target.alive || basic) {
    const hits = basic ? comboExtraHits(a, ctx.rng) : ctx.rng() < comboChance(a) ? 1 : 0;
    for (let i = 0; i < hits && a.alive; i++) {
      if (!target.alive) {
        if (!basic) break;
        const next = randomOpponent(ctx, a);
        if (!next) break;
        target = next;
        ctx.groups.push([step(a.slot, target.slot, B.TURNTO, 100)], [step(a.slot, target.slot, B.RUN_FAST, 200)]);
      }
      strike(ctx, a, target, comboAttack(sk));
    }
  }
  if (first !== 'miss' && basic && target.alive && a.alive && ctx.rng() < counterChance(target)) counterChain(ctx, target, a, 1);
  if (!a.alive) return;
  ctx.groups.push([step(a.slot, target.slot, B.BACK, 0)], [step(a.slot, a.slot, B.TURNBACK, 300)]);
}

/** Ranged / magic skill: face the target, cast in place (the hit lands on the cast step), one combo roll, no counter. */
export function castInPlace(ctx: StrikeCtx, a: Fighter, t: Fighter | undefined, sk: SkillSpec, o: StrikeOpts = {}): void {
  const bid = o.bid ?? B.MAGIC;
  if (!t || !t.alive) {
    ctx.groups.push([step(a.slot, -1, bid, 400, { tSObj: {} })], [step(a.slot, a.slot, B.TURNBACK, 300)]);
    return;
  }
  ctx.groups.push([step(a.slot, t.slot, B.TURNTO, 100)]);
  let target = t;
  strike(ctx, a, t, sk, bid, true, o.mods);
  for (let i = 1; i < (o.hits ?? 1) && a.alive; i++) {
    if (!target.alive) {
      const next = randomOpponent(ctx, a);
      if (!next) break;
      target = next;
    }
    strike(ctx, a, target, sk, bid, true, o.mods);
  }
  if (target.alive && a.alive && ctx.rng() < comboChance(a)) strike(ctx, a, target, comboAttack(sk), bid);
  if (a.alive && bid === B.MAGIC) ctx.groups.push([step(a.slot, a.slot, B.TURNBACK, 300)]);
}

/** Heal skill: the caster is the target; the popup comes from tSObj.rHp. */
export function healSelf(ctx: StrikeCtx, p: Fighter, cast: SkillCast): void {
  p.hp = Math.min(p.hpMax, p.hp + healAmount(p, cast.spec, ctx.rng));
  ctx.groups.push([step(p.slot, p.slot, B.MAGIC, 300, { tSObj: { rHp: p.hp } })]);
}
