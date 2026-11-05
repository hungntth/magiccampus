// Seat widgets of the Luyện pet tabs (tap to choose, no drag): a pet seat or an item seat shows its content and opens a
// small picker list on click. Pure DOM; the owning tab keeps the chosen ids and redraws on `changed`.

import type { BagItem, PetView } from '@mc/shared';
import { iconUrl } from '../../assets';
import { NAME_COLORS } from '../itemCell';
import { el } from '../petPanelTabs';
import { stageScale } from '../stage';
import { petColor, petLevel } from './petFuncRules';

export interface SeatFace {
  label: string;
  iconCode?: string;
  color?: number;
  /** Bottom-right text ("Lv30", "2/3"). */
  count?: string;
  lacking?: boolean;
  title?: string;
}

/** A labelled square seat; empty seats show a dashed frame. */
export function seatEl(face: SeatFace, onClick: () => void): HTMLElement {
  const box = el('div', 'pf-seat-box');
  const cell = el('div', `pf-seat${face.iconCode ? '' : ' empty'}`);
  cell.title = face.title ?? face.label;
  if (face.iconCode && face.color) cell.style.borderColor = NAME_COLORS[face.color] ?? '';
  if (face.iconCode) {
    const img = document.createElement('img');
    img.src = iconUrl(face.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (face.count) cell.appendChild(el('span', `pf-count${face.lacking ? ' lacking' : ''}`, face.count));
  cell.onclick = onClick;
  box.append(cell, el('div', 'pf-seat-name', face.label));
  return box;
}

export interface PickOption {
  label: string;
  sub?: string;
  iconCode?: string;
  color?: number;
  onPick: () => void;
}

/** List popup under `anchor`, inside the Luyện window; closes on a pick or any outside press. */
export function openPicker(body: HTMLElement, anchor: HTMLElement, options: PickOption[], emptyText: string): void {
  const root = body.closest<HTMLElement>('.pf-win');
  if (!root) return;
  root.querySelector('.pf-picker')?.remove();
  const pop = el('div', 'pf-picker');
  const close = (): void => {
    document.removeEventListener('pointerdown', outside, true);
    pop.remove();
  };
  const outside = (e: PointerEvent): void => {
    if (!(e.target instanceof Node) || !pop.contains(e.target)) close();
  };
  if (options.length === 0) pop.appendChild(el('div', 'pf-picker-empty', emptyText));
  for (const o of options) {
    const row = el('div', 'pf-picker-row');
    if (o.iconCode) {
      const img = document.createElement('img');
      img.src = iconUrl(o.iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      row.appendChild(img);
    }
    const name = el('span', 'pf-picker-name', o.label);
    if (o.color) name.style.color = NAME_COLORS[o.color] ?? '';
    row.appendChild(name);
    if (o.sub) row.appendChild(el('span', 'pf-picker-sub', o.sub));
    row.onclick = () => {
      close();
      o.onPick();
    };
    pop.appendChild(row);
  }
  root.appendChild(pop);
  const r = root.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const s = stageScale();
  pop.style.left = `${Math.max(4, Math.min((a.left - r.left) / s, root.clientWidth - 200))}px`;
  pop.style.top = `${Math.min((a.bottom - r.top) / s + 2, root.clientHeight - 60)}px`;
  document.addEventListener('pointerdown', outside, true);
}

export interface PetSeatOpts {
  body: HTMLElement;
  label: string;
  pets: PetView[];
  get(): number | null;
  set(id: number | null): void;
  /** Pets that may sit here (already excludes the ones in other seats). */
  candidates(): PetView[];
  changed(): void;
}

export function petSeatEl(o: PetSeatOpts): HTMLElement {
  const cur = o.pets.find((p) => p.id === o.get());
  const box = seatEl(
    { label: cur ? cur.petName : o.label, iconCode: cur?.iconCode, color: cur ? petColor(cur) : 0, count: cur ? `Lv${petLevel(cur)}` : undefined },
    () => {
      const options: PickOption[] = o.candidates().map((p) => ({
        label: p.petName, sub: `Lv${petLevel(p)}${p.binded ? ' khóa' : ''}`, iconCode: p.iconCode, color: petColor(p),
        onPick: () => {
          o.set(p.id);
          o.changed();
        },
      }));
      if (cur) options.unshift({ label: '(Bỏ chọn)', onPick: () => { o.set(null); o.changed(); } });
      openPicker(o.body, box.querySelector<HTMLElement>('.pf-seat') ?? box, options, 'Không có pet phù hợp');
    },
  );
  return box;
}

export interface ItemSeatOpts {
  body: HTMLElement;
  label: string;
  /** Candidate bag stacks (already filtered / sorted). */
  stacks: BagItem[];
  get(): number | null;
  set(id: number | null): void;
  /** Units one action consumes (count shows have/need). */
  need?: number;
  /** Fill the seat with the first stack whenever it is empty or its stack vanished. */
  auto?: boolean;
  changed(): void;
}

export function itemSeatEl(o: ItemSeatOpts): HTMLElement {
  let cur = o.stacks.find((i) => i.id === o.get());
  if (!cur && o.auto && o.stacks.length > 0) {
    cur = o.stacks[0];
    o.set(cur.id);
  } else if (!cur && o.get() !== null) o.set(null);
  const need = o.need ?? 1;
  const box = seatEl(
    {
      label: cur ? cur.name : o.label, iconCode: cur?.iconCode, color: cur?.color,
      count: cur ? `${cur.stackNum}/${need}` : undefined, lacking: !!cur && cur.stackNum < need,
      title: cur ? `${cur.name}\n${cur.info}`.trim() : `${o.label} (nhấp để chọn)`,
    },
    () => {
      const options: PickOption[] = o.stacks.map((i) => ({
        label: i.name, sub: `x${i.stackNum}${i.binded ? ' khóa' : ''}`, iconCode: i.iconCode, color: i.color,
        onPick: () => {
          o.set(i.id);
          o.changed();
        },
      }));
      if (cur) options.unshift({ label: '(Bỏ chọn)', onPick: () => { o.set(null); o.changed(); } });
      openPicker(o.body, box.querySelector<HTMLElement>('.pf-seat') ?? box, options, 'Túi đồ không có vật phẩm phù hợp');
    },
  );
  return box;
}
