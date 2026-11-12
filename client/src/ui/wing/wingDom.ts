// Small DOM pieces of the wing panel: icon cells with item tooltips, the wing picker list, material stack lookups and the hole grid.

import { FEATHER_TYPE, SlotType, WING_COLOUR_NAMES, WING_POSITION, type BagItem } from '@mc/shared';
import { iconUrl } from '../../assets';
import { button, el } from '../feature/dom';
import { attachItemTip } from '../itemTip';
import { featherText } from './wingTip';
import type { WingUiHost } from './wingTypes';

export const isWing = (i: BagItem): boolean => i.itemType === 2 && i.position === WING_POSITION;
export const isFeather = (i: BagItem): boolean => i.itemType === 1 && i.tplKind === 14 && (i.tplType ?? 0) >= FEATHER_TYPE.A && (i.tplType ?? 0) <= FEATHER_TYPE.D;
export const isFormula = (i: BagItem): boolean => i.itemType === 1 && i.tplKind === 14 && i.tplType === FEATHER_TYPE.MIX;

/** Owned wings (worn first). */
export function wingsOf(host: WingUiHost): BagItem[] {
  return host.items().filter(isWing).sort((a, b) => Number(b.slotType === SlotType.EQUIP) - Number(a.slotType === SlotType.EQUIP) || a.id - b.id);
}

export const wingById = (host: WingUiHost, id: number): BagItem | undefined => host.items().find((i) => i.id === id && isWing(i));
export const worn = (i: BagItem): boolean => i.slotType === SlotType.EQUIP;
export const colourName = (i: BagItem): string => WING_COLOUR_NAMES[i.wing?.colour ?? 0];

/** Units of template `tid` in the bag and the first stack holding them (the id the server wants). */
export function materialOf(host: WingUiHost, tid: number): { count: number; id: number } {
  const stacks = host.items().filter((i) => i.itemType === 1 && i.slotType === SlotType.BAG && i.tid === tid);
  return { count: stacks.reduce((n, s) => n + s.stackNum, 0), id: stacks[0]?.id ?? 0 };
}

/** Icon cell; `count` shows in the corner, an item enables its tooltip. */
export function wgCell(iconCode: string, count?: number, item?: BagItem, level = 1): HTMLElement {
  const cell = el('div', 'wg-cell');
  if (iconCode && iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (count !== undefined) cell.appendChild(el('span', 'wg-count', String(count)));
  if (item) attachItemTip(cell, item, { level });
  return cell;
}

/** "Tên (Cam, 3 sao, Lv 5)" one-line summary of a wing. */
export function wingLabel(i: BagItem): string {
  const parts = [colourName(i), ...(i.star ? [`${i.star} sao`] : []), ...(i.wing && i.wing.level > 0 ? [`Lv ${i.wing.level}`] : []), ...(i.binded ? [] : ['chưa khóa'])];
  return `${i.name.trim()} (${parts.join(', ')})${worn(i) ? ' - đang mặc' : ''}`;
}

/** The wing list on the left of a tab; clicking selects. `filter` narrows the list. */
export function wingPicker(host: WingUiHost, filter: (i: BagItem) => boolean = () => true): HTMLElement {
  const list = el('div', 'ft-list wg-list');
  const rows = wingsOf(host).filter(filter);
  if (rows.length === 0) list.appendChild(el('div', 'ft-muted wg-empty', 'Chưa có cánh phù hợp.'));
  for (const w of rows) {
    const row = el('div', `ft-item wg-row${host.state.sel === w.id ? ' sel' : ''}`);
    row.append(wgCell(w.iconCode, undefined, w), el('div', 'wg-name', wingLabel(w)));
    row.dataset.wing = String(w.id);
    row.onclick = () => {
      host.state.sel = w.id;
      host.state.note = '';
      host.render();
    };
    list.appendChild(row);
  }
  return list;
}

/** "Lông Vũ Thăng Tinh: 12/5" requirement line. */
export function needLine(label: string, have: number, need: number): HTMLElement {
  const row = el('div', `ft-line${have < need ? ' wg-short' : ''}`, `${label}: ${have}/${need}`);
  return row;
}

/** Ten hole cells of a wing (odd slots = character, even slots = pet); `onPick(slot, tid)` is called for a clicked cell (tid: -1 closed, 0 empty, > 0 feather). */
export function holeGrid(wing: BagItem, onPick: (slot: number, tid: number) => void): HTMLElement {
  const box = el('div', 'wg-holes');
  const holes = wing.wing?.holes ?? [];
  for (let slot = 1; slot <= 10; slot++) {
    const tid = holes[slot - 1] ?? -1;
    const info = tid > 0 ? wing.wing?.feathers[String(tid)] : undefined;
    const cell = el('div', `wg-hole${tid < 0 ? ' closed' : tid > 0 ? ' filled' : ''}${slot % 2 === 1 ? ' char' : ' pet'}`);
    cell.dataset.slot = String(slot);
    const who = slot % 2 === 1 ? 'Lỗ nhân vật' : 'Lỗ pet';
    cell.title = info ? `${who}: ${info.name} (${featherText(info)})` : `${who} ${Math.ceil(slot / 2)}${tid < 0 ? ' (chưa đục)' : ''}`;
    if (info && info.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(info.iconCode);
      img.alt = '';
      img.draggable = false;
      img.onerror = () => img.remove();
      cell.appendChild(img);
    } else if (tid < 0) cell.textContent = 'x';
    cell.onclick = () => onPick(slot, tid);
    box.appendChild(cell);
  }
  return box;
}

export { button };
