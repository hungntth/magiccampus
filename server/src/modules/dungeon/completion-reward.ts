// Shared phụ bản completion reward (Go application/dungeon completion_reward.go): 1-10 distinct entries of the 13-row pool,
// doubled with one tier-2 wing feather for dungeons of level 80+. H5 has no medals (M10 decision 12): a picked "Ấn Chương Hiền
// Giả" is re-rolled into another distinct entry. Only the Bí Kíp Mật Bảo row of the chest plan is kept (KEPT_PLAN_ITEMS). Pure.

import type { CurrencyKey } from '@mc/shared';

export type CompletionEntry =
  | { kind: 'item'; id: number; grade: number; count: number; name: string }
  | { kind: 'currency'; key: CurrencyKey; count: number; name: string }
  | { kind: 'medal'; id: number; count: number; name: string }
  | { kind: 'feather'; count: number; name: string };

export const COMPLETION_POOL: readonly CompletionEntry[] = [
  { kind: 'item', id: 24, grade: 5, count: 1, name: 'Kim Loại Hiếm' },
  { kind: 'item', id: 4905, grade: 0, count: 1, name: 'Túi Quà Thần Khí Phụ Trắng' },
  { kind: 'medal', id: 460, count: 1, name: 'Ấn Chương Hiền Giả' },
  { kind: 'item', id: 4913, grade: 0, count: 2, name: 'Hỗn Độn Ma Tinh' },
  { kind: 'item', id: 4979, grade: 0, count: 5, name: 'Đá Khế Ước' },
  { kind: 'item', id: 1585, grade: 0, count: 1, name: 'Thuốc Tăng Trưởng Pet Siêu Cấp Loại A' },
  { kind: 'item', id: 1651, grade: 0, count: 1, name: 'Nội Đơn Phi Điểu' },
  { kind: 'currency', key: 'stoneSealPoint', count: 10, name: 'Bụi Ấn Thạch' },
  { kind: 'currency', key: 'warSprite', count: 10, name: 'Dũng Khí Thạch' },
  { kind: 'currency', key: 'battleSprite', count: 4, name: 'Ý Chí Thạch' },
  { kind: 'currency', key: 'petguardin', count: 40, name: 'Lệnh Bài Trung Thành' },
  { kind: 'currency', key: 'magiccystalrec', count: 10, name: 'Bụi Ma Thuật' },
  { kind: 'currency', key: 'magiccystallimit', count: 6, name: 'Pha Lê Cực Hạn' },
];

export const COMPLETION_MAX_PICKS = 10;
export const COMPLETION_HIGH_LEVEL = 80;
/** Bảo Rương Bí Kíp Mật Bảo per dungeon: the only chest plan rows still paid (Go KeepsChestPlanItem). */
export const KEPT_PLAN_ITEMS: ReadonlySet<number> = new Set([5121, 5122, 5123, 5124, 5125, 5126]);

/** Go pickDistinct: a partial Fisher-Yates over 0..size-1. */
export function pickDistinct(size: number, n: number, intn: (k: number) => number): number[] {
  const count = Math.max(0, Math.min(n, size));
  const idx = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + intn(size - i);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, count);
}

/** `intn(k)` returns an integer in [0, k). */
export function rollCompletion(dungeonLevel: number, intn: (k: number) => number, pool: readonly CompletionEntry[] = COMPLETION_POOL): CompletionEntry[] {
  const limit = Math.min(COMPLETION_MAX_PICKS, pool.length);
  if (limit <= 0) return [];
  const picks = pickDistinct(pool.length, 1 + intn(limit), intn);
  const medalAt = picks.findIndex((i) => pool[i].kind === 'medal');
  if (medalAt >= 0) {
    const rest = pool.map((_, i) => i).filter((i) => !picks.includes(i) && pool[i].kind !== 'medal');
    if (rest.length > 0) picks[medalAt] = rest[intn(rest.length)];
    else picks.splice(medalAt, 1);
  }
  const factor = dungeonLevel >= COMPLETION_HIGH_LEVEL ? 2 : 1;
  const out = picks.map((i) => ({ ...pool[i], count: pool[i].count * factor }));
  if (factor > 1) out.push({ kind: 'feather', count: 1, name: 'Lông Vũ Cấp 2' });
  return out;
}
