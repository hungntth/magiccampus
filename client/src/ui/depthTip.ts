// Tooltip lines of the equipment depth systems (M13.4): the stat lines of the current Thang hoa level (character and pet gear) and the three
// Ky Linh lines in the Flash colour bands. Called by itemTip.ts after the generic lines.

import type { BagItem } from '@mc/shared';
import { EQUIP_PROP_LABELS, equipSublimeStep, isPetEquipPosition, petSublimeStep, qilingColorOf, qilingLineText } from '@mc/shared';

/** `add(text, cssClass, color?)` appends one tooltip line. */
export type TipLine = (text: string, cls: string, color?: string) => void;

export function appendDepthTip(item: BagItem, add: TipLine): void {
  const s = item.sublime;
  if (s && s.id > 0) {
    const attack = [3, 6, 7, 8, 9, 11, 50, 51, 52, 56].includes(item.position);
    const step = isPetEquipPosition(item.position) ? petSublimeStep(s.id, attack) : equipSublimeStep(s.id, attack);
    const text = step?.lines.map((l) => `${EQUIP_PROP_LABELS[l.prop] ?? `#${l.prop}`} +${l.num}`).join('  ');
    if (text) add(`Thăng hoa +${s.id}: ${text}`, 'it-line it-prop');
  }
  if (item.qiling && item.qiling.length > 0) {
    add('Kỳ Linh:', 'it-line');
    for (const l of item.qiling) add(qilingLineText(l), 'it-line it-prop', qilingColorOf(l));
  }
}
