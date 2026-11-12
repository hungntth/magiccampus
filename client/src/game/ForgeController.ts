// Forge ("Tạo") flow: the HUD red function-column button "Chế tạo" opens the window on its craft tab (legacy funCanvas
// button 2) or the "Luyện" button (upgrade tabs); the window sits beside the bag, whose double-click fills the active tab.
// Tabs are listed in FORGE_TABS in the Flash top-row order; "Thần khí" opens the Thần khí window instead.

import type { PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { craftTab } from '../ui/forge/craftTab';
import { ForgePanel } from '../ui/forge/forgePanel';
import type { ForgeGroup, ForgeTab } from '../ui/forge/forgeTypes';
import { jewelExchangeTab } from '../ui/forge/jewelExchange';
import { jewelTab, mixTab } from '../ui/forge/mixTab';
import { restrainTab, sublimeTab } from '../ui/forge/equipSublimeTabs';
import { chongZhuTab, qilingTab } from '../ui/forge/qilingTabs';
import { refineTab } from '../ui/forge/refineTab';
import { resolveTab } from '../ui/forge/resolveTab';
import { socketTab } from '../ui/forge/socketTab';
import { starTab } from '../ui/forge/starTab';
import { petColorTab, petLevelTab } from '../ui/forge/petLevelTabs';
import { petBindTab, petPreTab } from '../ui/forge/petModTabs';
import { petRestrainTab, petSublimeTab } from '../ui/forge/petSublimeTabs';
import { tierTab } from '../ui/forge/tierTab';
import type { BagController } from './BagController';

const inGroup = (group: ForgeGroup, tabs: readonly ForgeTab[]): ForgeTab[] => tabs.map((t) => ({ ...t, group }));

/** Flash order: Trang bị | Cải tạo (Thăng tinh, Khảm nạm, Thăng cấp, Chữ ký/Đổi ng.tố/l.hồn/khóa, Phân giải) | Ng.liệu |
 *  Bảo thạch | Thần khí (own window) | T.bị pet (Thăng cấp, Đổi màu, Đổi khóa, Tái thiết lập, Th.hoa, Khắc chế). */
export const FORGE_TABS: readonly ForgeTab[] = [
  ...inGroup('equip', [craftTab]),
  ...inGroup('modify', [starTab, socketTab, tierTab, refineTab, sublimeTab, restrainTab, qilingTab, chongZhuTab, resolveTab]),
  ...inGroup('mix', [mixTab]),
  ...inGroup('jewel', [jewelTab]),
  jewelExchangeTab,
  ...inGroup('pet', [petLevelTab, petColorTab, petBindTab, petPreTab, petSublimeTab, petRestrainTab]),
];

export class ForgeController {
  private readonly panel: ForgePanel;
  private readonly off: () => void;

  constructor(client: GameClient, private readonly bag: BagController, player: () => PlayerData, onMagicWeapon: () => void) {
    this.panel = new ForgePanel({ client, items: () => [...bag.list(), ...bag.equipped().values()], player, petGear: () => bag.petGear() }, FORGE_TABS);
    this.panel.onMagicWeapon = onMagicWeapon;
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
