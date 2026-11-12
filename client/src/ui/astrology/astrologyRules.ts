// Pure helpers of the Năng Lượng Tự Nhiên window: formula rows, button labels, record feed, pick-result text.

import {
  ASTRO, ASTRO_AWARDS, ASTRO_ELEMENTS, ASTRO_TEXT, formulaAmount, formulaLength, lookFormulaCost, pickGoldCost, type AstrologicData,
  type AstrologicRecord, type PickStarResult,
} from '@mc/shared';

export interface FormulaRow {
  fid: number;
  /** "N:" label */
  label: string;
  /** element names, or "?" tokens while hidden */
  tokens: string[];
  hidden: boolean;
  award: string;
  lookCost: number;
}

export const elementName = (sid: number): string => ASTRO_ELEMENTS[sid - 1] ?? '?';

export function formulaRows(data: AstrologicData): FormulaRow[] {
  return Array.from({ length: ASTRO.FORMULA_COUNT }, (_, fid) => {
    const f = data.formula[fid] ?? null;
    return {
      fid,
      label: `${fid + 1}:`,
      tokens: f ? f.map(elementName) : Array.from({ length: formulaLength(fid) }, () => '?'),
      hidden: f === null,
      award: ASTRO_TEXT.AWARD(ASTRO_AWARDS[fid] ?? 0),
      lookCost: lookFormulaCost(fid),
    };
  });
}

/** Free pick / refresh line, or the gold price once the free turns are gone. */
export const pickLabel = (d: AstrologicData): string => (d.pickCount > 0 ? ASTRO_TEXT.FREE_PICK(d.pickCount) : ASTRO_TEXT.PAID_PICK(pickGoldCost(d.buyPickCount)));
export const refreshLabel = (d: AstrologicData): string => (d.refreshCount > 0 ? ASTRO_TEXT.FREE_REFRESH(d.refreshCount) : ASTRO_TEXT.PAID_REFRESH);

/** The confirmation text a click needs, or null when the turn is free. */
export const pickConfirm = (d: AstrologicData): string | null => (d.pickCount > 0 ? null : ASTRO_TEXT.CONFIRM_PICK(pickGoldCost(d.buyPickCount)));
export const refreshConfirm = (d: AstrologicData): string | null => (d.refreshCount > 0 ? null : ASTRO_TEXT.CONFIRM_REFRESH);

/** Record feed, newest first (the server keeps oldest first). */
export const recordLines = (records: readonly AstrologicRecord[]): string[] =>
  [...records].reverse().map((r) => ASTRO_TEXT.RECORD_ROW(Number(r.aid) + 1, r.name));

/** Result line of the last pick: formula completions show the paid amount and the row. */
export function resultLine(result: PickStarResult | undefined): string {
  if (!result) return ASTRO_TEXT.GAIN(ASTRO.NP_PER_PICK);
  return `${ASTRO_TEXT.GAIN(formulaAmount(result.aid, result.mult))} (${Number(result.fid) + 1})`;
}

/** Collected stars after a plain pick: the newest COLLECT_KEEP. */
export const keepStars = (now: readonly number[], sid: number): number[] => [...now, sid].slice(-ASTRO.COLLECT_KEEP);
