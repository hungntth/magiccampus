// Tiến hóa flow (legacy PetEvolutionPanel + PetHandbook): owns the two windows and every RPC of them (toPetEnvolution, toPetFeather,
// toPetFeatherNextStep, contractPet, contractPetTen, ensureBuyContractPet, activePet, activePetGold) plus the pushes
// updateActivatePetObj (handbook state) and onEnsureBuyContract (gold confirm of a short contract try). Views get typed wrappers
// that resolve null on refusal (the note arrives as onSystemMidMsgOrNote and is toasted by BagController).

import {
  ItemKind, SlotType, type BagItem, type PetContractReply, type PetEvolveReply, type PetFeatherReply, type PetHandbookEntry, type PetView,
  type PlayerData, type ActivePetObject,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { HandbookWindow } from '../ui/petevo/handbookWindow';
import { applyContractReply } from '../ui/petevo/petEvoRules';
import { confirmGoldContract } from '../ui/petevo/petEvoText';
import type { PetEvoActions, PetEvoHost, PetEvoTabId } from '../ui/petevo/petEvoTypes';
import { PetEvoWindow } from '../ui/petevo/petEvoWindow';
import type { BagController } from './BagController';

export interface PetEvoControllerHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
  pets(): PetView[];
  reloadPets(): Promise<void>;
}

export class PetEvoController {
  private readonly win: PetEvoWindow;
  private readonly book: HandbookWindow;
  private readonly offs: (() => void)[] = [];
  private seed: PetView | null = null;
  /** Contract type of the last x1 call: onEnsureBuyContract carries only the gold. */
  private pendingType = 0;

  constructor(private readonly host: PetEvoControllerHost) {
    const view: PetEvoHost = {
      actions: this.actions(),
      pets: () => host.pets(),
      items: () => host.bag.list().filter((i: BagItem) => i.slotType === SlotType.BAG && i.itemType === ItemKind.ITEM),
      player: () => host.player,
      initialPet: () => (this.seed ? host.pets().find((p) => p.id === this.seed?.id) ?? null : null),
    };
    this.win = new PetEvoWindow(view, () => this.win.close());
    this.book = new HandbookWindow(view, () => this.book.close());
    const c = host.client;
    this.offs.push(
      host.bag.subscribe(() => this.refresh()),
      c.on('updateActivatePetObj', (all) => {
        host.player.activePetObject = all as ActivePetObject;
        this.refresh();
      }),
      c.on('onEnsureBuyContract', (gold) => {
        const type = this.pendingType;
        if (type > 0) askConfirm(confirmGoldContract(Number(gold)), () => void this.contractReply(this.call<PetContractReply>('ensureBuyContractPet', type)));
      }),
    );
  }

  /** Pet panel "T.Hóa" button: opens (or re-targets) the window with `pet` pre-selected. */
  open(tab: PetEvoTabId, pet: PetView | null): void {
    this.seed = pet;
    this.win.show(tab);
  }

  openBook(entryId?: number): void {
    this.book.show(entryId);
  }

  /** Pets, bag or wallet changed: redraw whatever is open. */
  refresh(): void {
    if (this.win.isOpen) this.win.refresh();
    if (this.book.isOpen) this.book.refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
    this.book.close();
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T | null> {
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch {
      return null; // the refusal note was pushed by the server
    }
  }

  /** Patches PlayerData.contractPet from a reply and redraws. */
  private async contractReply(reply: Promise<PetContractReply | null>): Promise<PetContractReply | null> {
    const r = await reply;
    if (r) {
      this.host.player.contractPet = applyContractReply(this.host.player.contractPet, r);
      this.refresh();
    }
    return r;
  }

  private async activation(reply: Promise<PetHandbookEntry | null>): Promise<PetHandbookEntry | null> {
    const r = await reply;
    if (r) this.host.player.activePetObject = { ...(this.host.player.activePetObject ?? {}), [String(r.pid)]: r };
    return r;
  }

  private actions(): PetEvoActions {
    return {
      evolve: (petId) => this.call<PetEvolveReply>('toPetEnvolution', petId),
      feather: (petId, protect) => this.call<PetFeatherReply>('toPetFeather', petId, protect),
      featherJump: (petId) => this.call<PetFeatherReply>('toPetFeatherNextStep', petId),
      contract: (type, autoBuy, ten) => {
        this.pendingType = type;
        return this.contractReply(this.call<PetContractReply>(ten ? 'contractPetTen' : 'contractPet', type, autoBuy));
      },
      activate: (pid, num) => this.activation(this.call<PetHandbookEntry>('activePet', { pid, num })),
      activateGold: (pid) => this.activation(this.call<PetHandbookEntry>('activePetGold', { pid, num: 0, moneyType: 'gold' })),
      reloadPets: () => this.host.reloadPets(),
      openBook: (entryId) => this.openBook(entryId),
      openEvolve: (pet) => this.open('evolve', pet),
    };
  }
}
