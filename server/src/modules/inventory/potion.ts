// Potion / food heal amounts and the full-recover planner (legacy application/item/potion.go).
// HP/MP potion amounts are hardcoded by template id (the template i1/i2 columns are buff ids for several potions).

export const HP_POTION: Readonly<Record<number, number>> = {
  1: 300, 2: 600, 4: 600, 110: 1000, 113: 2000, 321: 3000, 371: 6000, 1975: 9000,
};
export const MP_POTION: Readonly<Record<number, number>> = {
  158: 300, 125: 600, 126: 1000, 127: 2000, 322: 3000, 370: 5000, 1974: 7000,
};

export const ITEM_TYPE_POTION = 501;
export const ITEM_TYPE_FOOD = 502;

export interface HealAmount {
  hp: number;
  mp: number;
}

/** Heal of one use: potions (501) from the tables, food (502) from i1 / i2; 0/0 means "no heal effect". */
export function healAmount(tpl: { id?: unknown; type?: unknown; i1?: unknown; i2?: unknown } | undefined): HealAmount {
  if (!tpl) return { hp: 0, mp: 0 };
  const type = Number(tpl.type);
  if (type === ITEM_TYPE_POTION) {
    const id = Number(tpl.id);
    return { hp: HP_POTION[id] ?? 0, mp: MP_POTION[id] ?? 0 };
  }
  if (type === ITEM_TYPE_FOOD) {
    return { hp: Math.max(0, Math.trunc(Number(tpl.i1 ?? 0)) || 0), mp: Math.max(0, Math.trunc(Number(tpl.i2 ?? 0)) || 0) };
  }
  return { hp: 0, mp: 0 };
}

export interface RecoverCandidate {
  id: number; // item instance id
  stackCount: number;
  amount: number; // heal per unit (> 0)
  priority: number;
}

export interface RecoverStep {
  id: number;
  count: number;
}

/**
 * Consumption plan for a full recover: ascending (priority, id); per entry min(stack, ceil(deficit / amount)); stops when
 * the deficit is covered. `healed` is capped at the original deficit.
 */
export function planRecover(entries: readonly RecoverCandidate[], deficit: number): { steps: RecoverStep[]; healed: number } {
  const ordered = [...entries].sort((a, b) => a.priority - b.priority || a.id - b.id);
  const steps: RecoverStep[] = [];
  let left = deficit;
  for (const e of ordered) {
    if (left <= 0) break;
    if (e.amount <= 0 || e.stackCount <= 0) continue;
    const count = Math.min(e.stackCount, Math.ceil(left / e.amount));
    steps.push({ id: e.id, count });
    left -= count * e.amount;
  }
  return { steps, healed: Math.max(0, deficit - Math.max(0, left)) };
}
