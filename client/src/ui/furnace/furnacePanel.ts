// Lò Luyện Thần Bí window: tab 0 recyclable bag stacks (click to select), tab 1 score rows with a count input.

import { FURNACE_TEXT, type FurnaceInfo } from '@mc/shared';
import { iconUrl } from '../../assets';
import { FeatureWindow } from '../feature/featureWindow';
import { button, el, fmt } from '../feature/dom';
import { clampCount, itemsTotal, scoreCrystals, scoresTotal } from './furnaceRules';
import './furnace.css';

/** State kept by the controller so a re-render keeps the selection and the typed counts. */
export interface FurnaceView {
  selected: Set<number>;
  counts: Record<number, number>;
}

export const newFurnaceView = (): FurnaceView => ({ selected: new Set(), counts: {} });

export interface FurnaceUiHost {
  info(): FurnaceInfo | null;
  view: FurnaceView;
  busy(): boolean;
  /** redraw only (selection changed) */
  render(): void;
  smeltItems(): void;
  smeltScores(): void;
}

function itemCell(host: FurnaceUiHost, info: FurnaceInfo, i: number): HTMLElement {
  const r = info.items[i];
  const cell = el('div', `fn-cell${host.view.selected.has(r.id) ? ' sel' : ''}`);
  cell.title = `${r.name} x${r.num} (${fmt(r.value)}/1)`;
  if (r.iconCode && r.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(r.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (r.num > 1) cell.appendChild(el('span', 'fn-count', String(r.num)));
  cell.onclick = () => {
    if (!host.view.selected.delete(r.id)) host.view.selected.add(r.id);
    host.render();
  };
  return cell;
}

function itemsTab(body: HTMLElement, host: FurnaceUiHost, info: FurnaceInfo): void {
  body.appendChild(el('div', 'ft-muted', FURNACE_TEXT.PICK));
  const grid = el('div', 'fn-grid');
  for (let i = 0; i < info.items.length; i++) grid.appendChild(itemCell(host, info, i));
  body.appendChild(grid);
  body.appendChild(el('div', 'fn-line', `${FURNACE_TEXT.GET} ${fmt(itemsTotal(info.items, host.view.selected))}`));
  body.appendChild(el('div', 'fn-line', `${FURNACE_TEXT.HAVE}: ${fmt(info.crystal)}`));
  body.appendChild(button(FURNACE_TEXT.BUTTON, () => host.smeltItems(), host.busy()));
  body.appendChild(el('div', 'ft-muted', FURNACE_TEXT.HELP_ITEMS));
}

function scoresTab(body: HTMLElement, host: FurnaceUiHost, info: FurnaceInfo): void {
  const rows = info.scores.filter((r) => r.value > 0);
  for (const r of rows) {
    const row = el('div', 'fn-row');
    row.append(el('span', 'fn-name', r.name), el('span', 'fn-owned', FURNACE_TEXT.OWNED(r.owned)));
    const input = el('input', 'fn-input');
    input.type = 'number';
    input.min = '0';
    input.max = String(r.owned);
    input.value = String(host.view.counts[r.type] ?? 0);
    const preview = el('span', 'fn-preview', `+${fmt(scoreCrystals(r, host.view.counts[r.type] ?? 0))}`);
    input.onchange = () => {
      host.view.counts[r.type] = clampCount(Number(input.value), r.owned);
      host.render();
    };
    row.append(input, preview);
    body.appendChild(row);
  }
  body.appendChild(el('div', 'fn-line', `${FURNACE_TEXT.GET} ${fmt(scoresTotal(rows, host.view.counts))}`));
  body.appendChild(el('div', 'fn-line', `${FURNACE_TEXT.HAVE}: ${fmt(info.crystal)}`));
  body.appendChild(button(FURNACE_TEXT.BUTTON, () => host.smeltScores(), host.busy()));
  body.appendChild(el('div', 'ft-muted', FURNACE_TEXT.HELP_SCORES));
}

export function createFurnaceWindow(host: () => FurnaceUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    {
      renderTab: (tab, body) => {
        const h = host();
        const info = h.info();
        if (!info) return;
        if (tab === 0) itemsTab(body, h, info);
        else scoresTab(body, h, info);
      },
      onTab: () => undefined,
      onClose,
    },
    { title: FURNACE_TEXT.TITLE, tabs: FURNACE_TEXT.TABS, cls: 'furnace-window' },
  );
}
