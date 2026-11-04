// Shared item slot rendering for the bag and the character panel: quality border, icon, stack count, lock mark,
// tooltip and the drag payload exchanged between the two windows (native HTML5 drag and drop).

import { ELEMENT_NAMES, EQUIP_PROP_LABELS, PREFIX_NAMES } from '@mc/shared';
import type { BagItem, EquipLines } from '@mc/shared';
import { iconUrl } from '../assets';

// GamePredef.as:757 name palette, indices 0..8 (same as the shop).
export const NAME_COLORS = ['#FFFFFF', '#00FF00', '#0066FF', '#FF33FF', '#FA5B05', '#FF0000', '#33CCAA', '#33CCAA', '#FFAE17'];

export interface DragPayload {
  from: 'bag' | 'equip';
  id: number;
  sid: number;
}

const MIME = 'application/x-mc-item';
let current: DragPayload | null = null;

export function startDrag(e: DragEvent, p: DragPayload): void {
  current = p;
  e.dataTransfer?.setData(MIME, JSON.stringify(p));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

/** The payload of the drag in progress (dataTransfer is unreadable during dragover, so it is also kept here). */
export function dragging(): DragPayload | null {
  return current;
}

export function endDrag(): void {
  current = null;
}

/** Rolled stat lines of a crafted piece (instance values only; plain template lines are not repeated). */
const propLabel = (prop: number): string => EQUIP_PROP_LABELS[prop] ?? `#${prop}`;

function rolledLines(l: EquipLines): string[] {
  const out: string[] = [];
  for (const n of [1, 2] as const) {
    const prop = l[`mainProp${n}`];
    if (prop) out.push(`${propLabel(prop)}: +${l[`mainPropNum${n}`] ?? 0}${l[`bindMainPropNum${n}`] ? ` (+${l[`bindMainPropNum${n}`]})` : ''}`);
  }
  for (const n of [1, 2] as const) {
    const prop = l[`prop${n}`];
    if (prop) out.push(`${propLabel(prop)}: +${l[`propNum${n}`] ?? 0}`);
  }
  return out;
}

export function itemTooltip(item: BagItem, playerLevel: number, equipped: boolean): string {
  const prefix = item.prefix ? PREFIX_NAMES[item.prefix] : '';
  const lines = [prefix ? `${prefix} ${item.name}` : item.name];
  if (item.quality) lines.push(`Phẩm chất: ${item.quality}`);
  if (item.element) lines.push(`Hệ: ${ELEMENT_NAMES[item.element] ?? item.element}`);
  if (item.star) lines.push(`Sao: ${item.star}`);
  if (item.lines) lines.push(...rolledLines(item.lines));
  if (item.holeNum) lines.push(`Lỗ khảm: ${item.holeNum} (${item.gems?.filter((g) => g > 0).length ?? 0} đã khảm)`);
  if (item.activeProp) lines.push(`Linh hồn: ${propLabel(item.activeProp)} +${item.activePropNum ?? 0}`);
  if (item.makerName) lines.push(`${item.makerName} chế tạo`);
  if (item.reqLevel > 0) lines.push(`Cấp độ cần: ${item.reqLevel}${playerLevel < item.reqLevel ? ' (chưa đủ)' : ''}`);
  if (item.info) lines.push(item.info);
  if (item.maxDurability > 0) lines.push(`Độ bền: ${item.durability}/${item.maxDurability}`);
  if (item.binded) lines.push('Đã khóa');
  if (item.sellPrice > 0) lines.push(`Giá bán ra: ${item.sellPrice}`);
  if (item.itemType === 2) lines.push(equipped ? 'Nhấp đôi để tháo gỡ' : 'Nhấp đôi để mặc');
  return lines.join('\n');
}

/** Fills `cell` (already empty) with the item visuals. */
export function fillItemCell(cell: HTMLElement, item: BagItem, tip: string, from: DragPayload['from']): void {
  cell.classList.add('filled');
  if (item.color > 0) cell.style.borderColor = NAME_COLORS[item.color] ?? '';
  cell.title = tip;
  if (item.iconCode && item.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(item.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (item.stackNum > 1) cell.appendChild(span('bag-count', String(item.stackNum)));
  if (item.binded) cell.appendChild(span('bag-lock', '🔒'));
  cell.draggable = true;
  cell.ondragstart = (e) => startDrag(e, { from, id: item.id, sid: item.sid });
  cell.ondragend = endDrag;
}

function span(cls: string, text: string): HTMLElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}
