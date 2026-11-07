// Choose-one gift box flow: the itemMultitoSel(payload, itemId) push opens the MultiItemPanel, selMultiItemByIdx(itemId, idx) picks.
// Owned by BagController (the box icon and the free bag slots come from its items); the pet slots from PlayerData.

import { SlotType, bagCapacity } from '@mc/shared';
import type { BagItem, ItemMultiToSelPayload, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { MultiItemPanel } from '../ui/multiItemPanel';

export interface MultiItemBag {
  find(id: number): BagItem | undefined;
  list(): BagItem[];
}

export class MultiItemController {
  private readonly panel: MultiItemPanel;
  private readonly off: () => void;

  constructor(client: GameClient, player: () => PlayerData, bag: MultiItemBag, say: (text: string) => void) {
    this.panel = new MultiItemPanel({
      pick: (itemId, idx) => client.call<number>('selMultiItemByIdx', itemId, idx),
      box: (itemId) => {
        const it = bag.find(itemId);
        return it ? { name: it.name, iconCode: it.iconCode } : null;
      },
      freeBagSlots: () => bagCapacity(player().bagSlotNum ?? 1) - bag.list().filter((i) => i.slotType === SlotType.BAG).length,
      freePetSlots: () => player().petMaxNum - Object.keys(player().petList).length,
      say,
    });
    this.off = client.on('itemMultitoSel', (payload, itemId) => this.panel.show(payload as ItemMultiToSelPayload, Number(itemId)));
  }

  destroy(): void {
    this.off();
    this.panel.close();
  }
}
