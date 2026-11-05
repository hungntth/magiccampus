// M12 pet-stone rules shared by the Pet Stone panel and server validation (Tu Linh Bao Thach).
// Stones are feature-state records, never ordinary inventory items. Inlaid stones live on the pet gear item
// (`properties.flag3`, JSON {"hole":[tid,0,skillId]}) and give no stats (user decision): they are stored and shown only.

import type { BagItem } from './inventory.js';

/** Stone bag slots are 0..319 (the sparse wire array index is the client `sid`). */
export const PET_STONE_BAG_SLOTS = 320;
export const PET_STONE_COMPOSE_RATIO = 3;
export const PET_STONE_MAX_COMPOSE_QTY = 999;
export const PET_STONE_MAX_NORMAL_LEVEL = 5;
export const PET_STONE_ABSORB_COUNT = 5;
export const PET_STONE_HOLES = 6;
export const PET_STONE_ENERGY_HOLE = 1;
/** Template `kind` of pet equipment in data_tbl_equipt_template. */
export const PET_STONE_GEAR_KIND = 9;
export const PET_STONE_ENERGY_COST = { passive: 500, special: 1000 } as const;
/** changePetStoneEnergy `type` argument: 1 passive (base skill), 2 special (ex-stone skill). */
export const PET_STONE_SKILL_TYPE = { passive: 1, special: 2 } as const;

/** Sparse wire entry at a stone-bag slot: template id, stack count, refined skill id. */
export type PetStoneBagEntry = readonly [tid: number, num: number, skillId: number];
export type PetStoneBag = Array<PetStoneBagEntry | undefined>;

/** getPetStoneByEid reply for a pet gear item: `{"<hole>": [tid, 0, skillId]}`; `{}` without stones, -1 for a refused item. */
export type PetStoneHoleWire = Record<string, readonly [tid: number, zero: 0, skillId: number]>;

/** petStoneSet / removePetStone reply (Flash onPetStoneSet): the changed hole and the full item (`{}` when the item is refused). */
export interface PetStoneSetReply {
  bagData: PetStoneBag;
  slotId: number;
  newId: number; // stone template id now in the hole, 0 after a removal / empty hole
  skillId: number;
  equData: BagItem | Record<string, never>;
}

/** changePetStoneEnergy reply. */
export interface PetStoneEnergyReply {
  sid: number;
  skillId: number;
  bagData: PetStoneBag;
  newSid: number;
}

/** Static row of data_tbl_pet_stone used by the rule helpers. */
export interface PetStoneTemplate {
  id: number;
  level: number;
  nextId: number;
  costSil: number;
  propType: number;
  energyFlag: boolean;
  energyId: number;
  resolveNum: number;
}

/** A composition takes exactly three source stones per output; impossible requests return null. */
export function petStoneComposeNeed(stone: Pick<PetStoneTemplate, 'level' | 'nextId' | 'energyFlag'>, qty: number): number | null {
  if (!Number.isInteger(qty) || qty < 1 || stone.level >= PET_STONE_MAX_NORMAL_LEVEL || stone.energyFlag || stone.nextId <= 0) return null;
  return qty * PET_STONE_COMPOSE_RATIO;
}

/** Hole 1 accepts energy stones only; holes 2..6 accept regular stones only. */
export function petStoneFitsHole(hole: number, energyFlag: boolean): boolean {
  return Number.isInteger(hole) && hole >= 1 && hole <= PET_STONE_HOLES && (hole === PET_STONE_ENERGY_HOLE ? energyFlag : !energyFlag);
}

export type PetStoneInlayRefusal = 'hole' | 'notEnergySlot' | 'energyOnlyFirst' | 'taken' | 'sameProp';

/** First reason an inlay is refused (Go order: hole range, hole kind, occupied hole, duplicate property), null when allowed. */
export function petStoneInlayRefusal(
  hole: number,
  stone: Pick<PetStoneTemplate, 'energyFlag' | 'propType'>,
  holes: Readonly<Record<number, number | undefined>>,
  templateOf: (id: number) => Pick<PetStoneTemplate, 'propType'> | undefined,
): PetStoneInlayRefusal | null {
  if (!Number.isInteger(hole) || hole < 1 || hole > PET_STONE_HOLES) return 'hole';
  if (hole === PET_STONE_ENERGY_HOLE && !stone.energyFlag) return 'notEnergySlot';
  if (hole !== PET_STONE_ENERGY_HOLE && stone.energyFlag) return 'energyOnlyFirst';
  if (holes[hole]) return 'taken';
  const same = Object.values(holes).some((id) => id && templateOf(id)?.propType === stone.propType);
  return same ? 'sameProp' : null;
}

/** Inlay cannot duplicate a stone property on one pet equipment item. */
export function petStoneCanInlay(
  hole: number,
  stone: Pick<PetStoneTemplate, 'energyFlag' | 'propType'>,
  holes: Readonly<Record<number, number | undefined>>,
  templateOf: (id: number) => Pick<PetStoneTemplate, 'propType'> | undefined,
): boolean {
  return petStoneInlayRefusal(hole, stone, holes, templateOf) === null;
}

/**
 * A five-stone absorb takes five selections (the same slot may repeat while its stack covers the count), all regular
 * level 5 stones of any family; the main (first) stone decides the result: its family's energy stone id.
 */
export function petStoneAbsorbValid(stones: readonly Pick<PetStoneTemplate, 'level' | 'energyFlag' | 'energyId'>[]): number | null {
  if (stones.length !== PET_STONE_ABSORB_COUNT
    || stones.some((s) => s.level !== PET_STONE_MAX_NORMAL_LEVEL || s.energyFlag) || stones[0].energyId <= 0) return null;
  return stones[0].energyId;
}

/** One inlaid stone of an item. */
export interface PetStoneHole {
  tid: number;
  skillId: number;
}
export type PetStoneHoleMap = Record<number, PetStoneHole>;

/** Parses `properties.flag3`: the stored JSON string, also the unquoted GM form `{1:[1,1,12345]}`. Bad input yields no holes. */
export function parseStoneHoles(raw: unknown): PetStoneHoleMap {
  const out: PetStoneHoleMap = {};
  if (typeof raw !== 'string' || raw.trim() === '') return out;
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/([{,]\s*)(\d+)\s*:/g, '$1"$2":'));
  } catch {
    return out;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return out;
  for (const [key, value] of Object.entries(data)) {
    const hole = Number(key);
    if (!Number.isInteger(hole) || hole < 1 || hole > PET_STONE_HOLES || !Array.isArray(value)) continue;
    const tid = Number(value[0]);
    if (!Number.isInteger(tid) || tid <= 0) continue;
    const skillId = Number(value[2]);
    out[hole] = { tid, skillId: Number.isInteger(skillId) && skillId > 0 ? skillId : 0 };
  }
  return out;
}

/** `flag3` text for the holes; '' when there are none (the property is then removed). */
export function encodeStoneHoles(holes: PetStoneHoleMap): string {
  const keys = Object.keys(holes).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `"${k}":[${holes[k].tid},0,${holes[k].skillId}]`).join(',')}}`;
}

export function stoneHolesWire(holes: PetStoneHoleMap): PetStoneHoleWire {
  const out: PetStoneHoleWire = {};
  for (const [k, h] of Object.entries(holes)) out[k] = [h.tid, 0, h.skillId];
  return out;
}
