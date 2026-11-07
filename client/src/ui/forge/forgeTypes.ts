// Contracts between the forge window (forgePanel.ts) and its tabs. A tab builds into the window body; later phases
// (star, sockets, refine, tier, resolve) only append another ForgeTab to the list in ForgeController.

import type { BagItem, PlayerData } from '@mc/shared';
import type { GameClient } from '../../net/client';

export interface ForgeHost {
  client: GameClient;
  /** Bag items (general pages) and worn equipment at this moment. */
  items(): BagItem[];
  player(): PlayerData;
  /** Pet gear in the bag, the pet item page and worn by pets (pet forge tabs). */
  petGear(): BagItem[];
}

export interface ForgeTabView {
  /** The bag changed (a push arrived): re-read `host.items()` and redraw. */
  refresh(): void;
  /** Bag double-click while this tab is shown; true when the item was taken. */
  accept?(item: BagItem): boolean;
  dispose(): void;
}

/** Flash EquiptFuncPanel top row (tabBtnA0..A5): Trang bị, Cải tạo, Ng.liệu, Bảo thạch, Thần khí, T.bị pet. */
export const FORGE_GROUPS = [
  { id: 'equip', label: 'Trang bị' }, { id: 'modify', label: 'Cải tạo' }, { id: 'mix', label: 'Ng.liệu' },
  { id: 'jewel', label: 'Bảo thạch' }, { id: 'mw', label: 'Thần khí' }, { id: 'pet', label: 'T.bị pet' },
] as const;
export type ForgeGroup = (typeof FORGE_GROUPS)[number]['id'];

export interface ForgeTab {
  id: string;
  label: string;
  /** Top-row tab of the Flash "Tạo" window this tab sits under; a group with several tabs shows them as a sub-row. */
  group?: ForgeGroup;
  build(host: ForgeHost, body: HTMLElement): ForgeTabView;
}
