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

export interface ForgeTab {
  id: string;
  label: string;
  /** Tab group: "pet" tabs show behind the "T.bị Pet" switch of the tab row; absent = the equipment group. */
  group?: "pet";
  build(host: ForgeHost, body: HTMLElement): ForgeTabView;
}
