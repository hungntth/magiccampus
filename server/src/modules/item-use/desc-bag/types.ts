// Plan types of the description parser (Go descBagPlan / descBagEntry).

import type { DescBagTarget } from './index';

export type DescBagMode = 'fixed' | 'random' | 'choice';

export interface DescBagEntry {
  target: DescBagTarget;
  count: number;
  explicit: boolean;
}

export interface DescBagPlan {
  mode: DescBagMode;
  entries: DescBagEntry[];
}

/** A parse result: a plan, or the reason the description was not read (used by the audit and the log). */
export type DescBagParse = { plan: DescBagPlan; reason: '' } | { plan: null; reason: string };
