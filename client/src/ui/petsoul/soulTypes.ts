// Contracts between the Mệnh Hồn window (views) and PetSoulController (RPCs, pushes, state). Views never call the client directly;
// every action is fire-and-forget and the result arrives as a push (or a reply) that the controller merges before redrawing.

import type { PlayerData, PetView, SoulBagLogin, SoulTempLogin } from '@mc/shared';
import type { SoulCell } from './soulRules';

export interface SoulActions {
  openBag(): void;
  lock(slot: number): void;
  /** Bag gem (`bag` cell) or ring gem of `petId` (sent as slot + 100). */
  levelUp(cell: SoulCell, petId: number): void;
  pour(slot: number, amount: number): void;
  dissolve(slot: number): void;
  /** Quick dissolve: menu colour 1 Trắng, 2 Lục, 3 Lam. */
  dissolveAll(menu: number): void;
  move(from: SoulCell, to: SoulCell, petId: number): void;
  openRing(petId: number): void;
  prey(index: number): void;
  preyQuick(): void;
  preyAdvanced(): void;
  toBag(index: number): void;
  toBagAll(): void;
  dissolveTemp(index: number): void;
  dissolveTempAll(menu: number): void;
  exchange(soulId: number): void;
}

export interface SoulHost {
  actions: SoulActions;
  player(): PlayerData;
  pets(): PetView[];
  bag(): SoulBagLogin;
  temp(): SoulTempLogin;
  crystalSid(): number;
}

export type SoulTabId = 'overview' | 'prey' | 'exchange';

/** Window state shared by the tabs (survives redraws). */
export interface SoulUi {
  petId: number;
  sel: SoulCell | null;
  /** Armed "Di chuyển": the next cell tapped is the target of the selected gem. */
  moving: boolean;
  tempSel: number;
  /** Quick dissolve menu colour 1..3. */
  menu: number;
}

export interface SoulCtx {
  host: SoulHost;
  ui: SoulUi;
  /** Rebuilds the current tab. */
  redraw(): void;
}
