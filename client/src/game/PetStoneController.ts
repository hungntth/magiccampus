// Tụ Linh Bảo Thạch flow (legacy PetStonePanel): owns the window, the stone-bag state and every RPC of it -- initPetStonePanel,
// composePetStone, absorbPetStone, resolvePetStone, getPetStoneByEid, petStoneSet, removePetStone, changePetStoneEnergy -- plus the push
// updatePetStoneBagData. The bag is a sparse [tid, num, skillId] array (index = sid); every bag-changing reply replaces it.

import {
  ItemKind, isPetEquipPosition, type BagItem, type PetStoneBag, type PetStoneEnergyReply, type PetStoneHoleWire, type PetStoneSetReply,
  type PetView, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { StoneWindow } from '../ui/petboost/stoneWindow';
import { entriesOf } from '../ui/petboost/stoneRules';
import type { GearOption, StoneActions, StoneHost } from '../ui/petboost/stoneTypes';
import type { BagController } from './BagController';

export interface PetStoneControllerHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
  pets(): PetView[];
}

export class PetStoneController {
  private readonly win: StoneWindow;
  private readonly offs: (() => void)[] = [];
  private stones: PetStoneBag = [];

  constructor(private readonly host: PetStoneControllerHost) {
    const view: StoneHost = {
      actions: this.actions(), entries: () => entriesOf(this.stones), gear: () => this.gear(), player: () => host.player,
    };
    this.win = new StoneWindow(view, () => this.win.close());
    this.offs.push(
      host.bag.subscribe(() => this.refresh()),
      host.client.on('updatePetStoneBagData', (bag) => this.setBag(bag as PetStoneBag)),
    );
  }

  /** Pet panel "B.Thạch" button: pulls the stone bag, then shows the window. */
  open(): void {
    void this.call<PetStoneBag>('initPetStonePanel').then((bag) => {
      if (bag) this.stones = bag;
      this.win.show();
    });
  }

  refresh(): void {
    if (this.win.isOpen) this.win.refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T | null> {
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch {
      return null; // the refusal note was pushed by the server
    }
  }

  private setBag(bag: PetStoneBag): PetStoneBag {
    this.stones = Array.isArray(bag) ? bag : [];
    this.refresh();
    return this.stones;
  }

  private async bagReply(reply: Promise<PetStoneBag | null>): Promise<PetStoneBag | null> {
    const r = await reply;
    return r ? this.setBag(r) : null;
  }

  /** Pet gear (kind 9, equipment positions 50..57) of the bag, the pet item page and the pets' worn slots. */
  private gear(): GearOption[] {
    const out = new Map<number, GearOption>();
    const isGear = (i: BagItem): boolean => i.itemType === ItemKind.EQUIP && isPetEquipPosition(i.position);
    for (const item of this.host.bag.listTabs()) if (isGear(item)) out.set(item.id, { item, owner: null });
    for (const pet of this.host.pets()) {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        const item = pet[`equ${n}`] > 0 ? this.host.bag.find(pet[`equ${n}`]) : undefined;
        if (item && isGear(item)) out.set(item.id, { item, owner: pet.petName });
      }
    }
    return [...out.values()].sort((a, b) => a.item.position - b.item.position || a.item.id - b.item.id);
  }

  private actions(): StoneActions {
    const afterSet = async (reply: Promise<PetStoneSetReply | null>): Promise<PetStoneSetReply | null> => {
      const r = await reply;
      if (r) this.setBag(r.bagData);
      return r;
    };
    return {
      compose: (sid, qty) => this.bagReply(this.call<PetStoneBag>('composePetStone', sid, qty)),
      absorb: (sids) => this.bagReply(this.call<PetStoneBag>('absorbPetStone', sids)),
      resolve: (sid, num) => this.bagReply(this.call<PetStoneBag>('resolvePetStone', sid, num)),
      holes: async (itemId) => {
        const r = await this.call<PetStoneHoleWire | -1>('getPetStoneByEid', itemId);
        return r === null || r === -1 ? null : r;
      },
      set: (itemId, hole, sid) => afterSet(this.call<PetStoneSetReply>('petStoneSet', itemId, hole, sid, this.host.player.id)),
      remove: (itemId, hole) => afterSet(this.call<PetStoneSetReply>('removePetStone', itemId, hole, this.host.player.id, itemId)),
      // Flash order (sid, cid, type).
      energy: async (sid, type) => {
        const r = await this.call<PetStoneEnergyReply>('changePetStoneEnergy', sid, this.host.player.id, type);
        if (r) this.setBag(r.bagData);
        return r;
      },
    };
  }
}
