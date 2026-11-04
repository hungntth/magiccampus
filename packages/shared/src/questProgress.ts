// Quest requirement progress as the legacy client shows it: kill objectives from `questKill` (num = REMAINING),
// collect objectives counted from the bag. Pure, shared so the tracker, the panel and the tests agree.

import type { QuestRequire, QuestView } from './protocol.js';

export interface RequireProgress {
  kind: number; // 1 item · 2 creature · 3 pet
  name: string;
  have: number;
  need: number;
  done: boolean;
}

/**
 * One line per requirement. A quest the server already marked finishable shows every line as complete. Pet objectives (kind 3)
 * count the owned pets that match (`petCount`, see petMatchesObjective).
 */
export function requireProgress(
  view: Pick<QuestView, 'state' | 'require' | 'questKill'>,
  finishableState: number,
  bagCount: (templateId: number) => number,
  petCount: (require: QuestRequire) => number = () => 0,
): RequireProgress[] {
  const finishable = view.state === finishableState;
  return view.require.map((r) => {
    const need = Math.max(1, r.num);
    let have = 0;
    if (finishable) have = need;
    else if (r.kind === 2) {
      const remaining = view.questKill.find((k) => k.creatureId === r.itemId)?.num ?? need;
      have = need - Math.max(0, Math.min(need, remaining));
    } else if (r.kind === 1) have = Math.min(need, bagCount(r.itemId));
    else if (r.kind === 3) have = Math.min(need, petCount(r));
    return { kind: r.kind, name: r.name, have, need, done: have >= need };
  });
}

/** True when the server says finishable or every requirement line is complete (the bag changes without a push). */
export function isFinishable(progress: readonly RequireProgress[], serverFinishable: boolean): boolean {
  return serverFinishable || (progress.length > 0 && progress.every((p) => p.done));
}

/** Tracker / panel suffix for one requirement: "(have/need)" plus " (Hoàn thành)" when complete. */
export function progressText(p: RequireProgress): string {
  return `(${p.have}/${p.need})${p.done ? ' (Hoàn thành)' : ''}`;
}

/** One requirement line: creatures get the legacy QUESTCANVAS_S[5] "Tiêu diệt " prefix, items show the bare name. */
export function requireLabel(p: RequireProgress): string {
  return `${p.kind === 2 ? 'Tiêu diệt ' : ''}${p.name} ${progressText(p)}`;
}
