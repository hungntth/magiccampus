// Pure rules of the Mệnh Hồn window: cell addressing (+100 ring wire index), move arguments, level-up / pour amounts, crystal states and
// the reducers that merge the server pushes into the login blobs (soulBagData, tempSoulData, crystalSid, pet.soulInfo).

import {
  PET_SOUL_BAG_SLOTS, PET_SOUL_FREE_BAG_SLOTS, PET_SOUL_LEVEL, PET_SOUL_WIRE_OFFSET, SOUL_CRYSTAL_COST, petSoulDef, petSoulNext, petSoulOpenNum, ringSlotOpen,
  type OnPutSoulToBagPush, type OnUpdateSoulSlotPush, type PetSoulDef, type PetSoulInfoWire, type SoulBagLogin, type SoulSlotWire, type SoulTempLogin,
} from '@mc/shared';

export const RING_SLOTS = 16;
export const TEMP_SLOTS = 14;
export const LAST_CRYSTAL = 5;

/** A bag or ring socket, `slot` 1-based (ring sockets 1..8 follow the pet level, 9..16 are the paid extras). */
export interface SoulCell {
  area: 'bag' | 'ring';
  slot: number;
}

export const sameCell = (a: SoulCell | null, b: SoulCell | null): boolean => !!a && !!b && a.area === b.area && a.slot === b.slot;
export const wireIndex = (cell: SoulCell): number => (cell.area === 'ring' ? cell.slot + PET_SOUL_WIRE_OFFSET : cell.slot);

/** moveSoul(sid, newSid, petId): ring sockets go as slot + 100, the pet id is -1 for a bag-bag move. */
export function moveArgs(from: SoulCell, to: SoulCell, petId: number): [number, number, number] {
  return [wireIndex(from), wireIndex(to), from.area === 'bag' && to.area === 'bag' ? -1 : petId];
}

/** The pet's ring as the panel shows it: openNum is raised to the level value (never lowered), like the server `petSoulInfoWire`. */
export function ringOf(pet: { level: number; soulInfo?: PetSoulInfoWire }): PetSoulInfoWire {
  const info = pet.soulInfo;
  return {
    openNum: Math.max(info?.openNum ?? 0, petSoulOpenNum(pet.level)),
    openNum2: info?.openNum2 ?? 0,
    data: info?.data ?? {},
  };
}

export const ringCellOpen = (ring: PetSoulInfoWire, slot: number): boolean => ringSlotOpen(ring, slot);
export const bagCellOpen = (bag: SoulBagLogin, slot: number): boolean => slot >= 1 && slot <= bag.open;

/** Pet level that opens normal ring socket `slot` (1..8). */
export const ringNeedLevel = (slot: number): number => PET_SOUL_LEVEL[slot - 1] ?? 0;

/** The next extra socket (9..16) a paid openPetSoulBag would open, or 0 when none is left. */
export function nextExtraSlot(ring: PetSoulInfoWire): number {
  return ring.openNum2 >= 8 ? 0 : 9 + ring.openNum2;
}

export function emptyBag(): SoulBagLogin {
  return { open: PET_SOUL_FREE_BAG_SLOTS, data: {} };
}

export interface LevelUpInfo {
  def: PetSoulDef;
  next: PetSoulDef | undefined;
  /** Soul exp still needed for the next level (up_exp minus the in-level exp). */
  need: number;
}

export function levelUpInfo(slot: SoulSlotWire): LevelUpInfo | null {
  const def = petSoulDef(slot.sid);
  if (!def) return null;
  return { def, next: petSoulNext(slot.sid), need: Math.max(0, def.upExp - slot.exp) };
}

/** Flash "Truyền": pour up to what the level still needs, capped by the pool (0 = the "Không đủ kinh nghiệm" alert). */
export const pourMax = (info: LevelUpInfo, pool: number): number => (info.next ? Math.max(0, Math.min(info.need, pool)) : 0);

/** Flash confirms the dissolve of blue or better gems (table colour > 1). */
export const dissolveNeedsConfirm = (def: PetSoulDef): boolean => def.color > 1;

/** The crystal that is lit next to crystal 1 (persisted 0 = only crystal 1). */
export const litCrystal = (crystalSid: number): number => (crystalSid > 1 && crystalSid <= LAST_CRYSTAL ? crystalSid : 1);
export const crystalOpen = (crystalSid: number, index: number): boolean => index === 1 || index === litCrystal(crystalSid);
export const crystalCost = (index: number): number => SOUL_CRYSTAL_COST[index - 1] ?? 0;
/** newIndex of a prey push is the lit crystal 1..5; the login blob keeps 0 for "only crystal 1". */
export const persistCrystal = (index: number): number => (index > 1 && index <= LAST_CRYSTAL ? index : 0);

export const countOf = (data: Record<string, unknown>): number => Object.keys(data).length;
export const bagFull = (bag: SoulBagLogin): boolean => countOf(bag.data) >= Math.min(bag.open, PET_SOUL_BAG_SLOTS);

// --- reducers (mutate the given blobs; the controller redraws afterwards) ---

export function setBagSlot(bag: SoulBagLogin, slot: SoulSlotWire): void {
  bag.data[String(slot.s)] = slot;
}

export function dropBagSlot(bag: SoulBagLogin, index: number): void {
  delete bag.data[String(index)];
}

/** Ring slots are keyed by their plain index; the wire `s` carries index + 100. */
export function setRingSlot(ring: PetSoulInfoWire, slot: SoulSlotWire): void {
  ring.data[String(slot.s - PET_SOUL_WIRE_OFFSET)] = slot;
}

/** onPutSoulToBag entry: the temp gem leaves, the gem lands in the bag slot named by `soulData.s`. Returns false for a refusal entry. */
export function applyPutToBag(bag: SoulBagLogin, temp: SoulTempLogin, entry: OnPutSoulToBagPush): boolean {
  if (entry.f !== 1) return false;
  delete temp[String(entry.index)];
  setBagSlot(bag, entry.soulData);
  return true;
}

function swapSlots(ra: Record<string, SoulSlotWire>, ka: number, oa: number, rb: Record<string, SoulSlotWire>, kb: number, ob: number): void {
  const x = ra[String(ka)];
  const y = rb[String(kb)];
  delete ra[String(ka)];
  delete rb[String(kb)];
  if (y) ra[String(ka)] = { ...y, s: ka + oa };
  if (x) rb[String(kb)] = { ...x, s: kb + ob };
}

/** onUpdateSoulSlot f 1: swaps the two slots (type 1 bag-bag, 2 ring-ring, 3 sid ring / newSid bag, 4 sid bag / newSid ring). */
export function applyMove(bag: SoulBagLogin, ring: PetSoulInfoWire | null, push: OnUpdateSoulSlotPush): boolean {
  if (push.f !== 1 || push.sid === undefined || push.newSid === undefined) return false;
  const off = PET_SOUL_WIRE_OFFSET;
  const strip = (n: number): number => (n > off ? n - off : n);
  const a = strip(push.sid);
  const b = strip(push.newSid);
  if (push.type === 1) swapSlots(bag.data, a, 0, bag.data, b, 0);
  else if (!ring) return false;
  else if (push.type === 2) swapSlots(ring.data, a, off, ring.data, b, off);
  else if (push.type === 3) swapSlots(ring.data, a, off, bag.data, b, 0);
  else if (push.type === 4) swapSlots(bag.data, a, 0, ring.data, b, off);
  else return false;
  return true;
}
