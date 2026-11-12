// Shared types of the Hồn Khí / Phù Văn window: the host (data + actions supplied by DecoController) and the view state that survives a re-render.

import type { DecoCatalog, DecoInfo, DecoShowRow, DecoSuitPropReply, RuneBag, RuneCatalog, RuneChipBag, RuneRow } from '@mc/shared';
import type { MysteryUiHost } from '../mystery/mysteryTypes';

export interface DecoActions {
  activate(show: DecoShowRow): void;
  equip(show: DecoShowRow, on: boolean): void;
  setVisible(position: number, visible: boolean): void;
  setTier(position: number, tier: number): void;
  upgrade(position: number, tenTimes: boolean): void;
  /** runeSet / runeRemove / runeMove / runeUpLvl / runeResolve / arrangeRuneBag / exchangeRune. */
  socket(bagPos: number, holePos: number, page: number, position: number): void;
  unsocket(holePos: number, page: number, position: number): void;
  stage(bagPos: number, page: number): void;
  unstage(page: number): void;
  upLevel(): void;
  resolve(positions: Record<string, number>, page: number): void;
  arrange(page: number): void;
  exchange(): void;
  /** getDecoSuitProp of a suit (the reply feeds the suit box). */
  suit(show: DecoShowRow): void;
  render(): void;
}

export interface DecoUiHost {
  catalog(): DecoCatalog;
  runes(): RuneCatalog;
  rune(id: number): RuneRow | undefined;
  runeName(row: RuneRow): string;
  info(): DecoInfo;
  bag(): RuneBag;
  chips(): RuneChipBag;
  suitReply(): DecoSuitPropReply | null;
  /** Balances: Bí Ngân, Exp phù văn, unbound gold, silver of the selected money type. */
  decoSilver(): number;
  runeExp(): number;
  gold(): number;
  money(): number;
  view: DecoViewState;
  actions: DecoActions;
  /** Mật Bảo tab (phase F), owned by MysteryController. */
  mystery: MysteryUiHost;
  /** The Mật Bảo tab was opened: load its data. */
  loadMystery(): void;
}

export interface DecoViewState {
  /** Selected Hồn Khí position 1..4. */
  position: number;
  /** Selected show id of the look tab (drives the suit box), 0 none. */
  showSel: number;
  /** Rune bag page 0 character / 1 pet and the selected bag slot (-1 none). */
  page: number;
  sel: number;
  /** Dissolve mode: picked bag slots. */
  resolve: boolean;
  picked: Set<string>;
}

export const newDecoView = (): DecoViewState => ({ position: 1, showSel: 0, page: 0, sel: -1, resolve: false, picked: new Set() });
