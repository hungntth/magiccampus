// Shared window frame of the M12 boost windows (Hộ Vệ, Thiên Phú, Bảo Thạch): a draggable `.pf-win` (so petfunc/seats.ts `openPicker`
// finds its root) with a title, a close button and a body. Pure DOM; the owning window class keeps its own state.

import { iconUrl } from '../../assets';
import { makeDraggable } from '../panelBehavior';
import { el } from '../petPanelTabs';
import { stageEl } from '../stage';
import '../petfunc/petFunc.css';
import './petBoost.css';

export interface BoostFrame {
  root: HTMLElement;
  body: HTMLElement;
  /** Extra row between the title and the body (tabs / page switches); empty by default. */
  bar: HTMLElement;
  dispose(): void;
}

export function createBoostFrame(title: string, cls: string, dragKey: string, onClose: () => void): BoostFrame {
  const root = el('div', `pf-win ${cls}`);
  const header = el('div', 'pf-header');
  header.appendChild(el('div', 'pf-title', title));
  const x = el('button', 'pet-close', '×');
  x.title = 'Đóng';
  x.onclick = onClose;
  const bar = el('div', 'pf-tabs');
  const body = el('div', 'pf-body');
  root.append(header, x, bar, body);
  stageEl().appendChild(root);
  const offDrag = makeDraggable(root, header, dragKey);
  return {
    root, body, bar,
    dispose: () => {
      offDrag();
      root.remove();
    },
  };
}

/** Item / stone / skill icon cell with an optional count; empty cells render a dim frame. */
export function iconCell(cls: string, icon: string | null, count?: string): HTMLElement {
  const cell = el('div', cls + (icon ? '' : ' empty'));
  if (icon) {
    const img = document.createElement('img');
    img.src = iconUrl(icon);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (count) cell.appendChild(el('span', 'pf-count', count));
  return cell;
}
