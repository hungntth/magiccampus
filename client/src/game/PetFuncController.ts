// "Luyện pet" flow (legacy PetFuncPanel): owns the window and every RPC of it (petStar, petStarClear, petJoin, seniorPetJoin,
// petXsd, petPzXsd, petXd, petUpSkill, petEat, ensurePetEat, elementPet). Views get typed wrappers that resolve null when the
// server refused (the refusal note arrives as onSystemMidMsgOrNote and is toasted by BagController). Pet / bag pushes are
// applied by PetController / BagController; this controller only asks the open window to redraw (refresh()).

import { ItemKind, SlotType, type BagItem, type PetGrowthReply, type PetSkillInfo, type PetView, type PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { createThrottle } from '../net/throttle';
import type { PetFuncActions, PetFuncHost, PetFuncTabId } from '../ui/petfunc/petFuncTypes';
import { PetFuncWindow } from '../ui/petfunc/petFuncWindow';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';

const OP_DELAY = 500; // Flash PETMANAGERPANEL_S[24]: no back-to-back pet operations

export interface PetFuncControllerHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
  pets(): PetView[];
  skillInfo(id: number): PetSkillInfo | undefined;
}

export class PetFuncController {
  private readonly win: PetFuncWindow;
  private readonly allow = createThrottle();
  private readonly offBag: () => void;
  private seed: PetView | null = null;

  constructor(private readonly host: PetFuncControllerHost) {
    const view: PetFuncHost = {
      actions: this.actions(),
      pets: () => host.pets(),
      items: () => host.bag.list().filter((i: BagItem) => i.slotType === SlotType.BAG && i.itemType === ItemKind.ITEM),
      player: () => host.player,
      initialPet: () => (this.seed ? host.pets().find((p) => p.id === this.seed?.id) ?? null : null),
      skillInfo: (id) => host.skillInfo(id),
    };
    this.win = new PetFuncWindow(view, () => this.close());
    this.offBag = host.bag.subscribe(() => this.refresh());
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  /** Pet panel "Luyện" button: opens (or re-targets) the window on a tab with `pet` pre-selected. */
  open(tab: PetFuncTabId, pet: PetView | null): void {
    this.seed = pet;
    this.win.show(tab);
  }

  close(): void {
    this.win.close();
  }

  /** Pet or bag data changed: redraw the open tab. */
  refresh(): void {
    if (this.win.isOpen) this.win.refresh();
  }

  destroy(): void {
    this.offBag();
    this.win.close();
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T | null> {
    if (!this.allow('petFunc', OP_DELAY)) {
      toast('Vui lòng không thực hiện liên tục các thao tác với pet');
      return null;
    }
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch {
      return null; // the refusal note was pushed by the server
    }
  }

  private actions(): PetFuncActions {
    const grow = (method: string, ...args: unknown[]): Promise<PetGrowthReply | null> => this.call<PetGrowthReply>(method, ...args);
    return {
      star: (petId, itemId, safeId) => grow('petStar', petId, itemId, safeId),
      starClear: (petId, itemId) => grow('petStarClear', petId, itemId),
      join: (main, subs, senior) => (senior ? grow('seniorPetJoin', [main, ...subs]) : grow('petJoin', main, ...subs)),
      xsd: (petId, itemId) => grow('petXsd', petId, itemId),
      pzXsd: (petId, itemId) => grow('petPzXsd', petId, itemId),
      xd: (petId, itemId) => grow('petXd', petId, itemId),
      upSkill: async (petId, slot) => {
        if (!this.allow('petFunc', OP_DELAY)) {
          toast('Vui lòng không thực hiện liên tục các thao tác với pet');
          return false;
        }
        try {
          await this.host.client.call('petUpSkill', petId, slot);
          return true;
        } catch {
          return false;
        }
      },
      eat: (main, sub, luckItem, luckNum, aptType) => grow('petEat', main, sub, luckItem, luckNum, aptType, ''),
      ensureEat: (main) => grow('ensurePetEat', main),
      element: (petId, element) => grow('elementPet', petId, element),
    };
  }
}
