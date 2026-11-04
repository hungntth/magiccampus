// Material level inputs of a bag stack (same reading as crafting): instance ColorCode plus the template level / colour columns.

import { MAX_MATERIAL_COLOR } from '@mc/shared';
import type { Row } from '../gamedata/gamedata.service';
import type { CharacterItem } from '../inventory/character-item.schema';
import { materialLevel, type MaterialInfo } from './craft-rules';
import { int } from './forge-guard';

export function materialInfoOf(row: Pick<CharacterItem, 'colorCode'>, tpl: Row | undefined): MaterialInfo {
  return {
    colorCode: Math.min(MAX_MATERIAL_COLOR, row.colorCode),
    tplLevel: int(tpl?.level) || int(tpl?.item_level),
    tplColorCode: int(tpl?.color_code),
    tplColor: int(tpl?.color ?? -1),
  };
}

/** Material level (2..6 for graded materials) of a stack. */
export const levelOfStack = (row: Pick<CharacterItem, 'colorCode'>, tpl: Row | undefined): number => materialLevel(materialInfoOf(row, tpl));
