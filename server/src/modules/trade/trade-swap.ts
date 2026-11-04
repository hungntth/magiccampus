// Pure swap planning + saga runner. planSwap assigns each outgoing bag row a free slot of the receiver; runSaga applies
// steps in order and, on the first failure, undoes the completed ones in reverse (no Mongo transactions on a standalone server).

export interface SwapRow {
  id: number;
  slotIndex: number;
}

export interface SwapSideInput {
  cid: number;
  bag: readonly SwapRow[]; // every row currently in the side's bag (slotType 0)
  out: readonly number[]; // item ids this side gives
}

export interface SwapMove {
  id: number;
  from: number;
  to: number;
  fromSlot: number;
  toSlot: number;
}

export type SwapPlan = { ok: true; moves: SwapMove[] } | { ok: false; reason: 'full' | 'missing'; cid: number };

/**
 * Each receiver gets the lowest slot indexes that are empty NOW (slots freed by its own outgoing rows are not reused, like
 * Go's `bagCount + incoming <= capacity`; this also keeps the unique (character, slot) index conflict-free in any order).
 * Moves are ordered a-out then b-out, in offer order.
 */
export function planSwap(a: SwapSideInput, b: SwapSideInput, capacity: number): SwapPlan {
  const moves: SwapMove[] = [];
  for (const [giver, taker] of [[a, b], [b, a]] as const) {
    const rows = new Map(giver.bag.map((r) => [r.id, r]));
    if (giver.out.some((id) => !rows.has(id))) return { ok: false, reason: 'missing', cid: giver.cid };
    const taken = new Set(taker.bag.map((r) => r.slotIndex));
    const free: number[] = [];
    for (let i = 0; i < capacity && free.length < giver.out.length; i++) if (!taken.has(i)) free.push(i);
    if (free.length < giver.out.length) return { ok: false, reason: 'full', cid: taker.cid };
    giver.out.forEach((id, i) => {
      moves.push({ id, from: giver.cid, to: taker.cid, fromSlot: rows.get(id)!.slotIndex, toSlot: free[i] });
    });
  }
  return { ok: true, moves };
}

export interface SagaStep {
  name: string;
  run: () => Promise<void>;
  undo: () => Promise<void>;
}

export interface SagaResult {
  ok: boolean;
  error?: unknown;
  failedStep?: string;
  undone: string[]; // names of the steps undone, in the order they were undone
  undoErrors: string[]; // steps whose undo threw (state needs a manual look)
}

export async function runSaga(steps: readonly SagaStep[]): Promise<SagaResult> {
  const done: SagaStep[] = [];
  for (const step of steps) {
    try {
      await step.run();
      done.push(step);
    } catch (error) {
      const undone: string[] = [];
      const undoErrors: string[] = [];
      for (const d of [...done].reverse()) {
        try {
          await d.undo();
          undone.push(d.name);
        } catch {
          undoErrors.push(d.name);
        }
      }
      return { ok: false, error, failedStep: step.name, undone, undoErrors };
    }
  }
  return { ok: true, undone: [], undoErrors: [] };
}
