// Contracts of the Tụ Linh Bảo Thạch window: the host PetStoneController implements (state + RPC wrappers) and the tab interface the
// tab files build against. Views never call the client directly; wrappers resolve null on refusal (the note is pushed by the server).

import type { BagItem, PetStoneBag, PetStoneEnergyReply, PetStoneHoleWire, PetStoneSetReply, PlayerData } from '@mc/shared';

export type StoneTabId = 'compose' | 'absorb' | 'inlay' | 'energy' | 'resolve';

/** One occupied slot of the stone bag (`sid` is the 0-based wire index). */
export interface StoneEntry {
  sid: number;
  tid: number;
  num: number;
  skillId: number;
}

export interface StoneActions {
  compose(sid: number, qty: number): Promise<PetStoneBag | null>;
  /** Five selections: the main stone first. */
  absorb(sids: number[]): Promise<PetStoneBag | null>;
  resolve(sid: number, num: number): Promise<PetStoneBag | null>;
  /** Holes of a pet gear item (null when the item is refused). */
  holes(itemId: number): Promise<PetStoneHoleWire | null>;
  set(itemId: number, hole: number, sid: number): Promise<PetStoneSetReply | null>;
  remove(itemId: number, hole: number): Promise<PetStoneSetReply | null>;
  /** type 1 = passive skill, 2 = special skill. */
  energy(sid: number, type: 1 | 2): Promise<PetStoneEnergyReply | null>;
}

/** A pet gear item of the Khảm list: in the bag or worn by `owner` (a pet name). */
export interface GearOption {
  item: BagItem;
  owner: string | null;
}

export interface StoneHost {
  actions: StoneActions;
  /** Occupied stone-bag slots, by sid. */
  entries(): StoneEntry[];
  gear(): GearOption[];
  player(): PlayerData;
}

export interface StoneTabView {
  /** Bag / wallet / gear changed: redraw. */
  refresh(): void;
  dispose(): void;
}

export interface StoneTab {
  id: StoneTabId;
  label: string;
  build(host: StoneHost, body: HTMLElement): StoneTabView;
}
