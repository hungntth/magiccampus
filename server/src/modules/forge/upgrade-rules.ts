// Pure tier-upgrade, prefix and resolve rules (legacy change_level R44, change_prefix R43, resolve R45): the prefix
// preview roll, material gates and costs, the next-tier item and the disassembly outputs. Randomness is injectable.

import { levelCost, type EquipProperties } from '@mc/shared';
import { colorOfQuality, type Rng } from './craft-rules';

type Tpl = Record<string, unknown>;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const PREFIX_WEIGHTS = [22, 22, 22, 22, 12] as const;

/** Weighted prefix 1..5 (Trác Việt is the rare one). */
export function rollPrefixWeighted(rng: Rng): number {
  const total = PREFIX_WEIGHTS.reduce((a, b) => a + b, 0);
  let pos = rng() * total;
  for (let i = 0; i < PREFIX_WEIGHTS.length; i++) {
    if (pos < PREFIX_WEIGHTS[i]) return i + 1;
    pos -= PREFIX_WEIGHTS[i];
  }
  return PREFIX_WEIGHTS.length;
}

/** Colour (ColorCode 0..5) of an equipment row: the larger of its ColorCode and the one implied by its quality. */
export function equipColor(colorCode: number, quality: number): number {
  return Math.max(0, colorCode, quality > 0 ? colorOfQuality(quality) : 0);
}

/** Quality of a row: the instance value, else derived from the colour and prefix. */
export function equipQuality(props: EquipProperties | undefined, color: number): number {
  const q = int(props?.quality);
  if (q > 0) return q;
  const prefix = Math.min(5, Math.max(1, int(props?.prefix) || 1));
  return Math.max(1, (color - 1) * 5 + prefix);
}

/** Prefix 1..5 of a quality (q % 5, 0 -> 5). */
export const prefixOfQuality = (q: number): number => (q % 5 === 0 ? 5 : q % 5);

/** Cost of a prefix change: `req_level^2 * 10` with the item_level / 1 fallbacks of Go. */
export function prefixCost(tpl: Tpl | undefined): number {
  return levelCost(int(tpl?.req_level) || int(tpl?.item_level) || 1);
}

export interface PrefixPreview {
  quality: number;
  /** Star levels lost by the change (-1 for a level-4 material, otherwise 0). */
  starDelta: number;
}

/**
 * Preview quality by material level: L4 -> 15 + weighted prefix (and one star lost); L5 -> orange keeps its quality, else 20;
 * L6 -> orange with prefix 5 stays 25, else 20 + weighted prefix. Other levels keep the quality.
 */
export function previewQuality(
  curQuality: number, curColor: number, curPrefix: number, matLevel: number, rng: Rng,
): PrefixPreview {
  switch (matLevel) {
    case 4: return { quality: 15 + rollPrefixWeighted(rng), starDelta: -1 };
    case 5: return { quality: curColor === 5 ? curQuality : 20, starDelta: 0 };
    case 6: return { quality: curColor === 5 && curPrefix === 5 ? 25 : 20 + rollPrefixWeighted(rng), starDelta: 0 };
    default: return { quality: curQuality, starDelta: 0 };
  }
}

/** Why the three prefix materials do not work, or null: same level 4..6, and orange equipment needs level 5 or 6. */
export function prefixMaterialRefusal(levels: readonly number[], curColor: number): string | null {
  if (levels.length < 3 || levels.some((l) => l < 4 || l > 6)) return 'Cần nguyên liệu cấp 4 đến 6.';
  if (levels.some((l) => l !== levels[0])) return 'Vui lòng đặt nguyên liệu cùng cấp!';
  if (curColor >= 5 && levels[0] < 5) return 'Trang bị cam cần sử dụng nguyên liệu cấp 5 hoặc cấp 6.';
  return null;
}

/** Colour of the equipment produced by a tier upgrade: the shared material colour, else the next template's own colour. */
export function tierColor(materialColors: readonly number[], nextTplColor: number): number {
  const c = materialColors[0] ?? 0;
  return c > 0 ? c : Math.max(0, nextTplColor);
}

/** Thang hoa and Ky Linh survive a tier upgrade (Go carryOverChangeLevel keeps both); everything else is re-rolled. */
export function keptProperties(old: EquipProperties | undefined): EquipProperties {
  return { ...(old?.sublime ? { sublime: old.sublime } : {}), ...(old?.qiling ? { qiling: old.qiling } : {}) };
}

/** Row fields after a tier upgrade: the next template, stars / holes / gems / rolls reset, fresh durability; the bound flag is kept. */
export function tierResetFields(next: Tpl, materialColors: readonly number[], old?: EquipProperties): {
  templateId: number; colorCode: number; star: number; properties: EquipProperties; durability: number; maxDurability: number;
} {
  const durability = int(next.endure_max);
  return {
    templateId: int(next.id), colorCode: tierColor(materialColors, int(next.color)), star: 0, properties: keptProperties(old),
    durability, maxDurability: durability,
  };
}

/** True when every material has the same colour (the tier upgrade requires it). */
export const sameColors = (colors: readonly number[]): boolean => colors.every((c) => c === colors[0]);

export interface ResolveOutput {
  tid: number;
  num: number;
  color: number;
}

/** Disassembly materials: require_item1..3 x require_num1..3, ColorCode (prefix 5) or ColorCode - 1, clamped to 0..5. */
export function resolveOutputs(tpl: Tpl | undefined, colorCode: number, prefix: number): ResolveOutput[] {
  const color = Math.min(5, Math.max(0, prefix === 5 ? colorCode : colorCode - 1));
  const out: ResolveOutput[] = [];
  for (const k of [1, 2, 3]) {
    const tid = int(tpl?.[`require_item${k}`]);
    const num = Math.max(1, int(tpl?.[`require_num${k}`]));
    if (tid > 0) out.push({ tid, num, color });
  }
  return out;
}
