// Mehdi death mark (M10 E2.7), port of Go domain/combat death_mark.go / death_mark_doom.go: every landed hit of a marker
// creature (1303 / 1304 / 2012, both brothers share the stacks) adds one stack on the target up to 4 (icon TBL_BUFF 3038,
// sent with 99 rounds); at the target's next turn start a doomed unit loses all its HP (no Miễn Tử), hurt step with
// hHp 0 + buffDel [3038], then the die step. Death and revives clear the stacks.

import { BattleBehavior, type BattleStateObj } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { step, type StrikeCtx } from '../strike';
import { clearOnDeath } from './battle-buffs';

const B = BattleBehavior;
export const DEATH_MARK = { STACKS: 4, BUFF_ID: 3038, ICON: '4140200000048', ICON_ROUNDS: 99, CREATURES: [1303, 1304, 2012] } as const;

const isMarker = (a: Fighter): boolean => a.kind === 'creature' && (DEATH_MARK.CREATURES as readonly number[]).includes(a.refId);

/** Go deathMarkHit: the buffAdd to merge into the hurt state, or null (no stack added). */
export function markHit(a: Fighter, t: Fighter): BattleStateObj | null {
  if (!isMarker(a) || !t.alive || t.hp <= 0 || t.side === a.side || (t.deathMarks ?? 0) >= DEATH_MARK.STACKS) return null;
  t.deathMarks = (t.deathMarks ?? 0) + 1;
  return { buffAdd: { id: DEATH_MARK.BUFF_ID, round: DEATH_MARK.ICON_ROUNDS + 1, icon: DEATH_MARK.ICON } };
}

export const doomed = (f: Fighter): boolean => f.alive && (f.deathMarks ?? 0) >= DEATH_MARK.STACKS;

/** Go deathMarkDoomActions: true when the unit was doomed (its turn is lost, it is dead). */
export function doomAtTurnStart(ctx: StrikeCtx, f: Fighter): boolean {
  if (!doomed(f)) return false;
  f.deathMarks = 0;
  f.hp = 0;
  f.alive = false;
  ctx.groups.push([step(f.slot, -1, B.HURT, 100, { sSObj: { hHp: 0, buffDel: [DEATH_MARK.BUFF_ID] } })]);
  clearOnDeath(f);
  ctx.groups.push([step(f.slot, -1, f.kind === 'creature' ? B.DIE : B.DEAD, 200, { sSObj: { buffClear: 1 } })]);
  return true;
}
