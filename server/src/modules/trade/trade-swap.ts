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
  capacity?: number; // bag slots this side can receive into (opened pages); defaults to the planSwap argument
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
    const cap = taker.capacity ?? capacity;
    for (let i = 0; i < cap && free.length < giver.out.length; i++) if (!taken.has(i)) free.push(i);
    if (free.length < giver.out.length) return { ok: false, reason: 'full', cid: taker.cid };
    giver.out.forEach((id, i) => {
      moves.push({ id, from: giver.cid, to: taker.cid, fromSlot: rows.get(id)!.slotIndex, toSlot: free[i] });
    });
  }
  return { ok: true, moves };
}

export interface PetMove {
  id: number;
  from: number;
  to: number;
}

/** Pets keep their id and only change owner (decision 4 of the M11 plan); a-out then b-out, in offer order. */
export function planPetMoves(a: { cid: number; pets: readonly number[] }, b: { cid: number; pets: readonly number[] }): PetMove[] {
  return [
    ...a.pets.map((id) => ({ id, from: a.cid, to: b.cid })),
    ...b.pets.map((id) => ({ id, from: b.cid, to: a.cid })),
  ];
}

/** Persistence of one pet move; both calls are single conditional writes (true = the row changed). */
export interface PetMoveStore {
  /** Moves the pet to `to` only while it is still `from`'s, unbound, resting and not following (clears `following`). */
  give(m: PetMove): Promise<boolean>;
  /** Undo of give: back to `from` only while it is still `to`'s. */
  giveBack(m: PetMove): Promise<boolean>;
}

/** Saga step moving one pet; a lost race (the pet changed since lock) throws `refusal`. Placed before the item moves. */
export function petMoveStep(m: PetMove, store: PetMoveStore, refusal: Error): SagaStep {
  return {
    name: `move pet ${m.id}`,
    run: async () => {
      if (!(await store.give(m))) throw refusal;
    },
    undo: async () => {
      if (!(await store.giveBack(m))) throw new Error(`pet ${m.id} could not be returned to ${m.from}`);
    },
  };
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
