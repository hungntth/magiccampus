// Pure repair planning: which rows need repair and what they cost (legacy service.go:1623-1634 / 1682, cost =
// (maxDurability - durability) * 10 silver, no data backing).

import { repairCost } from '@mc/shared';

export interface DurabilityRow {
  id: number;
  durability: number;
  maxDurability: number;
}

export interface RepairPlan {
  items: { id: number; cost: number }[]; // only damaged rows
  total: number;
}

/** Damaged rows with their prices and the sum (all-or-nothing: the caller charges `total` once). */
export function planRepair(rows: readonly DurabilityRow[]): RepairPlan {
  const items = rows
    .map((r) => ({ id: r.id, cost: repairCost(r.durability, r.maxDurability) }))
    .filter((r) => r.cost > 0);
  return { items, total: items.reduce((sum, r) => sum + r.cost, 0) };
}
