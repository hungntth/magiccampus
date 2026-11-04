// Runs an onBattlePlayList (legacy BattleStage.startSequence / execBehavior): groups in order, the steps of one group
// together, a 2 s safety timeout per step so a missing animation can never stall the round. Each step applies sSObj to the
// actor, runs the behaviour, then applies tSObj to the target (popups, bars, shake).

import { BattleBehavior as B, type BattlePlayList, type BattleReport, type BattleStateObj, type BattleStep, type CatchFailed } from '@mc/shared';
import { dirFromDelta } from '../SheetAnim';
import type { BattleStage } from './BattleStage';
import type { BattleUnit } from './BattleUnit';
import { Action, defaultDir } from './slots';

const STEP_TIMEOUT_MS = 2000;
const DIE_FADE_MS = 1000;
const ESCAPE_STEP = 30;

export interface PlaybackEnd {
  result: number;
  report?: BattleReport;
}

export interface PlaybackHooks {
  /** Center banner text (skill names, phase C). */
  banner(text: string): void;
  /** A unit's HP / MP changed (the local pet drives the HUD PetCanvas). */
  unit?(unit: BattleUnit): void;
  /** A catch (-70) failed: sSObj.catchF (the controller shows the text to the catcher only). */
  catchFailed?(f: CatchFailed): void;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const timeout = (p: Promise<void>): Promise<void> => Promise.race([p, sleep(STEP_TIMEOUT_MS)]);

/** Plays the whole list; resolves with the end marker's result, or null when the round simply finished. */
export async function playGroups(stage: BattleStage, groups: BattlePlayList, hooks: PlaybackHooks): Promise<PlaybackEnd | null> {
  for (const group of groups) {
    const end = group.find((s) => s.end);
    if (end) return { result: end.result ?? 0, report: end.report };
    await Promise.all(group.map((s) => timeout(execStep(stage, s, hooks))));
    const delay = group[group.length - 1]?.delay ?? 0;
    if (delay > 0) await sleep(delay);
  }
  return null;
}

/** newRound(): everyone alive goes back to the slot, stands, and faces the default way. */
export function resetUnits(stage: BattleStage): void {
  for (const u of stage.units.values()) u.reset();
}

async function execStep(stage: BattleStage, step: BattleStep, hooks: PlaybackHooks): Promise<void> {
  const s = stage.units.get(step.sid);
  const t = step.tid >= 0 ? stage.units.get(step.tid) : undefined;
  if (!s) {
    if (step.sSObj?.skill) hooks.banner(step.sSObj.skill);
    return;
  }
  if (step.sSObj) applyState(stage, s, step.sSObj, hooks);
  const done = behave(s, t, step);
  if (step.tSObj && t) applyState(stage, t, step.tSObj, hooks);
  await done;
}

function behave(s: BattleUnit, t: BattleUnit | undefined, step: BattleStep): Promise<void> {
  switch (step.bid) {
    case B.TURNTO:
      if (t) s.face(dirFromDelta(t.x - s.x, t.y - s.y, s.dir));
      return Promise.resolve();
    case B.RUN_FAST:
    case B.RUN_NORMAL:
      if (!t) return Promise.resolve();
      s.face(dirFromDelta(t.x - s.x, t.y - s.y, s.dir));
      return s.runToward(t.x, t.y);
    case B.ATTACK:
      return s.play(Action.ATTACK);
    case B.MAGIC:
      return s.play(Action.MAGIC);
    case B.HURT:
      return s.play(Action.HURT);
    case B.DEFENCE:
      return s.play(Action.DEFENCE);
    case B.DEAD:
      return s.play(Action.DEAD).then(() => s.hold());
    case B.DIE:
      s.fadeOut(DIE_FADE_MS);
      return Promise.resolve();
    case B.CATCHED:
      // Caught (BH_CATCHED): the creature fades out like a death; hp 0 makes it unpickable. The pet arrives with onAddPet later.
      s.fadeOut(DIE_FADE_MS);
      s.setHp(0);
      return Promise.resolve();
    case B.STAND:
      // A self-targeted stand is the defend / timeout pose; tid -1 just returns to the idle loop.
      if (step.tid === step.sid) return s.play(Action.DEFENCE);
      s.stand();
      return Promise.resolve();
    case B.BACK:
      s.face(dirFromDelta(s.homeX - s.x, s.homeY - s.y, s.dir));
      return s.runTo(s.homeX, s.homeY);
    case B.TURNBACK:
      s.face(defaultDir(s.slot));
      s.stand();
      return Promise.resolve();
    case B.ESCAPE: {
      const away = s.enemy ? -1 : 1;
      s.face(dirFromDelta(away, away, s.dir));
      // A member that leaves a group battle (flee-ended battles are torn down right after) drops out of the picture.
      return s.runTo(s.x + away * ESCAPE_STEP, s.y + away * ESCAPE_STEP * 0.5).then(() => {
        s.fadeOut(400);
        s.setHp(0);
      });
    }
    default:
      return Promise.resolve();
  }
}

function applyState(stage: BattleStage, u: BattleUnit, o: BattleStateObj, hooks: PlaybackHooks): void {
  if (o.skill) hooks.banner(o.skill);
  if (o.catchF) hooks.catchFailed?.(o.catchF);
  if (o.miss) stage.popup(u, 'Né', '#ffffff', 22);
  if (o.hHp !== undefined) {
    const dmg = Math.round(u.hp - o.hHp);
    stage.popup(u, String(Math.max(0, dmg)), '#ff0000', o.cri ? 50 : 32);
    if (o.cri) stage.shake();
    u.setHp(o.hHp);
  }
  if (o.rHp !== undefined) {
    const gain = Math.round(o.rHp - u.hp);
    if (gain > 0) stage.popup(u, `+${gain}`, '#00ff00', 32);
    u.setHp(o.rHp);
  }
  if (o.rMp !== undefined) {
    const gain = Math.round(o.rMp - u.mp);
    if (gain > 0) stage.popup(u, `+${gain}`, '#5599ff', 28);
    u.setMp(o.rMp);
  }
  if (o.uMp !== undefined) u.setMp(o.uMp);
  hooks.unit?.(u);
}
