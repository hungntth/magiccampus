// Hover tooltip for item slots (legacy TipItem.as / BasicToolTip): icon + name in the quality colour, bind state in green,
// description, "Loại: …", stat lines, sell price or "Không thể bán". One floating box in #stage, placed beside the cell.

import { ELEMENT_NAMES, EQUIP_PROP_LABELS, PREFIX_NAMES, type BagItem, type EquipLines, type ShopSlotView } from '@mc/shared';
import { iconUrl } from '../assets';
import { itemTypeName } from './itemTypeNames';
import { stageEl, stageScale } from './stage';
import './itemTip.css';

// GamePredef.as:757 name palette, indices 0..8 (same as the shop).
export const NAME_COLORS = ['#FFFFFF', '#00FF00', '#0066FF', '#FF33FF', '#FA5B05', '#FF0000', '#33CCAA', '#33CCAA', '#FFAE17'];

/** Who is looking: the viewer's level (requirement colouring), worn piece or not, and whether to show the double-click hint. */
export interface ItemTipContext {
  level: number;
  equipped?: boolean;
  hint?: boolean;
}

const GAP = 6;
let box: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;
let listening = false;

/** Shows the item tooltip while the pointer is over `cell`. */
export function attachItemTip(cell: HTMLElement, item: BagItem, ctx: ItemTipContext): void {
  attachTip(cell, () => renderItemTip(item, ctx));
}

/** Shows the tooltip built by `render` (at hover time) while the pointer is over `cell`. */
export function attachTip(cell: HTMLElement, render: () => HTMLElement): void {
  cell.onpointerenter = () => showItemTip(cell, render());
  cell.onpointerleave = () => hideItemTip(cell);
  cell.addEventListener('dragstart', () => hideItemTip());
  cell.addEventListener('pointerdown', () => hideItemTip());
}

export function hideItemTip(from?: HTMLElement): void {
  if (!box || (from && owner !== from)) return;
  box.hidden = true;
  owner = null;
}

function showItemTip(cell: HTMLElement, content: HTMLElement): void {
  const stage = stageEl();
  if (!box || !box.isConnected) {
    box = document.createElement('div');
    box.className = 'item-tip';
    stage.appendChild(box);
  }
  if (!listening) {
    // A re-rendered or closed panel removes the cell without a pointerleave: drop the box once its cell is gone.
    listening = true;
    window.addEventListener('pointermove', () => owner && !owner.isConnected && hideItemTip());
    window.addEventListener('keydown', () => hideItemTip());
  }
  box.replaceChildren(content);
  box.hidden = false;
  owner = cell;
  // Stage pixels: the stage is CSS-scaled, so client rects are divided by the scale.
  const scale = stageScale();
  const s = stage.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const sw = stage.offsetWidth;
  const sh = stage.offsetHeight;
  const left = (c.left - s.left) / scale;
  const right = (c.right - s.left) / scale;
  const top = (c.top - s.top) / scale;
  const x = right + GAP + w <= sw ? right + GAP : Math.max(0, left - GAP - w);
  const y = Math.max(0, Math.min(sh - h, top));
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

export const propLabel = (prop: number): string => EQUIP_PROP_LABELS[prop] ?? `#${prop}`;

/** Rolled stat lines of a crafted piece (instance values only; plain template lines are not repeated). */
export function rolledLines(l: EquipLines): string[] {
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

export function renderItemTip(item: BagItem, ctx: ItemTipContext): HTMLElement {
  const root = el('div', 'it-body');
  const head = el('div', 'it-head', '', root);
  const icon = el('div', 'it-icon', '', head);
  if (item.iconCode && item.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(item.iconCode);
    img.alt = '';
    img.onerror = () => img.remove();
    icon.appendChild(img);
  }
  const prefix = item.prefix ? PREFIX_NAMES[item.prefix] : '';
  const name = el('div', 'it-name', prefix ? `${prefix} ${item.name}` : item.name, head);
  name.style.color = NAME_COLORS[item.color] ?? NAME_COLORS[0];
  el('div', 'it-bind', item.binded ? 'Đã khóa' : 'Chưa khóa', head);

  if (item.info) el('div', 'it-info', item.info, root);
  const equip = item.itemType === 2;
  if (!equip) el('div', 'it-line', `Loại: ${itemTypeName(item.tplType ?? 0)}`, root);
  if (item.quality) el('div', 'it-line', `Phẩm chất: ${item.quality}`, root);
  if (item.element) el('div', 'it-line', `Hệ: ${ELEMENT_NAMES[item.element] ?? item.element}`, root);
  if (item.star) el('div', 'it-line', `Sao: ${item.star}`, root);
  if (item.reqLevel > 0) {
    el('div', `it-line${ctx.level < item.reqLevel ? ' it-bad' : ''}`, `Cấp độ cần: ${item.reqLevel}`, root);
  }
  if (item.lines) for (const l of rolledLines(item.lines)) el('div', 'it-line it-prop', l, root);
  if (item.holeNum) el('div', 'it-line', `Lỗ khảm: ${item.holeNum} (${item.gems?.filter((g) => g > 0).length ?? 0} đã khảm)`, root);
  if (item.activeProp) el('div', 'it-line it-prop', `Linh hồn: ${propLabel(item.activeProp)} +${item.activePropNum ?? 0}`, root);
  if (item.makerName) el('div', 'it-line it-prop', `${item.makerName} chế tạo`, root);
  if (item.maxDurability > 0) el('div', 'it-line', `Độ bền: ${item.durability}/${item.maxDurability}`, root);
  if (item.stackNum > 1) el('div', 'it-line', `Số lượng: ${item.stackNum}`, root);
  if (item.sellPrice > 0) el('div', 'it-line', `Giá bán ra: ${item.sellPrice}`, root);
  else el('div', 'it-line it-nosell', 'Không thể bán', root);
  if (ctx.hint && equip) el('div', 'it-line it-hint', ctx.equipped ? 'Nhấp đôi để tháo gỡ' : 'Nhấp đôi để mặc', root);
  return root;
}

/** The fields of a shop / mall / credit slot the template tooltip reads. */
export type SlotTipSource = Pick<ShopSlotView, 'iconCode' | 'name' | 'color' | 'info' | 'tplType' | 'reqLevel'>;

/** Template tooltip of a shop / mall slot (no instance yet): the bag box without bind state and sell price.
 * `level` unknown: the requirement line is never marked red. */
export function renderSlotTip(slot: SlotTipSource, level?: number): HTMLElement {
  const root = el('div', 'it-body');
  const head = el('div', 'it-head', '', root);
  const icon = el('div', 'it-icon', '', head);
  if (slot.iconCode && slot.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(slot.iconCode);
    img.alt = '';
    img.onerror = () => img.remove();
    icon.appendChild(img);
  }
  const name = el('div', 'it-name', slot.name, head);
  name.style.color = NAME_COLORS[slot.color] ?? NAME_COLORS[0];
  if (slot.info) el('div', 'it-info', slot.info, root);
  if (slot.tplType > 0) el('div', 'it-line', `Loại: ${itemTypeName(slot.tplType)}`, root);
  if (slot.reqLevel > 0) el('div', `it-line${level !== undefined && level < slot.reqLevel ? ' it-bad' : ''}`, `Cấp độ cần: ${slot.reqLevel}`, root);
  return root;
}

function el(tag: string, cls: string, text = '', parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
