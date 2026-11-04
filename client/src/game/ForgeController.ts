// Forge ("Lò rèn") flow: the HUD red function-column button "Chế tạo" opens the window on its craft tab (legacy funCanvas
// button 2) or the "Luyện" button (upgrade tabs); the window sits beside the bag, whose double-click fills the active tab.
// Tabs are listed in FORGE_TABS.

import type { PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { craftTab } from '../ui/forge/craftTab';
import { ForgePanel } from '../ui/forge/forgePanel';
import type { ForgeTab } from '../ui/forge/forgeTypes';
import { mixTab } from '../ui/forge/mixTab';
import { refineTab } from '../ui/forge/refineTab';
import { resolveTab } from '../ui/forge/resolveTab';
import { socketTab } from '../ui/forge/socketTab';
import { starTab } from '../ui/forge/starTab';
import { tierTab } from '../ui/forge/tierTab';
import type { BagController } from './BagController';

export const FORGE_TABS: readonly ForgeTab[] = [mixTab, craftTab, starTab, socketTab, refineTab, tierTab, resolveTab];

export class ForgeController {
  private readonly panel: ForgePanel;
  private readonly off: () => void;

  constructor(client: GameClient, private readonly bag: BagController, player: () => PlayerData) {
    this.panel = new ForgePanel({ client, items: () => [...bag.list(), ...bag.equipped().values()], player }, FORGE_TABS);
    this.panel.onClose = () => {
      this.bag.forgeHook = null;
    };
    this.off = bag.subscribe(() => this.panel.refresh());
  }

  /** HUD "Chế tạo" (craft tab) and "Luyện" (star tab) buttons: open or switch the tab and show the bag beside the window. */
  open(tabId = craftTab.id): void {
    this.panel.show(tabId);
    this.bag.forgeHook = (item) => this.panel.accept(item);
    this.bag.showBesideShop();
  }

  destroy(): void {
    this.off();
    this.panel.close();
  }
}
