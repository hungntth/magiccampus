// Client-side use gate of a bag item (Flash Player.useItem steps 4 / 5): use_type 1 / 3 for the character, 2 / 3 for a pet, then the
// level (character level or pet level) and, for the character only, the class list ("|1|2|3|", an empty list allows every class).

import { PLAYER_USE_TEXT } from './item-use-batch.js';

export interface UseGateItem {
  useType: number;
  reqLevel: number;
  reqClass?: string;
}

export interface UseGateContext {
  charLevel: number;
  classId: number;
  /** Level of the target pet (target 'pet' only). */
  petLevel?: number;
}

/** The refusal text of using `item` on `target`, or null when the client lets the call through. */
export function useGate(target: 'char' | 'pet', item: UseGateItem, ctx: UseGateContext): string | null {
  if (target === 'char') {
    if (item.useType !== 1 && item.useType !== 3) return PLAYER_USE_TEXT.NOT_FOR_CHAR;
    if (ctx.charLevel < item.reqLevel) return PLAYER_USE_TEXT.LEVEL;
    if (item.reqClass && !item.reqClass.includes(`|${ctx.classId}|`)) return PLAYER_USE_TEXT.CLASS;
    return null;
  }
  if (item.useType !== 2 && item.useType !== 3) return PLAYER_USE_TEXT.NOT_FOR_PET;
  if ((ctx.petLevel ?? 0) < item.reqLevel) return PLAYER_USE_TEXT.PET_LEVEL;
  return null;
}
