// M12 Menh Hon wire shapes: login blobs, pushes and replies (Flash names / keys, from the Go handlers and CallBack bytecode).
// A slot goes out as {s, sid, soulId, exp, lock}; `s` is the slot index (+100 for a pet ring slot).

import { PET_SOUL_WIRE_OFFSET, petSoulOpenNum, type PetSoulInfo, type SoulSlot } from './petSoul.js';

export interface SoulSlotWire {
  s: number;
  sid: number;
  soulId: number;
  exp: number;
  lock: boolean;
}

/** PetView.soulInfo / PetWrapper.soulInfo: ring slots are keyed by their plain index, `s` carries index + 100. */
export interface PetSoulInfoWire {
  openNum: number;
  openNum2: number;
  data: Record<string, SoulSlotWire>;
}

/** Login `soulBagData` (character bag). */
export interface SoulBagLogin {
  open: number;
  data: Record<string, SoulSlotWire>;
}

/** Login `tempSoulData`: temp prey slot -> rolled soul id. */
export type SoulTempLogin = Record<string, number>;

export interface OnOpenBagPush { index: number }
export interface OnLockSoulPush { index: number; lock: boolean }
export interface OnSoulLevelUpPush { soulData: SoulSlotWire; soulExp: number; pid?: number }
export interface OnPutInToExpPush { soulData: SoulSlotWire; soulExp: number }
export interface OnTransformExpPush { f: 1; index: number; soulExp: number; chip: number }
export interface OnTransAllExpPush { data: Record<string, OnTransformExpPush>; soulExp: number; chip: number }
export interface OnTransformExpInPanelPush { index: number; soulExp: number; chip: number }
export interface OnTransAllExpInPanelPush { data: Record<string, OnTransformExpInPanelPush>; soulExp: number; chip: number }
/** moveSoul: f 0 = refused (client alerts PET_SOUL_S[38]); type 1 bag-bag, 2 ring-ring, 3 sid is a ring slot and newSid a bag slot, 4 the reverse. */
export interface OnUpdateSoulSlotPush { f: 0 | 1; sid?: number; newSid?: number; type?: 1 | 2 | 3 | 4 }
export interface PreySoulSidObj { index: number; ii: number }
export interface OnPreySoulSinglePush { sidObj: PreySoulSidObj; newIndex: number; point: number }
/** type 2 = not enough Pha Le (PET_SOUL_S[9]), 1 = cannot divine (PET_SOUL_S[10]). */
export interface OnPreySoulFailPush { type: 1 | 2 }
export interface OnPreySoulAllPush { data: Record<string, { sidObj: PreySoulSidObj }>; newIndex: number; point: number }
export type OnPutSoulToBagPush = { f: 1; index: number; soulData: SoulSlotWire } | { f: 0; type: 2 };
/** Keys are temp indexes; `full` carries {f:0,type:2} when the bag filled first ("Tui Menh Hon da day"). */
export type OnPutAllSoulToBagPush = Record<string, OnPutSoulToBagPush>;
/** exchangeSoul reply: type 1 ok (soulData, chip), 2 bag full, 3 invalid / not enough chips. */
export interface ExchangeSoulReply { type: 1 | 2 | 3; soulData?: SoulSlotWire; chip?: number }
export interface OpenPetSoulBagReply { soulExp: number; pid: number; openNum2: number }

export function soulSlotWire(index: number, slot: SoulSlot, offset = 0): SoulSlotWire {
  return { s: index + offset, sid: slot.sid, soulId: slot.sid, exp: slot.exp, lock: !!slot.lock };
}

export function soulSlotsWire(data: Record<string, SoulSlot | null | undefined>, offset = 0): Record<string, SoulSlotWire> {
  const out: Record<string, SoulSlotWire> = {};
  for (const [key, slot] of Object.entries(data)) {
    const index = Number(key);
    if (slot && slot.sid > 0 && Number.isInteger(index) && index > 0) out[key] = soulSlotWire(index, slot, offset);
  }
  return out;
}

/** The pet's soulInfo for the panel: openNum is raised to the level value (never lowered), slots carry the +100 wire index. */
export function petSoulInfoWire(soul: Partial<PetSoulInfo> | null | undefined, level: number): PetSoulInfoWire {
  return {
    openNum: Math.max(Number(soul?.openNum ?? 0) || 0, petSoulOpenNum(level)),
    openNum2: Number(soul?.openNum2 ?? 0) || 0,
    data: soulSlotsWire(soul?.data ?? {}, PET_SOUL_WIRE_OFFSET),
  };
}

/** chooseCharactor extras (Flash Player fields): character bag, temp prey bag and the lit crystal (0 = only crystal 1). */
export interface PetSoulLogin {
  soulBagData: SoulBagLogin;
  tempSoulData: SoulTempLogin;
  crystalSid: number;
}
