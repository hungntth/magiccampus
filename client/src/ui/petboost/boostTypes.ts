// Contracts between the boost windows (views) and the controllers that own the RPCs, pushes and state (game/PetBoostController.ts).
// Views never call the client directly; every wrapper resolves null when the server refused (the note arrives as onSystemMidMsgOrNote).

import type {
  PetGuardData, PetTalentData, PetView, PlayerData, TalentBagDelta, TalentBagEntry, TalentSlotDelta, TalentStonePush,
} from '@mc/shared';

export interface GuardActions {
  place(petId: number, sid: number): Promise<PetGuardData | null>;
  putDown(sid: number): Promise<PetGuardData | null>;
  /** costType 2 = tokens, 1 = plain gold (after the confirm). */
  upgrade(sid: number, costType: 1 | 2): Promise<PetGuardData | null>;
}

export interface GuardHost {
  actions: GuardActions;
  pets(): PetView[];
  data(): PetGuardData;
  player(): PlayerData;
}

export interface TalentActions {
  /** initTalentPanelData: authoritative state (applied to the player by the controller). */
  load(): Promise<PetTalentData | null>;
  upSlot(sid: number, useGold: boolean): Promise<TalentSlotDelta | null>;
  fill(bagSlot: number, socketSid: number, tid: number): Promise<TalentStonePush | null>;
  takeOff(socketSid: number, bagSlot: number, tid: number): Promise<TalentStonePush | null>;
  move(from: number, to: number): Promise<TalentBagDelta | null>;
  arrange(): Promise<Record<string, TalentBagEntry> | null>;
  breakStone(slot: number, tid: number, count: number): Promise<TalentBagDelta | null>;
  /** Two stones (bag slot + stone id each) -> one re-rolled stone. */
  reset(slots: number[], tids: number[]): Promise<TalentBagDelta | null>;
  /** Five stones -> one stone a level up; `direction` spends the Dinh Huong Phu. */
  fuse(slots: number[], tids: number[], direction: boolean): Promise<TalentBagDelta | null>;
}

export interface TalentHost {
  actions: TalentActions;
  data(): PetTalentData;
  player(): PlayerData;
  /** Units of the direction talisman (item 4181) in the bag. */
  directionCount(): number;
}
