// Pet skills, pet equipment and extra pet slots (phase E): constants, wire types and the pure helpers both sides use.
// Pushes are positional like the Flash handlers: onPetEquipOn(petId, pos, oldItemId, newItemId), onPetEquipOff(petId, pos, itemId),
// onUpdatePet(petId, "skillN" | "equN", value), onPetSkillInfo(PetSkillInfoMap) (H5: names/tooltips for learned skill ids).

/** Pet equipment lives in character_items with slotType SlotType.PET_EQUIP; template positions 50..57 are equ1..equ8. */
export const PET_EQUIP_POS_BASE = 50;
export const PET_EQUIP_SLOTS = 8;
/** `BagItem.sid` of a pet-equipment row: PET_EQUIP_SID_BASE + slotIndex (never collides with bag sids 2101+ or equip sids 1..22). */
export const PET_EQUIP_SID_BASE = 100000;

export const PET_SKILL_SLOT_COUNT = 15;
/** First slot that must be opened with gold (slots 1..5 start open, 6..15 locked). */
export const PET_FIRST_LOCKED_SLOT = 6;
/** GamePredef GOLD_PET_SKILLOPEN[slot] (slots 6..15) and GOLD_PET_SKILLOPEN_Q[creature qLevel]. */
const SKILL_OPEN_GOLD = [10, 20, 40, 70, 110, 160, 220, 290, 370, 460] as const;
const SKILL_OPEN_Q: Readonly<Record<number, number>> = { 1: 1, 2: 3, 3: 10 };

/** Item 1364 "Thuốc Tẩy Kỹ Năng Pet": consumed by petDelSkill. */
export const PET_SKILL_DEL_ITEM = 1364;
/** Item 326 "Sách Mở Rộng Túi Đựng Pet": its `gold` column (20) is the price of petOpenSlot. */
export const PET_SLOT_ITEM = 326;
export const PET_SLOT_GOLD = 20;
/** Template type of pet skill books (use_type 2). */
export const ITEM_TYPE_PET_BOOK = 506;

/** Gold to open skill slot `slot` (6..15) of a creature with quality `qLevel` (1..3); null when not openable. */
export function petSkillOpenCost(slot: number, qLevel: number): number | null {
  if (!Number.isInteger(slot) || slot < PET_FIRST_LOCKED_SLOT || slot > PET_SKILL_SLOT_COUNT) return null;
  const mult = SKILL_OPEN_Q[qLevel];
  return mult === undefined ? null : SKILL_OPEN_GOLD[slot - PET_FIRST_LOCKED_SLOT] * mult;
}

/** slotIndex of an equipped pet item under the unique (character, slotType, slotIndex) index: petId * 8 + (pos - 50). */
export function petEquipSlotIndex(petId: number, pos: number): number {
  return petId * PET_EQUIP_SLOTS + (pos - PET_EQUIP_POS_BASE);
}

export function petEquipOwner(slotIndex: number): { petId: number; pos: number } {
  return { petId: Math.floor(slotIndex / PET_EQUIP_SLOTS), pos: PET_EQUIP_POS_BASE + (slotIndex % PET_EQUIP_SLOTS) };
}

export const isPetEquipPosition = (position: number): boolean =>
  Number.isInteger(position) && position >= PET_EQUIP_POS_BASE && position < PET_EQUIP_POS_BASE + PET_EQUIP_SLOTS;

/** petBook reply: f 1 = done (rf true) or nothing changed (rf false), 2 = book / skill problem, 3 = bad input; n = books left. */
export interface PetBookReply {
  f: 1 | 2 | 3;
  rf?: boolean;
  n?: number;
}

/** Display facts of a learned pet skill (the Flash client reads TBL_SKILL locally; H5 sends them). */
export interface PetSkillInfo {
  id: number;
  name: string;
  iconCode: string;
  type: number; // skill type (11 = passive)
  info: string; // description (passive: the buff text)
}

/** onPetSkillInfo payload and `PetView.skillInfo`: learned skill ids of the pet(s) -> display facts. */
export type PetSkillInfoMap = Record<number, PetSkillInfo>;
