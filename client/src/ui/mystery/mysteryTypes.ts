// Shared types of the Mật Bảo tab: the host (data + actions supplied by MysteryController) and the view state that survives a re-render.

import type { BagItem, MysBag, MysBook, MysBuffByKind, MysBuffSimple, MysCatalog, MysMakeData, MysRecipeRow } from '@mc/shared';
import type { Placement } from './mysteryRules';

export interface MysteryActions {
  /** makeMysTre with the placement (auto-placed when null). */
  make(recipe: MysRecipeRow, placement: Placement | null): void;
  /** onGetMysAddTimes -> confirm -> addLimitMakeTimes. */
  buy(): void;
  /** mysTreObjResolve of the selected stacks. */
  resolve(selection: ReadonlyMap<number, { mid: number; num: number }>): void;
  /** Loads the Thu Thập buffs of a kind. */
  selectKind(kind: number): void;
  render(): void;
}

export interface MysteryUiHost {
  catalog(): MysCatalog | null;
  book(): MysBook;
  bag(): MysBag;
  makeData(): MysMakeData;
  /** crafts left today */
  limit(): number;
  buffs(kind: number): MysBuffByKind | undefined;
  simple(): MysBuffSimple;
  /** general-bag item stacks (material source) */
  items(): BagItem[];
  /** Bí Ngân balance */
  silver(): number;
  view: MysteryView;
  actions: MysteryActions;
}

export interface MysteryView {
  /** 0 Thu Thập, 1 Chế Tạo, 2 Phân Giải */
  sub: number;
  kind: number;
  level: number;
  learnedOnly: boolean;
  recipe: number;
  placed: Placement | null;
  /** resolve selection: bag slot -> stack */
  picked: Map<number, { mid: number; num: number }>;
  page: number;
}

export const newMysteryView = (): MysteryView => ({ sub: 0, kind: 1, level: 1, learnedOnly: false, recipe: 0, placed: null, picked: new Map(), page: 0 });
