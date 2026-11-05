// Contracts of the Tiến hóa window and the Sách Tiến Hóa book: the host PetEvoController implements (data + RPC wrappers) and the
// tab interface each tab file builds against. Views never call the client directly.

import type { BagItem, PetContractReply, PetEvolveReply, PetFeatherReply, PetHandbookEntry, PetView, PlayerData } from '@mc/shared';

export type PetEvoTabId = 'evolve' | 'feather' | 'contract';

/** RPC wrappers: a refused / failed call resolves null (the server already pushed the refusal note). */
export interface PetEvoActions {
  evolve(petId: number): Promise<PetEvolveReply | null>;
  feather(petId: number, protect: boolean): Promise<PetFeatherReply | null>;
  featherJump(petId: number): Promise<PetFeatherReply | null>;
  /** contractPet / contractPetTen; null on refusal or while the gold confirm (onEnsureBuyContract) is pending. */
  contract(type: number, autoBuy: boolean, ten: boolean): Promise<PetContractReply | null>;
  activate(pid: number, num: number): Promise<PetHandbookEntry | null>;
  activateGold(pid: number): Promise<PetHandbookEntry | null>;
  /** initViewPetMngP: pull the authoritative pet list (tid / sheet change after an evolution). */
  reloadPets(): Promise<void>;
  /** Cross links between the two windows. */
  openBook(entryId?: number): void;
  openEvolve(pet: PetView | null): void;
}

export interface PetEvoHost {
  actions: PetEvoActions;
  pets(): PetView[];
  /** Bag items of the general pages (main bag). */
  items(): BagItem[];
  player(): PlayerData;
  /** Pet the pet window had selected when the window opened (null = none). */
  initialPet(): PetView | null;
}

export interface PetEvoTabView {
  /** Pets, bag or wallet changed (a push arrived): redraw. */
  refresh(): void;
  dispose(): void;
}

export interface PetEvoTab {
  id: PetEvoTabId;
  label: string;
  build(host: PetEvoHost, body: HTMLElement): PetEvoTabView;
}
