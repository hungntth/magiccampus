// Task sweep rules for the palaces, pure (Go application/starinstance/sweep.go): the start gate, the cancel split and the payloads.
// Refusal texts are Go's `warMapErrorMessages`.

import {
  SWEEP_BATTLE_MS, SWEEP_NEED_BAG_NUM, SWEEP_TASK_GOLD, SWEEP_TASK_TYPE, sweepBattlesDone, sweepPalaceName, sweepTaskId, type SweepRun,
  type TaskSweepPanel, type TaskSweepStart,
} from '@mc/shared';
import { attemptsLeft, scoreOf, type StarState } from './star-rules';

export const SWEEP_TEXT = {
  UNSUPPORTED: 'Chức năng tự động hoàn thành này chưa mở.',
  GROUP: 'Chỉ có thể tự động hoàn thành tinh cung khi không ở trong nhóm.',
  CULTIVATION: 'Cần nâng cấp tinh cung trước',
  NOT_CLEARED: 'Cần khiêu chiến thành công cấp tinh cung này trước khi tự động hoàn thành',
  NO_ATTEMPTS: 'Số lần khiêu chiến đã hết',
  COUNT: 'Số trận tự động hoàn thành không hợp lệ',
  RUNNING: 'Bạn đang dùng chức năng tự động, đừng vội!',
  NOT_RUNNING: 'Không có tinh cung nào đang tự động hoàn thành',
  NO_GOLD: 'Không đủ vàng',
  FAIL: 'Hệ thống lỗi',
} as const;

/** Gate of a sweep over one cell: cultivated >= level, a win on that cell, attempts left, count in 1..left. Null = allowed. */
export function sweepGate(st: StarState, cultivated: number, sid: number, level: number, count: number): string | null {
  if (cultivated < level) return SWEEP_TEXT.CULTIVATION;
  if (scoreOf(st, level, sid) <= 0) return SWEEP_TEXT.NOT_CLEARED;
  const left = attemptsLeft(st);
  if (left <= 0) return SWEEP_TEXT.NO_ATTEMPTS;
  if (!Number.isInteger(count) || count < 1 || count > left) return SWEEP_TEXT.COUNT;
  return null;
}

/** Cancel pays the battles that fit in the elapsed time (never the last one) and refunds the attempts of the rest. */
export function cancelSplit(run: SweepRun, now: number): { paid: number; refund: number } {
  const paid = Math.min(sweepBattlesDone(run, now), run.count - 1);
  return { paid, refund: run.count - paid };
}

/** initTaskSweepPanel payload (Go sweep_payload.go). `elapsedMs` > 0 resumes a running sweep. */
export function panelPayload(st: StarState, sid: number, level: number, count: number, elapsedMs: number, running: boolean): TaskSweepPanel {
  const id = sweepTaskId(sid);
  return {
    id, taskIndex: level, taskName: sweepPalaceName(sid), taskType: SWEEP_TASK_TYPE, battleCount: count, money: 0,
    needBagNum: SWEEP_NEED_BAG_NUM, gold: SWEEP_TASK_GOLD, time: SWEEP_BATTLE_MS, smax: st.dailyMax, snum: st.dailyUsed, exp: 0,
    st: elapsedMs, level, ...(running ? { taskId: id } : {}),
  };
}

export function startPayload(sid: number, count: number): TaskSweepStart {
  const id = sweepTaskId(sid);
  return { taskId: id, id, taskName: sweepPalaceName(sid), battleCount: count, st: 0 };
}

export const sweepAwardText = (sid: number, battles: number, pnt: number): string =>
  `${sweepPalaceName(sid)}: hoàn thành ${battles} trận, nhận ${pnt} Điểm Tinh Cung.`;
