// Reactions after a landed hit (M13 G2), subset of Go domain/combat/damage_reactions.go hitReactions: the attacker's life steal
// (sSObj.rHp on its attack step), the guarding fairy's on-attack procs (idle buffAdd on the target), then the target's reflect
// (903: X % of the hit back to the attacker as a self hurt with sSObj.hHp, plus its die step; never reflected again, no Miễn Tử).
// Only fairy buffs carry these stats today, so ordinary battles take the early return and emit nothing.

import { BattleBehavior, type BattleStateObj, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import type { StrikeCtx } from '../strike';
import { clearOnDeath } from './battle-buffs';
import { fairyProcSteps } from './fairy-battle';

const B = BattleBehavior;

export interface HitReaction {
  src?: BattleStateObj; // merged into the attacker's own state on the hit step
  after: BattleStep[][]; // groups played after the hit's die / stand group
}

/** Go DamageTakenUp (901): final damage × (100 + X) / 100, X floored at −90; at least 1 when there was damage. */
export function takenDamage(t: Fighter, damage: number): number {
  const pct = t.damageTaken ?? 0;
  if (pct === 0 || damage <= 0) return damage;
  return Math.max(1, Math.trunc((damage * (100 + Math.max(-90, pct))) / 100));
}

export function hitReactions(ctx: StrikeCtx, a: Fighter, t: Fighter, damage: number, reflectable: boolean): HitReaction {
  const out: HitReaction = { after: [] };
  if (damage <= 0 || (!a.lifeSteal && !a.fairy && !t.reflectAll)) return out;
  const steal = Math.trunc((damage * Math.max(0, a.lifeSteal ?? 0)) / 100);
  if (a.alive && steal > 0 && a.hp < a.hpMax) {
    a.hp = Math.min(a.hpMax, a.hp + steal);
    out.src = { rHp: a.hp };
  }
  const procs = fairyProcSteps(ctx, a, t);
  if (procs.length) out.after.push(procs);
  const reflected = reflectable && a.side !== t.side ? Math.trunc((damage * Math.max(0, t.reflectAll ?? 0)) / 100) : 0;
  if (reflected <= 0 || !a.alive) return out;
  const pre = a.hp;
  a.hp = Math.max(0, pre - reflected);
  out.after.push([{ sid: a.slot, tid: -1, bid: B.HURT, delay: 100, sSObj: { hHp: pre - reflected } }]);
  if (a.hp <= 0) {
    a.alive = false;
    const cleared = clearOnDeath(a);
    out.after.push([{ sid: a.slot, tid: t.slot, bid: a.kind === 'creature' ? B.DIE : B.DEAD, delay: 200, ...(cleared ? { sSObj: { buffClear: 1 } } : {}) }]);
  }
  return out;
}
