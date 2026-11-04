// Equipment tab of the pet window: 8 slots (equ1..equ8 = item instance ids). The item data comes from the bag state
// (getInitSlot keeps pet equipment rows, slotType 6); double-click a worn item to take it off.

import type { BagItem, PetView } from '@mc/shared';
import { iconUrl } from '../assets';
import { NAME_COLORS } from './itemCell';
import { el } from './petPanelTabs';

export interface EquipTabContext {
  item(id: number): BagItem | undefined;
  onOff(item: BagItem): void;
}

export function renderEquipTab(body: HTMLElement, pet: PetView, ctx: EquipTabContext): void {
  const grid = el('div', 'pet-slots');
  for (let i = 1; i <= 8; i++) {
    const id = pet[`equ${i as 1}`];
    const cell = el('div', 'pet-slot');
    cell.dataset.slot = String(i);
    const item = id > 0 ? ctx.item(id) : undefined;
    if (!item) {
      cell.title = id > 0 ? `Vật phẩm ${id}` : 'Ô trang bị pet';
      if (id > 0) cell.textContent = `#${id}`;
    } else fillWorn(cell, item, ctx);
    grid.appendChild(cell);
  }
  body.append(grid, el('div', 'pet-note', 'Nhấp đôi trang bị pet trong túi để mặc, nhấp đôi ô để tháo.'));
}

function fillWorn(cell: HTMLElement, item: BagItem, ctx: EquipTabContext): void {
  cell.classList.add('learned');
  if (item.color > 0) cell.style.borderColor = NAME_COLORS[item.color] ?? '';
  const lines = [item.name, `Cấp độ cần: ${item.reqLevel}`];
  if (item.info) lines.push(item.info);
  if (item.maxDurability > 0) lines.push(`Độ bền: ${item.durability}/${item.maxDurability}`);
  lines.push('Nhấp đôi để tháo');
  cell.title = lines.join('\n');
  if (item.iconCode && item.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(item.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  cell.ondblclick = () => ctx.onOff(item);
}
