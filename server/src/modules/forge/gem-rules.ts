// Pure hole / gem rules (legacy hole.go R34-R35, gem.go R36-R37): hole capacity and the next hole to dig, the diamond
// gate, slot reads of `properties.t1..t10`, gem placement planning and the jewelSet argument parser.

import {
  DIAMOND_ITEM_TYPE, MAX_HOLES, diamondColorNeeded, type EquipProperties, type GemRefs, type JewelData,
} from '@mc/shared';

type Tpl = Record<string, unknown>;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Holes an equipment can have: the template `hole_num` when set (almost always 0), else the maximum 10. */
export function holeCapacity(tpl: Tpl | undefined): number {
  const n = int(tpl?.hole_num);
  return n > 0 ? Math.min(MAX_HOLES, n) : MAX_HOLES;
}

/** Drilled holes of an instance. */
export const holesOf = (props: EquipProperties | undefined): number => Math.min(MAX_HOLES, Math.max(0, int(props?.holeNum)));

/** Gem template id in hole `slot` (1..10): 0 empty, > 0 gem, -1 not drilled. */
export function gemAt(props: EquipProperties | undefined, slot: number): number {
  if (slot < 1 || slot > holesOf(props)) return -1;
  return Math.max(0, int(props?.[`t${slot}`]));
}

export type DigCheck = { ok: true; slot: number; needColor: number } | { ok: false; note: string };

/** Gate of holeDig: bound equipment, a free hole below capacity, diamond (type 600) of a sufficient ColorCode. */
export function checkDig(
  equip: { bound: boolean; props?: EquipProperties; tpl?: Tpl },
  diamond: { tplType: number; colorCode: number },
): DigCheck {
  if (!equip.bound) return { ok: false, note: 'Chỉ có trang bị khóa mới có thể đục lỗ!' };
  const slot = holesOf(equip.props) + 1;
  if (slot > holeCapacity(equip.tpl)) return { ok: false, note: 'Trang bị đã đạt số lỗ tối đa.' };
  if (diamond.tplType !== DIAMOND_ITEM_TYPE) return { ok: false, note: 'Cần Kim Cương để đục lỗ.' };
  const needColor = diamondColorNeeded(slot);
  if (diamond.colorCode < needColor) return { ok: false, note: `Cần Kim Cương cấp ${needColor + 1} trở lên để đục lỗ thứ ${slot}.` };
  return { ok: true, slot, needColor };
}

/** getJewelData payload: -1 for undrilled holes. */
export function jewelDataOf(props: EquipProperties | undefined): JewelData {
  const t = (i: number): number => gemAt(props, i);
  return {
    holeNum: holesOf(props), t1: t(1), t2: t(2), t3: t(3), t4: t(4), t5: t(5), t6: t(6), t7: t(7), t8: t(8), t9: t(9), t10: t(10),
  };
}

export interface GemPlacement {
  slot: number;
  itemId: number;
}

/** Parses jewelSet's `{slot: {idx}}` map: slots 1..10, positive integer ids, no temp bag; null when malformed. */
export function parseGemRefs(v: unknown): GemPlacement[] | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const out: GemPlacement[] = [];
  for (const [k, raw] of Object.entries(v as GemRefs)) {
    const slot = Number(k);
    const r = raw as { idx?: unknown; tempBagFlag?: unknown } | null;
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_HOLES || typeof r !== 'object' || r === null) return null;
    const itemId = Number(r.idx);
    if (!Number.isInteger(itemId) || itemId <= 0 || r.tempBagFlag === true) return null;
    out.push({ slot, itemId });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** Why a gem cannot go into `slot`, or null: the hole must be drilled and empty. */
export function slotRefusal(props: EquipProperties | undefined, slot: number): string | null {
  const g = gemAt(props, slot);
  if (g < 0) return `Lỗ ${slot} chưa được đục.`;
  if (g > 0) return `Lỗ ${slot} đã có bảo thạch.`;
  return null;
}

/** Units needed per gem stack id for a placement list. */
export function gemTakes(placements: readonly GemPlacement[]): { id: number; count: number }[] {
  const m = new Map<number, number>();
  for (const p of placements) m.set(p.itemId, (m.get(p.itemId) ?? 0) + 1);
  return [...m.entries()].map(([id, count]) => ({ id, count }));
}
