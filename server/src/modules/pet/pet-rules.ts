// Pure pet rules: state-change gates (Flash alerts PETMANAGERPANEL_S[2]/[3] enforced server side), name check,
// starting skill slots and the changePetProperty argument parsing (same all-or-nothing rule as changeProperty).

import { PetLimits, PetState } from '@mc/shared';
import { parseChangeProperty } from '../character/character-points';
import type { AttrKey } from '../character/character-stats';

export const PET_SKILL_SLOTS = 15;
export const PET_EQU_SLOTS = 8;
/** Slots 1..5 start open (0) and are seeded from the creature's default skills; 6..15 are locked (-1). */
const OPEN_SLOTS = 5;

export interface StateGateInput {
  petLevel: number;
  ownerLevel: number;
  useLv: number; // creature template use_lv
  life: number;
}

/** Why a pet cannot become the battle pet, or null. Resting (state 3) is always allowed. */
export function battleStateBlocker(g: StateGateInput): string | null {
  if (g.life <= 0) return 'Pet đã hết thọ mệnh, hãy dùng vật phẩm hồi phục!';
  if (g.petLevel - 5 > g.ownerLevel) return 'Không thể triệu hồi pet có cấp độ cao hơn cấp độ nhân vật 5 cấp!';
  if (g.useLv > g.ownerLevel) {
    return `Không thể triệu hồi pet có cấp độ cao hơn nhân vật!\nNgười chơi cần đạt cấp ${g.useLv} mới có thể thuần phục pet.`;
  }
  return null;
}

/** changePetState accepts 1 (battle) and 3 (rest); 2 is unused in H5. */
export function isSettableState(v: number): v is 1 | 3 {
  return v === PetState.BATTLE || v === PetState.REST;
}

export type PetNameResult = { ok: true; name: string | null } | { ok: false };

/** 1..20 characters after trimming; "" resets to the template name (name null). Control characters are rejected. */
export function parsePetName(raw: unknown): PetNameResult {
  if (typeof raw !== 'string') return { ok: false };
  const name = raw.trim();
  if (name.length === 0) return { ok: true, name: null };
  if ([...name].length > PetLimits.nameMax || /[\u0000-\u001f\u007f<>]/.test(name)) return { ok: false };
  return { ok: true, name };
}

/** skill1..15 of a new pet: seeded default skills in the first five slots, the rest locked. */
export function initialSkills(defaults: readonly number[]): number[] {
  const out = new Array<number>(PET_SKILL_SLOTS).fill(-1);
  for (let i = 0; i < OPEN_SLOTS; i++) out[i] = defaults[i] !== undefined && defaults[i] > 0 ? defaults[i] : 0;
  return out;
}

export const emptyEquipment = (): number[] => new Array<number>(PET_EQU_SLOTS).fill(0);

/** changePetProperty arg: per-attribute increments, null when the arg is not an object (same parsing as characters). */
export function parsePetProperty(arg: unknown): { add: Record<AttrKey, number>; total: number } | null {
  return parseChangeProperty(arg);
}

/** Full-capacity check for new pets (Go: count + incoming <= petMaxNum). */
export function hasPetRoom(count: number, petMaxNum: number, incoming = 1): boolean {
  return count + incoming <= petMaxNum;
}

/** Flash Core.createCharactor/createPlayer: a character in an active (non-AFK) party does not show its following pet. */
export const petShownOnMap = (c: { inGroup: boolean; groupAfk: boolean }): boolean => !c.inGroup || c.groupAfk;

/** Life every battling pet loses per battle, any outcome (Go applyPetLifeDrain). */
export const PET_BATTLE_LIFE_COST = 10;
/** Pet exp share of a won battle: half of the per-survivor character exp (Go rewards.go), even when the pet died. */
export const petBattleExp = (splitExp: number): number => Math.max(0, Math.floor(splitExp * 0.5));
export const petLifeAfterBattle = (life: number): number => Math.max(0, life - PET_BATTLE_LIFE_COST);
