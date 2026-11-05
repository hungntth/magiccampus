// Pure helpers of the Luyện pet window: sorting bag items by their pet-function `prop_type`, pet eligibility filters and the
// small cost / label tables. Rates themselves come from @mc/shared (petStarRate, PET_JOIN_SUCCESS, seniorJoinRate, petEatRate).

import {
  basicMoney, CHAR_ELEMENT_NAMES, ItemKind, PET_APTITUDE_KEYS, petGrowColor, petLevelOfExp, SlotType,
  type BagItem, type PetAptitudeKey, type PetView,
} from '@mc/shared';

/** Flash item `prop_type` of the type 507 pet-function items. */
export const TRAIN_PROP = { point: 1, xsd: 2, star: 3, rebirth: 4, clear: 5, safe: 6, luck: 7 } as const;
/** Item::ITEM_PET_SKILL_UP by creature quality (Go skill_upgrade.go). */
export const SKILL_UP_BOOKS: readonly number[] = [1365, 1366, 1367];
export const SKILL_MAX_LEVEL = 3;
/** Cao Cap Tay Tuy Dan pills (template colour 4) are 1652..1656. */
export const XSD_ADVANCED_MIN_COLOR = 4;

export const APT_LABEL: Readonly<Record<PetAptitudeKey, string>> = {
  strength: 'Lực', agility: 'Xảo', stamina: 'Nhẫn', intelligence: 'Trí', energy: 'Thần',
};
/** 1-based aptitude index (the wire `aptType`) -> key. */
export const aptKeyOfType = (type: number): PetAptitudeKey | undefined => PET_APTITUDE_KEYS[type - 1];

const cap = (k: PetAptitudeKey): string => k.charAt(0).toUpperCase() + k.slice(1);
export const aptBase = (pet: PetView, k: PetAptitudeKey): number => pet[`apt${cap(k)}` as 'aptStrength'];
export const aptEx = (pet: PetView, k: PetAptitudeKey): number => pet[`apt${cap(k)}Ex` as 'aptStrengthEx'];
export const aptName = (k: PetAptitudeKey): string => `apt${cap(k)}`;

/** Bag stacks (main pages) of a type 507 item with the given `prop_type`, by colour then slot. */
export function itemsByProp(items: readonly BagItem[], propType: number): BagItem[] {
  return items
    .filter((i) => i.slotType === SlotType.BAG && i.itemType === ItemKind.ITEM && i.tplType === 507 && i.tplPropType === propType && i.stackNum > 0)
    .sort((a, b) => a.color - b.color || a.sid - b.sid);
}

/** Bag stacks of an item template (skill books, Noi Don Tinh Linh). */
export function itemsByTid(items: readonly BagItem[], tid: number): BagItem[] {
  return items.filter((i) => i.slotType === SlotType.BAG && i.itemType === ItemKind.ITEM && i.tid === tid && i.stackNum > 0).sort((a, b) => a.sid - b.sid);
}

export const stackTotal = (stacks: readonly BagItem[]): number => stacks.reduce((n, i) => n + i.stackNum, 0);

export const petColor = (pet: PetView): number => petGrowColor(pet.growRate);
export const petLevel = (pet: PetView): number => petLevelOfExp(pet.exp);
export const petHasGear = (pet: PetView): boolean => [1, 2, 3, 4, 5, 6, 7, 8].some((n) => pet[`equ${n as 1}`] > 0);

/** Not usable as a fusion / Ao Hoa material: fighting, following on the map, or wearing gear. */
export const petBusy = (pet: PetView, followId: number): boolean => pet.state === 1 || pet.id === followId || petHasGear(pet);

/** Sub pets that can join `main`: same creature and colour, free, not already chosen. */
export function joinCandidates(main: PetView, pets: readonly PetView[], chosen: readonly number[], followId: number): PetView[] {
  const color = petColor(main);
  return pets.filter((p) => p.id !== main.id && p.tid === main.tid && petColor(p) === color && !chosen.includes(p.id) && !petBusy(p, followId));
}

/** Skill book template that upgrades a pet skill and how many it takes from `level`. */
export const skillUpBook = (qLevel: number): number => SKILL_UP_BOOKS[Math.max(0, qLevel - 1)] ?? SKILL_UP_BOOKS[0];
export const skillUpNeed = (level: number): number => (level <= 1 ? 1 : 3);

/** Nguyen To cost: round(BASIC_GET_MONEY[level] x 0.1) silver. */
export const elementCostOf = (pet: PetView): number => Math.round(basicMoney(petLevel(pet)) * 0.1);

/** Pet element 1..6 (Flash GAMEPREDEF_S[242..247]): Quang, Ám, Phong, Địa, Thủy, Hỏa. */
export const elementName = (element: number): string => CHAR_ELEMENT_NAMES[element] ?? 'Vô';

/** The six selectable pet elements. */
export const ELEMENT_NAMES_LIST: readonly number[] = [1, 2, 3, 4, 5, 6];

export const fmtRate = (n: number): string => `${Math.round(n * 10) / 10}%`;
