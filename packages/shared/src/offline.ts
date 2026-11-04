// M8 phase D offline exp ("Ủy thác offline", Flash AutoExpPanel): contracts, the exp / cost formulas, result codes with their
// client strings, and the claim normalisation. Flash names: getOfflineExp(mode, hours), getPetOfflineExp(mode, hours); the login
// payload carries `offlineTime` (seconds, Player.offlineTime). Rates use BASIC_GET_EXP / BASIC_GET_MONEY (rewardScale.ts).

import { basicExp, basicMoney } from './rewardScale.js';

export const OFFLINE_MIN_LEVEL = 30;
/** H5 cap on banked offline time (Go had none); older time is dropped when computing `offlineTime` at login. */
export const OFFLINE_CAP_SECONDS = 3 * 24 * 3600;

export interface OfflineLogin {
  /** seconds of unclaimed offline time (Flash Player.offlineTime) */
  offlineTime: number;
}

/** Reply codes of getOfflineExp / getPetOfflineExp (Flash AutoExpPanel.onGetOfflineExp). */
export const OfflineCode = {
  CHAR_OK: 1,
  PET_OK: 2,
  FAILED: -1,
  LEVEL: -2,
  SILVER: -3,
  GOLD: -4,
  NO_PET: -5,
  PET_TOO_HIGH: -6,
  /** panel text "cấp dưới 60 cần trả vàng": defined by the client, never returned by Go (kept unused in H5) */
  UNDER_60: -7,
  PET_NOT_BOUND: -8,
  PET_CAPPED: -9,
} as const;

/** AUTOEXPPANEL_S texts by reply code. */
export const OFFLINE_TEXT: Readonly<Record<number, string>> = {
  [-1]: 'Nhận kinh nghiệm ủy thác thất bại!',
  [-2]: 'Cấp độ không đủ, không thể ủy thác!',
  [-3]: 'Không đủ bạc!',
  [-4]: 'Không đủ vàng!',
  [-5]: 'Không tìm thấy pet chiến đấu!',
  [-6]: 'Pet đã vượt quá bạn 5 cấp, không thể tiếp tục nhận kinh nghiệm!',
  [-7]: 'Người chơi cấp dưới 60 cần trả vàng mới có thể nhận kinh nghiệm!',
  [-8]: 'Pet cần khóa!',
  [-9]: 'Kinh nghiệm pet đã đạt giới hạn!',
};

export type OfflineMode = 0 | 1 | 2 | 3;

const CHAR_MULT: readonly number[] = [0.3, 1, 2, 3];
const PET_MULT: readonly number[] = [2, 3, 5];
const PET_GOLD_PER_HOUR: readonly number[] = [10, 20, 40];
const CHAR_GOLD_PER_HOUR: readonly number[] = [0, 0, 10, 20];

/** Character exp per hour of delegation (BASIC_GET_EXP[level] x [0.3, 1, 2, 3]); null for an invalid mode. */
export function charExpPerHour(level: number, mode: number): number | null {
  const m = CHAR_MULT[mode];
  return m === undefined ? null : basicExp(level) * m;
}

/** Pet exp per hour (BASIC_GET_EXP[petLevel] x [2, 3, 5]); null for an invalid mode. */
export function petExpPerHour(petLevel: number, mode: number): number | null {
  const m = PET_MULT[mode];
  return m === undefined ? null : basicExp(petLevel) * m;
}

export interface OfflineCost {
  /** silver (mode 1) or gold */
  currency: 'silver' | 'gold' | 'none';
  amount: number;
}

/** Character cost: mode 0 free, mode 1 ceil(BASIC_GET_MONEY x 0.2 x hours) silver, modes 2 / 3 ceil(10 | 20 x hours) gold. */
export function charOfflineCost(level: number, mode: number, hours: number): OfflineCost | null {
  if (mode === 0) return { currency: 'none', amount: 0 };
  if (mode === 1) return { currency: 'silver', amount: Math.ceil(basicMoney(level) * 0.2 * hours - 1e-9) };
  const g = CHAR_GOLD_PER_HOUR[mode];
  return g === undefined ? null : { currency: 'gold', amount: Math.ceil(g * hours - 1e-9) };
}

/** Pet cost: always gold, ceil([10, 20, 40][mode] x hours). */
export function petOfflineCost(mode: number, hours: number): OfflineCost | null {
  const g = PET_GOLD_PER_HOUR[mode];
  return g === undefined ? null : { currency: 'gold', amount: Math.ceil(g * hours - 1e-9) };
}

export interface OfflineConsumption {
  /** seconds taken out of the bank */
  seconds: number;
  /** hours the exp / cost are computed on */
  hours: number;
  /** seconds left in the bank */
  remaining: number;
}

/** Go normalizeConsumption: takes min(round(hours x 3600), available); null when nothing is available or hours <= 0. */
export function offlineConsumption(availableSeconds: number, hours: number): OfflineConsumption | null {
  if (!Number.isFinite(hours) || hours <= 0 || availableSeconds <= 0) return null;
  const want = Math.round(hours * 3600);
  if (want <= 0) return null;
  const seconds = Math.min(want, Math.floor(availableSeconds));
  return { seconds, hours: seconds / 3600, remaining: Math.floor(availableSeconds) - seconds };
}

/** Exp granted for a consumed span: round(exp per hour x hours). */
export function offlineExpGain(perHour: number, hours: number): number {
  return Math.round(perHour * hours);
}

/** Login `offlineTime`: banked seconds plus the time since the last leave, capped (the cap is an H5 choice). */
export function offlineSecondsAtLogin(bankSeconds: number, leftAtMs: number, nowMs: number): number {
  const since = leftAtMs > 0 && nowMs > leftAtMs ? Math.floor((nowMs - leftAtMs) / 1000) : 0;
  return Math.max(0, Math.min(OFFLINE_CAP_SECONDS, Math.max(0, Math.floor(bankSeconds)) + since));
}
