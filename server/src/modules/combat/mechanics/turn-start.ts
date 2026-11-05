// Round-start and turn-start stages (M10 E2.0), port of Go turn_processor.go ProcessRound: buff expiry at round start
// (expireTableBuffActions, buffDel idle steps), then per actor ProcessTurnStartRound (statuses: skip-turn, expiry),
// turnStartDrainActions (DOT tick: a self hurt whose sSObj.hHp is the new HP, then the die step), turnStartHealActions
// (HOT tick: idle step with rHp / rMp) and the status expiry buffDel.

import { BattleBehavior, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { step, type StrikeCtx } from '../strike';
import { clearOnDeath, dotDamage, expireBuffs, hotAmounts, tickStatuses, wakeOnHit } from './battle-buffs';

const B = BattleBehavior;

/** Go roundStartExpiryActions: buffs past their last round are reverted; one idle buffDel step per living holder. */
export function roundStartExpiry(ctx: StrikeCtx, round: number): void {
  const group: BattleStep[] = [];
  for (const f of [...ctx.fighters.values()].sort((a, b) => a.slot - b.slot)) {
    const ids = expireBuffs(f, round);
    if (ids.length && f.alive) group.push(step(f.slot, -1, B.STAND, 0, { sSObj: { buffDel: ids } }));
  }
  if (group.length) ctx.groups.push(group);
}

export interface TurnStart {
  canAct: boolean;
  died: boolean;
}

/** One actor's turn start; `extraDrain` (E2.7 death mark doom) replaces the DOT tick when it applies. */
export function turnStart(ctx: StrikeCtx, f: Fighter, round: number, doom?: (f: Fighter) => boolean): TurnStart {
  const st = tickStatuses(f, round);
  if (doom?.(f)) return { canAct: false, died: !f.alive };
  const dot = dotDamage(f);
  if (dot > 0) {
    f.hp = Math.max(0, f.hp - dot);
    const woken = wakeOnHit(f);
    ctx.groups.push([step(f.slot, -1, B.HURT, 100, { sSObj: { hHp: f.hp, ...(woken.length ? { buffDel: woken } : {}) } })]);
    if (f.hp <= 0) {
      f.alive = false;
      const cleared = clearOnDeath(f);
      ctx.groups.push([step(f.slot, -1, f.kind === 'creature' ? B.DIE : B.DEAD, 200, cleared ? { sSObj: { buffClear: 1 } } : {})]);
      return { canAct: false, died: true };
    }
  }
  const hot = hotAmounts(f, round);
  const obj: { rHp?: number; rMp?: number } = {};
  if (hot.hp > 0 && f.hp < f.hpMax) obj.rHp = f.hp = Math.min(f.hpMax, f.hp + hot.hp);
  if (hot.mp > 0 && f.mp < f.mpMax) obj.rMp = f.mp = Math.min(f.mpMax, f.mp + hot.mp);
  if (obj.rHp !== undefined || obj.rMp !== undefined) ctx.groups.push([step(f.slot, -1, B.STAND, 0, { sSObj: obj })]);
  if (st.expired.length) ctx.groups.push([step(f.slot, -1, B.STAND, 0, { sSObj: { buffDel: st.expired } })]);
  return { canAct: st.canAct, died: false };
}
