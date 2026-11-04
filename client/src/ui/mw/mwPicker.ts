// Weapon chooser of the Thần khí tabs: a row of item cells (worn pieces marked "M", upgrade level "+N"); click selects.

import type { BagItem } from '@mc/shared';
import { SlotType } from '@mc/shared';
import { forgeCell } from '../forge/forgeCell';
import { button, el } from '../feature/dom';

export function picker(items: readonly BagItem[], selected: number | null, onPick: (id: number) => void, label = 'Chọn thần khí'): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', label));
  if (items.length === 0) {
    box.appendChild(el('div', 'ft-muted', 'Không có thần khí phù hợp (dùng /grant equip <id> để nhận).'));
    return box;
  }
  const row = el('div', 'mw-picker');
  for (const i of items) {
    const tag = i.slotType === SlotType.EQUIP ? 'M' : i.star ? `+${i.star}` : undefined;
    const cell = forgeCell({ iconCode: i.iconCode, name: i.name, color: i.color, count: tag, title: `${i.name}${i.star ? `  +${i.star}` : ''}` });
    if (i.id === selected) cell.classList.add('selected');
    cell.onclick = () => onPick(i.id);
    row.appendChild(cell);
  }
  box.appendChild(row);
  return box;
}

/** Action button that is disabled while an action runs. */
export const act = (label: string, busy: boolean, ok: boolean, onClick: () => void): HTMLButtonElement => button(label, onClick, busy || !ok);
