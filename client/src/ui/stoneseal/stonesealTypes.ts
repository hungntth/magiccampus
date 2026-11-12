// Shared types of the Ấn Thạch window: the host the controller provides and the transient UI state (selection, picked stone, dialog).

import type { BagItem, StoneSealEquipView } from '@mc/shared';

export type StoneSealDialog = { kind: 'bore'; idx: number } | { kind: 'succinct' } | null;

export interface StoneSealViewState {
  sid: number;
  /** Bag stone item id picked for the next "put into hole" click (0 = none). */
  pick: number;
  /** Open holes (1..10) marked for a swap. */
  marks: number[];
  dialog: StoneSealDialog;
}

export const newStoneSealState = (): StoneSealViewState => ({ sid: 1, pick: 0, marks: [], dialog: null });

export interface StoneSealActions {
  setStone(idx: number, itemId: number): void;
  removeStone(idx: number): void;
  removeAll(): void;
  swap(i: number, j: number): void;
  bore(idx: number, payMode: number, diamondId: number): void;
  succinct(payMode: number): void;
  render(): void;
}

export interface StoneSealUiHost {
  views(): StoneSealEquipView[];
  items(): BagItem[];
  gold(): number;
  dust(): number;
  state: StoneSealViewState;
  actions: StoneSealActions;
}
