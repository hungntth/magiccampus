// Pure rules of the VIP shop (shop 99, M8 phase B): 6 slots per 4-hour UTC+7 rotation picked by the slot weight column `r`
// (a deterministic RNG seeded by the rotation index, so every member sees the same shared rotation), the personal refresh budget
// and the one-purchase-per-slot-per-rotation rule. RNG and clock are injected. H5 design: the legacy ground truth is Go's
// (vip_rotation.go / vip_refresh.go) and the slot weights `r` that Go ignored.

import {
  VIP_SHOP_BUCKET_HOURS, VIP_SHOP_FREE_REFRESH, VIP_SHOP_MAX_REFRESH, VIP_SHOP_REFRESH_GOLD, VIP_SHOP_SLOTS, VN_OFFSET_MS, dayKey,
} from '@mc/shared';

export type Rng = () => number;

export interface PoolSlot {
  id: number;
  /** data_tbl_shop_slot.r (non-positive counts as 1) */
  weight: number;
}

export interface ShopState {
  /** rotation index the slot list belongs to */
  epoch: number;
  slotIds: number[];
  /** slot ids bought during this rotation */
  purchased: number[];
  refreshDay: string;
  refreshCount: number;
}

const BUCKET_MS = VIP_SHOP_BUCKET_HOURS * 3_600_000;

/** Index of the 4-hour rotation (aligned to UTC+7 midnight) containing `now`. */
export const rotationIndex = (now: number): number => Math.floor((now + VN_OFFSET_MS) / BUCKET_MS);
/** Epoch ms the next rotation starts at. */
export const nextRotationMs = (now: number): number => (rotationIndex(now) + 1) * BUCKET_MS - VN_OFFSET_MS;

/** mulberry32: small seeded RNG in [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` distinct slot ids drawn by weight without replacement (fewer when the pool is smaller). */
export function pickSlots(pool: readonly PoolSlot[], count: number, rng: Rng): number[] {
  const left = pool.map((s) => ({ id: s.id, w: s.weight > 0 ? s.weight : 1 }));
  const out: number[] = [];
  while (out.length < count && left.length > 0) {
    const total = left.reduce((n, s) => n + s.w, 0);
    let roll = rng() * total;
    let at = left.length - 1;
    for (let i = 0; i < left.length; i++) {
      roll -= left[i].w;
      if (roll < 0) {
        at = i;
        break;
      }
    }
    out.push(left[at].id);
    left.splice(at, 1);
  }
  return out;
}

/** The shared rotation of rotation index `epoch`. */
export const sharedRotation = (pool: readonly PoolSlot[], epoch: number): number[] =>
  pickSlots(pool, VIP_SHOP_SLOTS, seededRng(epoch * 2654435761));

/** State valid at `now`: a new rotation resets the list and purchases, a new day resets the refresh counter. */
export function currentState(saved: ShopState | null, pool: readonly PoolSlot[], now: number): ShopState {
  const epoch = rotationIndex(now);
  const today = dayKey(now);
  const base: ShopState = saved ?? { epoch: -1, slotIds: [], purchased: [], refreshDay: today, refreshCount: 0 };
  const fresh = base.epoch === epoch
    ? { ...base }
    : { ...base, epoch, slotIds: sharedRotation(pool, epoch), purchased: [] };
  if (fresh.refreshDay !== today) {
    fresh.refreshDay = today;
    fresh.refreshCount = 0;
  }
  return fresh;
}

/** Gold the next personal refresh costs (the first of the day is free), or an error once the daily cap is used. */
export function refreshCost(state: ShopState): { cost: number } | { error: string } {
  if (state.refreshCount >= VIP_SHOP_MAX_REFRESH) return { error: 'Hôm nay đã hết lượt làm mới' };
  return { cost: state.refreshCount < VIP_SHOP_FREE_REFRESH ? 0 : VIP_SHOP_REFRESH_GOLD };
}

/** The state after a personal refresh: a new random list (purchases of this rotation are kept, so a refresh cannot re-buy). */
export function refreshed(state: ShopState, pool: readonly PoolSlot[], rng: Rng): ShopState {
  return { ...state, slotIds: pickSlots(pool, VIP_SHOP_SLOTS, rng), refreshCount: state.refreshCount + 1 };
}

export const refreshesLeft = (state: ShopState): number => Math.max(0, VIP_SHOP_MAX_REFRESH - state.refreshCount);

/** Why `slotId` cannot be bought now, null when it can. */
export function buyError(state: ShopState, slotId: number): string | null {
  if (!state.slotIds.includes(slotId)) return 'Vật phẩm không còn trong shop, hãy làm mới';
  if (state.purchased.includes(slotId)) return 'Vật phẩm này đã mua trong lượt này';
  return null;
}
