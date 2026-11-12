// Character gear glue of Thang hoa / Doi khac che (M13.4): the eligibility candidate of a row, the stored state
// (`properties.sublime` {lv, add, el}) in the shape of the shared pet rules (sublime-rules.ts), and the stat lines of a worn piece.
// Pure: no Nest / Mongo. Legacy domain/item/sublime.go SublimeEligible, application/item/sublime.go aggregateSublimeStats.

import { equipDisplayColor, equipSublimeBlocker, parseEquipSublime, type EquipProperties, type EquipSublime, type SublimeCandidate } from '@mc/shared';
import type { SublimeRow } from '../gamedata/sublimation-data';
import { isSublimeAttackPosition, sublimeStatLines, type SublimeState } from './sublime-rules';
import { prefixOfQuality } from './upgrade-rules';

type Tpl = Record<string, unknown>;
const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const PET_GEAR_KIND = 9;

/** The gate inputs of an instance: bound flag, template level, prefix tier (instance, else from the quality) and display colour. */
export function sublimeCandidateOf(row: { isBound: boolean; colorCode: number; properties?: EquipProperties }, tpl: Tpl): SublimeCandidate {
  const quality = int(row.properties?.quality);
  return {
    bound: row.isBound,
    reqLevel: int(tpl.req_level),
    prefix: int(row.properties?.prefix) || (quality > 0 ? prefixOfQuality(quality) : 0),
    color: equipDisplayColor(row.colorCode, quality),
  };
}

/** Refusal text for a character sublime / restrain target, or null: pet gear and non-player positions never qualify. */
export function characterSublimeRefusal(row: { isBound: boolean; colorCode: number; properties?: EquipProperties }, tpl: Tpl | undefined): string | null {
  if (!isCharacterGearTpl(tpl)) return 'Trang bị không phù hợp.';
  return equipSublimeBlocker(sublimeCandidateOf(row, tpl));
}

export const toRuleState = (s: EquipSublime): SublimeState => ({ id: s.lv, add: s.add, element: s.el });
export const fromRuleState = (s: SublimeState): EquipSublime => ({ lv: s.id, add: s.add, el: s.element });
export const sublimeOf = (props: EquipProperties | undefined): EquipSublime => parseEquipSublime(props?.sublime);

/** Stat lines the current level of a worn piece adds (the row's props, not a running sum); empty at level 0 or without a table row. */
export function wornSublimeLines(
  props: EquipProperties | undefined, position: number, rowOf: (level: number) => SublimeRow | undefined,
): { prop: number; num: number }[] {
  const s = sublimeOf(props);
  return s.lv > 0 ? sublimeStatLines(rowOf(s.lv), isSublimeAttackPosition(position)) : [];
}

/** True for a template a character can wear (not pet gear, a player equip position). */
export function isCharacterGearTpl(tpl: Tpl | undefined): tpl is Tpl {
  const position = int(tpl?.position);
  return tpl !== undefined && int(tpl.kind) !== PET_GEAR_KIND && position >= 1 && position <= 22;
}
