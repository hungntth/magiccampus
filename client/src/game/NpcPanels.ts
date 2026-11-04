// NPC talk dialog and shop panel owned together (extracted from GameScene): npcFuncInit / onOpenShop handling and closing
// them when the player walks away from the NPC.

import { NpcType } from '@mc/shared';
import type { NpcFuncInit, OpenShop } from '@mc/shared';
import type { GameClient } from '../net/client';
import { NpcDialog } from '../ui/npcDialog';
import { ShopPanel } from '../ui/shopPanel';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';
import type { Entity } from './Entity';
import type { QuestController } from './QuestController';

const NPC_DIALOG_CLOSE_DIST = 300;

export interface NpcPanelsHost {
  client: GameClient;
  npc(id: number): Entity | undefined;
  npcIcon(id: number): string;
  self(): Entity | null;
  /** Lazy: the quest and bag controllers are built after this one. */
  quest(): QuestController;
  bag(): BagController;
}

export class NpcPanels {
  readonly dialog = new NpcDialog();
  readonly shop = new ShopPanel();

  constructor(private readonly host: NpcPanelsHost) {}

  closeAll(): void {
    this.dialog.close();
    this.shop.close();
  }

  onNpcFuncInit(data: NpcFuncInit): void {
    const npc = this.host.npc(data.npcId);
    if (!npc) return;
    if (data.npcQuest.state <= 0 && data.npcType <= 0) {
      // Legacy: talk-only NPCs show their greeting as a speech bubble instead of a panel.
      this.dialog.close();
      npc.say(data.onServiceText);
      return;
    }
    this.dialog.show(data, this.host.npcIcon(data.npcId), (view) => {
      this.dialog.close();
      this.host.quest().openFromNpc(view, data.npcId, data.npcName);
    }, (npcType) => {
      // Shop and bank NPCs answer npcFuncClick (the bank's password argument is ignored by the server).
      if (npcType !== NpcType.SHOP && npcType !== NpcType.BANK) return toast('Tính năng đang phát triển');
      void this.host.client.call('npcFuncClick', data.npcId).catch((e) => toast((e as Error).message, true));
    });
  }

  onOpenShop(data: OpenShop): void {
    this.dialog.close();
    this.host.quest().closePanel();
    this.shop.show(data, true);
    this.host.bag().showBesideShop();
  }

  /** Closes the dialog / shop when the NPC is gone or the player is more than 300 px away. */
  closeIfFar(): void {
    const self = this.host.self();
    if (!self) return;
    const far = (id: number | null): boolean => {
      const npc = id === null ? undefined : this.host.npc(id);
      return id !== null && (!npc || Math.hypot(npc.x - self.x, npc.y - self.y) > NPC_DIALOG_CLOSE_DIST);
    };
    if (far(this.dialog.npcId)) this.dialog.close();
    if (far(this.shop.npcId)) this.shop.close();
  }
}
