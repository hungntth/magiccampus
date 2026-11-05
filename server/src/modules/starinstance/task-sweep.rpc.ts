// Task sweep RPCs (Flash TaskSweepPanel, palace type 3): initTaskSweepPanelByClient(0, level, sid, 3), taskSweepSure(id, useItem, battleCount,
// taskIndex), taskSweepEnd(id, taskIndex), taskSweepCancel(id), taskSweepLeftTimeCheck(), taskFinishByGold(id, mode, count, taskIndex[, useItem]),
// getTaskBattleTime(). Pushes: initTaskSweepPanel(obj), onEndBattle {flag, ...}, onTaskSweepCancel {taskId}, setStarPoint, updateWarMapStatus,
// onAddMoney. Like Go a refusal is an onSystemSay line and a null reply; arguments that do not parse become 0. Registered WITHOUT quiet.

import { Injectable } from '@nestjs/common';
import { SWEEP_BATTLE_MS, SWEEP_TASK_TYPE, sweepSidOfTask, type TaskSweepPanel, type TaskSweepStart } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { systemSay } from '../npcscript/menu';
import { StarSweepService, SweepRefusal } from './star-sweep.service';
import { SWEEP_TEXT } from './sweep-rules';

/** Go intArg: a missing / non-numeric argument is 0. */
const intArg = (args: unknown[], i: number): number => {
  const n = Number(args[i]);
  return Number.isInteger(n) ? n : 0;
};

@Injectable()
export class TaskSweepRpc {
  constructor(private readonly sweep: StarSweepService) {}

  /** Runs `fn`; a refusal becomes onSystemSay and `fallback`. */
  private async guard<T, F>(session: Session, fn: () => Promise<T>, fallback: F): Promise<T | F> {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof SweepRefusal)) throw e;
      systemSay(session, e.message);
      return fallback;
    }
  }

  @Rpc('initTaskSweepPanelByClient', { requireCharacter: true })
  async initTaskSweepPanelByClient(session: Session, args: unknown[]): Promise<TaskSweepPanel | null> {
    if (intArg(args, 3) !== SWEEP_TASK_TYPE) {
      systemSay(session, SWEEP_TEXT.UNSUPPORTED);
      return null;
    }
    const panel = await this.guard(session, () => this.sweep.panel(session, intArg(args, 2), intArg(args, 1)), null);
    if (panel) session.callback('initTaskSweepPanel', panel);
    return panel;
  }

  @Rpc('taskSweepSure', { requireCharacter: true })
  taskSweepSure(session: Session, args: unknown[]): Promise<TaskSweepStart | null> {
    const sid = sweepSidOfTask(intArg(args, 0));
    if (!sid) {
      systemSay(session, SWEEP_TEXT.UNSUPPORTED);
      return Promise.resolve(null);
    }
    return this.guard(session, () => this.sweep.start(session, sid, intArg(args, 3), intArg(args, 2)), null);
  }

  @Rpc('taskSweepEnd', { requireCharacter: true })
  async taskSweepEnd(session: Session, args: unknown[]): Promise<null> {
    await this.guard(session, () => this.sweep.end(session, sweepSidOfTask(intArg(args, 0))), null);
    return null;
  }

  @Rpc('taskSweepCancel', { requireCharacter: true })
  async taskSweepCancel(session: Session, args: unknown[]): Promise<null> {
    await this.guard(session, () => this.sweep.cancel(session, sweepSidOfTask(intArg(args, 0))), null);
    return null;
  }

  @Rpc('taskSweepLeftTimeCheck', { requireCharacter: true })
  taskSweepLeftTimeCheck(session: Session): Promise<{ gold?: number }> {
    return this.guard(session, () => this.sweep.leftGold(session), {});
  }

  @Rpc('taskFinishByGold', { requireCharacter: true })
  async taskFinishByGold(session: Session, args: unknown[]): Promise<null> {
    const sid = sweepSidOfTask(intArg(args, 0));
    if (!sid) {
      systemSay(session, SWEEP_TEXT.UNSUPPORTED);
      return null;
    }
    await this.guard(session, () => this.sweep.finishByGold(session, intArg(args, 1), sid, intArg(args, 3), intArg(args, 2)), null);
    return null;
  }

  /** The panel only sets a flag on the reply; the value is the per-battle time. */
  @Rpc('getTaskBattleTime', { requireCharacter: true })
  getTaskBattleTime(): { time: number } {
    return { time: SWEEP_BATTLE_MS };
  }
}
