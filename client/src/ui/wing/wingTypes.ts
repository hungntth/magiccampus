// Shared types of the wing panel (Cải tạo cánh): the host WingController supplies (items, rates, actions) and the view state that survives a
// re-render (selected wing / feather, chosen fusion subs, previews waiting for confirmation, the last result line).

import type { BagItem, ChangeWingBindReply, NewWingProState, WingPropLines } from '@mc/shared';

export interface BindPreview {
  wingId: number;
  cur: [number, number];
  next: [number, number];
}

export interface PrefixPreview {
  wingId: number;
  lines: WingPropLines;
}

export interface WingViewState {
  /** Selected wing item id (shared by every tab). */
  sel: number;
  /** Fusion: chosen sub ids, senior sub count. */
  subs: number[];
  seniorCount: number;
  /** Stars: stones per try 1..5, target star of the automatic mode (0 = single try). */
  stoneCount: number;
  starTarget: number;
  /** Feathers: selected bag feather, mix formula and its two inputs, luck checkboxes. */
  feather: number;
  formula: number;
  mixInputs: [number, number];
  useLuck: boolean;
  /** Previews waiting for the player's decision. */
  prefix: PrefixPreview | null;
  bind: BindPreview | null;
  /** Advance tab state (onShowNewWingPro) and the crit charm checkbox. */
  advance: NewWingProState | null;
  useCrit: boolean;
  /** Last result line shown at the bottom of a tab. */
  note: string;
}

export const newWingViewState = (): WingViewState => ({
  sel: 0, subs: [], seniorCount: 4, stoneCount: 5, starTarget: 0, feather: 0, formula: 0, mixInputs: [0, 0], useLuck: false,
  prefix: null, bind: null, advance: null, useCrit: false, note: '',
});

export interface WingActions {
  join(mainId: number, subIds: number[], senior: boolean): void;
  star(count: number, wingId: number, stoneId: number, upTo: number): void;
  hole(wingId: number, materialId: number): void;
  inlay(wingId: number, slot: number, featherId: number): void;
  remove(wingId: number, slot: number, name: string, silver: number): void;
  upgrade(featherId: number, luckId: number, luckCount: number, once: boolean): void;
  mix(formulaId: number, inputs: [number, number], luckId: number, luckCount: number): void;
  prefix(wingId: number, materialId: number): void;
  decidePrefix(accept: boolean): void;
  bind(wingId: number, materialId: number): void;
  decideBind(accept: boolean): void;
  advance(useCrit: boolean, mode: 1 | 2): void;
  buyCrit(): void;
  setLook(index: number): void;
  dye(): void;
  refreshState(): void;
}

export interface WingUiHost {
  /** Bag + worn items. */
  items(): BagItem[];
  state: WingViewState;
  actions: WingActions;
  /** Redraw the open tab. */
  render(): void;
}

export type { ChangeWingBindReply };
