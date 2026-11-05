// Pure pet training rules (M12 phase A; Go application/pet star.go, join.go, xsd.go, rebirth.go, element.go): star outcome,
// fusion eligibility / roll, Tay Tuy (xsd) roll, Phuc Sinh (rebirth) roll, element cost and announcement texts.
// Randomness is injected (`rng` returns [0, 1)); no Mongo, no Nest.

import {
  basicMoney, PET_JOIN_SUCCESS, PET_STAR_MAX, petGrowBandMax, petGrowColor, petGrowRoll, petStarRate, petXsdRange, roundGrow,
  SENIOR_JOIN_MAX_SUBS, SENIOR_JOIN_MIN_SUBS, type Rng,
} from '@mc/shared';
import type { AttrKey } from '../character/character-stats';
import type { Pet } from './pet.schema';

export const STAR_RESET_FROM = 8; // a failure at >= 8 stars loses them (unless a Chuc Phuc protects)
export const STAR_MILESTONE_FROM = 9;
export const STAR_MILESTONE_BONUS = 0.1;
export const XSD_ADVANCED_MIN_COLOR = 4; // item template colour of the Cao Cap Tay Tuy Dan pills
export const ELEMENT_COST_FACTOR = 0.1;

/** Aptitude types 1..5 (Luc / Xao / Nhan / Tri / Than): pet-store key, stat key and the apt<Key> view name. */
export const APT_KEYS = ['strength', 'agility', 'stamina', 'intelligence', 'energy'] as const;
export type AptKey = (typeof APT_KEYS)[number];
export const APT_ATTR: Readonly<Record<AptKey, AttrKey>> = { strength: 'str', agility: 'agi', stamina: 'sta', intelligence: 'int', energy: 'eng' };
export const aptName = (key: AptKey): string => `apt${key[0].toUpperCase()}${key.slice(1)}`;

const percentRoll = (rng: Rng): number => Math.floor(rng() * 100);

// --- star (petStar) ---

export interface StarOutcome {
  success: boolean;
  starNum: number;
  starGrowAdd: number;
  /** The Chuc Phuc stone protected the stars (consumed). */
  safeUsed: boolean;
  /** The stars and their growth share were lost. */
  reset: boolean;
}

/** One attempt at the next star: the rate is read at starNum + 1; the star item itself is always consumed by the caller. */
export function resolveStar(starNum: number, starGrowAdd: number, itemGrow: number, hasSafe: boolean, rng: Rng): StarOutcome {
  if (starNum >= PET_STAR_MAX) return { success: false, starNum, starGrowAdd, safeUsed: false, reset: false };
  if (percentRoll(rng) < petStarRate(starNum)) {
    const next = starNum + 1;
    const add = itemGrow + (next >= STAR_MILESTONE_FROM ? STAR_MILESTONE_BONUS : 0);
    return { success: true, starNum: next, starGrowAdd: roundGrow(starGrowAdd + add), safeUsed: false, reset: false };
  }
  if (starNum >= STAR_RESET_FROM) {
    return hasSafe
      ? { success: false, starNum, starGrowAdd, safeUsed: true, reset: false }
      : { success: false, starNum: 0, starGrowAdd: 0, safeUsed: false, reset: true };
  }
  return { success: false, starNum, starGrowAdd, safeUsed: false, reset: false };
}

/** growRateAdd after the star share changed from `oldShare` to `newShare` (other contributions are kept). */
export const growRateAddAfterStars = (growRateAdd: number, oldShare: number, newShare: number): number =>
  Math.max(0, roundGrow(growRateAdd - oldShare + newShare));

// --- fusion (petJoin / seniorPetJoin) ---

type JoinPet = Pick<Pet, '_id' | 'tid' | 'growRate' | 'state' | 'following' | 'equ' | 'binded' | 'soul'>;

/** Why a sub pet cannot be fused away (null = fine). `guarded` holds the ids in a guard slot. */
export function joinSubBlocker(main: JoinPet, sub: JoinPet, guarded: ReadonlySet<number>, senior = false): string | null {
  if (sub.tid !== main.tid || petGrowColor(sub.growRate) !== petGrowColor(main.growRate)) return 'Pet phụ phải cùng loại và cùng phẩm chất';
  if ((sub.equ ?? []).some((id) => id > 0)) return 'Phải gỡ trang bị của pet phụ trước khi dung hợp';
  if (sub.state === 1 || sub.following || guarded.has(sub._id)) return 'Pet phụ đang được sử dụng';
  if (senior && Object.values(sub.soul?.data ?? {}).some((slot) => slot)) return 'Pet phụ không thể có Mệnh Hồn';
  return null;
}

/** Colour gate of the main pet: orange cannot fuse; senior fusion only takes blue (2) or purple (3). */
export function joinMainBlocker(growRate: number, senior = false): string | null {
  const color = petGrowColor(growRate);
  if (color >= PET_JOIN_SUCCESS.length) return 'Pet cam không thể dung hợp thêm';
  if (senior && !(color in SENIOR_JOIN_MAX_SUBS)) return 'Khi dung hợp pet tím và cam thì mới có thể sử dụng chức năng dung hợp cao cấp' // Flash PETADVANCEDPANEL_S[0] (blue / purple mains are the ones allowed);
  return null;
}

/** Sub-pet count range of senior fusion for a main colour (4..10 blue, 4..16 purple). */
export const seniorSubRange = (color: number): [number, number] => [SENIOR_JOIN_MIN_SUBS, SENIOR_JOIN_MAX_SUBS[color] ?? 0];

/** Go seniorJoinRejectMsg: why a sub count is refused (null = in range). */
export function seniorCountBlocker(color: number, count: number): string | null {
  const [min, max] = seniorSubRange(color);
  if (count < min) return 'Ít nhất 4 pet phụ';
  return count > max ? 'Vượt quá số lượng dung hợp tối đa, vui lòng bớt pet phụ' : null;
}

/** Success percent of fusing a main pet of `color`; the VIP right adds its value to purple mains only. */
export const joinRate = (color: number, vipBonus: number): number =>
  (PET_JOIN_SUCCESS[color] ?? 0) + (color === 3 ? Math.max(0, vipBonus) : 0);

export interface JoinRoll { success: boolean; rate: number; grow: number; }

/** Success re-rolls growRate in the NEXT colour band (colour + 1); failure keeps the current value. */
export function rollJoin(main: Pick<Pet, 'growRate'>, vipBonus: number, rng: Rng, rateOverride?: number): JoinRoll {
  const color = petGrowColor(main.growRate);
  const rate = rateOverride ?? joinRate(color, vipBonus);
  const success = percentRoll(rng) < rate;
  return { success, rate, grow: success ? petGrowRoll(color + 1, rng) : main.growRate };
}

// --- Tay Tuy (petXsd) ---

export interface XsdRoll { rolled: number; applied: boolean; stored: number; }

/**
 * Normal pill: uniform in [round(t * 0.8), round(t * 1.2)], applied only when higher than `current`.
 * Cao Cap pill: uniform in [current + 1, round(t * 1.2)]; null when `current` is already at the maximum (refused).
 */
export function rollXsd(current: number, template: number, advanced: boolean, rng: Rng): XsdRoll | null {
  const [lowBase, high] = petXsdRange(template);
  let low = lowBase;
  if (advanced) {
    if (current >= high) return null;
    low = Math.max(low, current + 1);
  }
  const top = Math.max(high, low);
  const rolled = low + Math.floor(rng() * (top - low + 1));
  const applied = rolled > current;
  return { rolled, applied, stored: applied ? rolled : current };
}

// --- Phuc Sinh (petPzXsd) ---

/** Why a pet cannot be rebirthed: white pets and pets already at their band maximum are refused. */
export function rebirthBlocker(growRate: number): string | null {
  const color = petGrowColor(growRate);
  if (color < 1) return 'Pet cần đạt phẩm chất xanh trở lên';
  if (growRate >= petGrowBandMax(growRate) - 1e-9) return 'Hệ số phẩm chất đã đạt tối đa của màu hiện tại';
  return null;
}

export interface RebirthRoll { rolled: number; improved: boolean; stored: number; }

/** Re-rolls inside the CURRENT band; only a higher value is kept. The pill is consumed either way (the caller's job). */
export function rollRebirth(growRate: number, rng: Rng): RebirthRoll {
  const rolled = petGrowRoll(petGrowColor(growRate), rng);
  const improved = rolled > growRate + 1e-9;
  return { rolled, improved, stored: improved ? rolled : growRate };
}

// --- element ---

/** Go PetElementCost: round(BASIC_GET_MONEY[level] * 0.1) silver. */
export const elementCost = (level: number): number => Math.round(basicMoney(level) * ELEMENT_COST_FACTOR);

// --- announcements (system channel) ---

export const petStarAnnounce = (player: string, petName: string, star: number): string =>
  `Chúc mừng ${player} đã thăng ${petName} thành công lên ${star} sao`;
export const petJoinAnnounce = (player: string, petName: string): string =>
  `Chúc mừng ${player} đã dung hợp thành công ${petName}`;
/** CALLBACK_S[30] is sent for stars 9..12 only (Go IsAnnouncedPetStar). */
export const starAnnounced = (star: number): boolean => star >= STAR_MILESTONE_FROM;
