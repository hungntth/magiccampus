// Pure quest reward rules (Go application/quest/service.go applyRewards + Flash QuestCanvas/QuestPanel award slots):
// which data_tbl_quest_award rows a finish grants, the colour of a granted equipment and its display name.

import { QuestAwardKind, QuestAwardMode } from '@mc/shared';
import type { QuestAwardRow } from '../gamedata/quest-data';

export const EQUIP_TABLE = 19;
export const PET_TABLE = 12;

/** Template req_class contains "|classId|" (empty / "all" = any class). */
export function classAllowed(reqClass: string, classId: number): boolean {
  if (!reqClass || reqClass === 'all') return true;
  return reqClass.includes(`|${classId}|`);
}

/**
 * Award rows a finish grants. ALL: every row (Go). CLASS: item rows whose template fits the player's class, others kept
 * (QuestCanvas). CHOOSE_ONE: only the row the player picked (finishQuest `s` = row id); null when none was picked
 * (QuestPanel refuses with QUESTPANEL_S[6]).
 */
export function pickAwards(
  mode: number, rows: readonly QuestAwardRow[], selectId: number, classId: number, reqClassOf: (r: QuestAwardRow) => string,
): QuestAwardRow[] | null {
  if (mode === QuestAwardMode.CHOOSE_ONE && rows.length > 0) {
    const chosen = rows.find((r) => r.id === selectId);
    return chosen ? [chosen] : null;
  }
  if (mode === QuestAwardMode.CLASS) {
    return rows.filter((r) => r.kind !== QuestAwardKind.ITEM || classAllowed(reqClassOf(r), classId));
  }
  return [...rows];
}

const clampColor = (c: number): number => Math.max(0, Math.min(5, c));

/**
 * Colour of a granted award instance. Equipment with q > 0: Go QuestRewardEquipmentColorCodeFromQuality
 * (floor((q + 4) / 5) + 1, clamped to 0..5); equipment with q <= 0 keeps the template color_code; items are 0.
 */
export function awardColor(row: Pick<QuestAwardRow, 'type' | 'q'>, templateColor: number): number {
  if (row.type !== EQUIP_TABLE) return 0;
  if (row.q > 0) return clampColor(Math.floor((row.q + 4) / 5) + 1);
  return templateColor > 0 && templateColor < 9 ? templateColor : 0;
}

const QUALITY_PREFIX = ['', 'Bình Thường ', 'Cường Hóa ', 'Tinh Xảo ', 'Hoàn Mỹ ', 'Trác Việt '];

/** Go FormatEquipmentDisplayNameFromQuality: quality prefix (q % 5, 0 -> 5) unless the name already has one. */
export function awardName(row: Pick<QuestAwardRow, 'type' | 'q'>, name: string): string {
  if (row.type !== EQUIP_TABLE || row.q <= 0 || !name) return name;
  const prefix = QUALITY_PREFIX[row.q % 5 === 0 ? 5 : row.q % 5];
  return QUALITY_PREFIX.slice(1).some((p) => name.startsWith(p)) ? name : prefix + name;
}
