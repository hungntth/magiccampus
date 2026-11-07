// Point / currency items of type 550 that credit a counter instead of opening a bag. Constant tables copied from Go
// application/item/effect_point_items.go (pointItems), effect_spirituality_items.go (spiritualityItems), effect_talent_items.go
// (anhLinhDescPattern; amounts are read from the description) and effect_merit_nature_items.go (npPnt amounts).
// Skipped (no target system in this port): 3816 / 5114 / 5275 medal exp, 6524 / 6525 Van Chi (carve KP).

import type { CurrencyKey } from '@mc/shared';

export interface PointItemSpec {
  key: CurrencyKey;
  label: string;
  amount: number;
}

export const POINT_ITEMS: Readonly<Record<number, PointItemSpec>> = {
  3815: { key: 'elementPnt', label: 'Nguyên Tố', amount: 10 },
  5343: { key: 'yijieElement', label: 'Nguyên Tố Cao Năng', amount: 10 },
  5215: { key: 'runeExp', label: 'điểm exp phù văn', amount: 500 },
  5216: { key: 'runeExp', label: 'điểm exp phù văn', amount: 50 },
  5994: { key: 'magiccystalpre', label: 'Pha Lê Vĩnh Hằng', amount: 100 },
  5949: { key: 'magiccystalpre', label: 'Pha Lê Vĩnh Hằng', amount: 5 },
  5993: { key: 'magiccystallimit', label: 'Pha Lê Cực Hạn', amount: 10 },
  5947: { key: 'magiccystallimit', label: 'Pha Lê Cực Hạn', amount: 200 },
  5948: { key: 'magiccystalrec', label: 'Bụi Ảo Năng', amount: 20 },
  4839: { key: 'soulExp', label: 'exp Mệnh Hồn', amount: 100 },
  4884: { key: 'soulExp', label: 'exp Mệnh Hồn', amount: 1000 },
  4857: { key: 'soulExp', label: 'exp Mệnh Hồn', amount: 15000 },
  4162: { key: 'paPnt', label: 'điểm đấu pet', amount: 5000 },
  // Tinh Hoa Tu Nhien 4054, Tui Qua Nang Luong Tu Nhien 4838 / 4885 (npPnt, game currency 236)
  4054: { key: 'npPnt', label: 'Năng Lượng Tự Nhiên', amount: 1000 },
  4838: { key: 'npPnt', label: 'Năng Lượng Tự Nhiên', amount: 50 },
  4885: { key: 'npPnt', label: 'Năng Lượng Tự Nhiên', amount: 500 },
};

/** Anh Linh items: "Mở (ra) nhận (được) N điểm Anh Linh" -> pvePoint +N (4591 500, 4592 1500, 4724 100, 5307 3500). */
const ANH_LINH_RE = /^\s*Mở(?: ra)? nhận(?: được)? (\d+) điểm Anh Linh\.?\s*$/;

export function anhLinhAmount(description: string): number | null {
  const m = ANH_LINH_RE.exec(description);
  const n = m ? Number(m[1]) : 0;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface SpiritualitySpec {
  fixed?: number;
  perLvMin?: number;
  perLvMax?: number;
  min?: number;
  max?: number;
  /** Uses per local day (Go daily_use_limit.go), 0 = unlimited. */
  dailyCap: number;
}

export const SPIRITUALITY_ITEMS: Readonly<Record<number, SpiritualitySpec>> = {
  2336: { fixed: 400_000, dailyCap: 0 },
  2992: { fixed: 20_000, dailyCap: 0 },
  2993: { fixed: 50_000, dailyCap: 0 },
  2994: { fixed: 100_000, dailyCap: 0 },
  2795: { perLvMin: 500, perLvMax: 1000, dailyCap: 3 },
  2796: { perLvMin: 500, perLvMax: 1000, dailyCap: 5 },
  2480: { perLvMin: 1000, perLvMax: 2000, dailyCap: 0 },
  5903: { min: 30_000_000, max: 200_000_000, dailyCap: 0 },
};

/** Spirituality gained by one use (Go spiritualityItemSpec.roll); `rng` is [0, 1). */
export function rollSpirituality(spec: SpiritualitySpec, level: number, rng: () => number): number {
  const between = (lo: number, hi: number): number => (hi <= lo ? lo : lo + Math.floor(rng() * (hi - lo + 1)));
  if (spec.fixed) return spec.fixed;
  if (spec.perLvMax) {
    const lv = Math.max(1, level);
    return between((spec.perLvMin ?? 0) * lv, spec.perLvMax * lv);
  }
  return between(spec.min ?? 0, spec.max ?? 0);
}
