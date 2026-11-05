// Pure Menh Hon rules (Go application/soul): prey crystals, pools, quick dissolve filter, slot search, extra ring slot price.
// No Nest / Mongoose; randomness is an injected `rng` returning [0, 1).

import {
  PET_SOUL_EXTRA_COST, PET_SOUL_BAG_SLOTS, PET_SOUL_TEMP_SLOTS, SOUL_CRYSTAL_ADVANCE_PCT, SOUL_CRYSTAL_COST, type SoulSlot,
} from '@mc/shared';

export type Rng = () => number;

/** A player-visible refusal (Go pkgerrors.NewRefusal): the RPC layer shows a non-empty text as a note; empty = silent. */
export class SoulRefusal extends Error {
  constructor(message: string, readonly code: SoulRefusalCode = 'refused') {
    super(message);
  }
}
export type SoulRefusalCode = 'refused' | 'bagFull' | 'noGold' | 'noPoints' | 'tempFull' | 'vip' | 'crystalLocked';

export const SOUL_TEXT = {
  bagFull: 'Túi Mệnh Hồn đã mở tối đa.',
  noGold: 'Không đủ vàng.',
  vipAdvanced: 'Chỉ có VIP mới được Xủ Quẻ Cao Cấp.',
  vipQuick: 'Chỉ có VIP mới được sử dụng chức năng Nhanh.',
  noExp: 'Không đủ kinh nghiệm Mệnh Hồn.',
  noChip: 'Không đủ Mảnh Vỡ Mệnh Hồn.',
  locked: 'Mệnh Hồn đang khóa.',
  maxLevel: 'Mệnh Hồn đã đạt cấp tối đa.',
  petBagMax: 'Túi Mệnh Hồn của thú đã mở tối đa.',
  petBagLocked: 'Chưa đủ điều kiện mở túi Mệnh Hồn của thú.',
  dissolveVip: 'Chỉ có VIP mới được phân giải nhanh Mệnh Hồn.',
  dissolveLamVip: 'VIP Kim Cương cam trở lên có thể phân giải nhanh Mệnh Hồn lam và thấp hơn.',
  petNotFound: 'Pet không tồn tại.',
  badCrystal: 'Pha lê không hợp lệ.',
  crystalLocked: 'Quả cầu pha lê chưa được mở.',
  tempFull: 'Túi tạm Mệnh Hồn đã đầy.',
  emptyPool: 'Không có Mệnh Hồn để xủ quẻ.',
} as const;

export const FIRST_CRYSTAL = 1;
export const LAST_CRYSTAL = 5;
/** The client sends crystal index 6 for the advanced (gold) divination (SOUL_CRSTAL_COST[5]). */
export const ADVANCED_PREY_INDEX = 6;
/** Advanced pool: each special orange at 0.1 % (1 per mille), the rest uniform over the ordinary rows. */
const RARE_PER_MILLE = 1;
/** Menu colours of the quick dissolve: 1 white, 2 green, 3 blue; the table colour is 0-based. */
const DISSOLVE_MIN = 1;
const DISSOLVE_MAX = 3;
const DISSOLVE_LAM_VIP = 5;

export const pick = <T>(pool: readonly T[], rng: Rng): T | undefined => pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];

export function crystalCost(index: number): number | undefined {
  return index >= FIRST_CRYSTAL && index <= LAST_CRYSTAL ? SOUL_CRYSTAL_COST[index - 1] : undefined;
}

/** The lit crystal (2..5) or 1 when only the first one is open. */
export function activeCrystal(crystalSid: number): number {
  return crystalSid > FIRST_CRYSTAL && crystalSid <= LAST_CRYSTAL ? crystalSid : FIRST_CRYSTAL;
}

export const crystalOpen = (crystalSid: number, index: number): boolean => index === FIRST_CRYSTAL || index === activeCrystal(crystalSid);
/** Persisted crystalSid: the lit crystal (2..5) or 0. */
export const crystalPersist = (index: number): number => (index > FIRST_CRYSTAL && index <= LAST_CRYSTAL ? index : 0);

/** Crystal N lights N + 1 with SOUL_CRYSTAL_ADVANCE_PCT[N] percent, otherwise only crystal 1 stays open. */
export function nextCrystal(index: number, rng: Rng): number {
  const pct = SOUL_CRYSTAL_ADVANCE_PCT[index] ?? 0;
  return pct > 0 && Math.floor(rng() * 100) < pct ? index + 1 : FIRST_CRYSTAL;
}

/** Advanced pool roll: 7 special oranges at 0.1 % each, else uniform over the ordinary purple / orange rows (Go rollAdvancedPreySoul). */
export function rollAdvanced(ordinary: readonly number[], rare: readonly number[], rng: Rng): number | undefined {
  if (ordinary.length === 0) return pick(rare, rng);
  if (rare.length > 0 && rare.length * RARE_PER_MILLE < 1000) {
    const r = Math.floor(rng() * 1000);
    if (r < rare.length * RARE_PER_MILLE) return rare[Math.floor(r / RARE_PER_MILLE)];
  }
  return pick(ordinary, rng);
}

/** Quick prey step: the lit crystal when affordable, else crystal 1, else nothing. */
export function quickPreyCrystal(crystalSid: number, points: number): { crystal: number; cost: number } | undefined {
  const lit = activeCrystal(crystalSid);
  const litCost = crystalCost(lit);
  if (litCost !== undefined && points >= litCost) return { crystal: lit, cost: litCost };
  const first = crystalCost(FIRST_CRYSTAL);
  return first !== undefined && points >= first ? { crystal: FIRST_CRYSTAL, cost: first } : undefined;
}

/** Quick dissolve gate: the highest TABLE colour (0-based) to dissolve, or a refusal text. Any VIP; blue needs VIP 5. */
export function quickDissolveColor(pmLevel: number, menuColor: number): { maxColor: number } | { refusal: string } {
  const color = Math.max(DISSOLVE_MIN, Math.min(DISSOLVE_MAX, Math.trunc(menuColor)));
  if (pmLevel <= 0) return { refusal: SOUL_TEXT.dissolveVip };
  if (color >= DISSOLVE_MAX && pmLevel < DISSOLVE_LAM_VIP) return { refusal: SOUL_TEXT.dissolveLamVip };
  return { maxColor: color - 1 };
}

export function firstFreeBagSlot(data: Readonly<Record<string, unknown>>, open: number): number {
  for (let i = 1; i <= Math.min(open, PET_SOUL_BAG_SLOTS); i++) if (!data[String(i)]) return i;
  return 0;
}

export function firstFreeTempSlot(temp: Readonly<Record<string, number>>): number {
  for (let i = 1; i <= PET_SOUL_TEMP_SLOTS; i++) if (!temp[String(i)]) return i;
  return 0;
}

/** openPetSoulBag: price of the next extra ring slot; throws a refusal (needs openNum >= 5, at most 8 extras). */
export function petBagExtraCost(openNum: number, openNum2: number): number {
  if (openNum < 5) throw new SoulRefusal(SOUL_TEXT.petBagLocked);
  const cost = PET_SOUL_EXTRA_COST[openNum2 + 1];
  if (cost === undefined) throw new SoulRefusal(SOUL_TEXT.petBagMax);
  return cost;
}

/** moveSoul type from the two wire ids (Go swap.go): 1 bag-bag, 2 ring-ring, 3 sid is a ring slot and newSid a bag slot, 4 the reverse. */
export function moveType(from: number, to: number, offset: number): 1 | 2 | 3 | 4 {
  const fromRing = from > offset;
  const toRing = to > offset;
  if (!fromRing && !toRing) return 1;
  if (fromRing && toRing) return 2;
  return fromRing ? 3 : 4;
}

/** Swaps the content of two slots, possibly in two different bags; an empty side clears the other. */
export function swapSlots(left: Record<string, SoulSlot>, a: number, right: Record<string, SoulSlot>, b: number): void {
  const av = left[String(a)];
  const bv = right[String(b)];
  if (bv) left[String(a)] = bv; else delete left[String(a)];
  if (av) right[String(b)] = av; else delete right[String(b)];
}
