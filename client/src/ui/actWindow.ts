// Shared window frame of the M8 phase D panels (boss, offline exp, feast, lotto, prabuff, mount): the .act-win look of the activity windows,
// drag by the title, Esc / x closes. Each panel renders its own content into `body` and owns its host callbacks.

import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './activity.css';
import './dailySystems.css';

export interface ActWindow {
  root: HTMLElement;
  body: HTMLElement;
  /** removes the window and its listeners */
  dispose(): void;
}

export const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function button(label: string, onClick: () => void, cls = 'act-btn', disabled = false): HTMLButtonElement {
  const b = el(cls, label, 'button') as HTMLButtonElement;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

/** Opens a frame in the stage; `onClose` runs for the x button and Esc (the owner then calls dispose). */
export function openActWindow(title: string, cls: string, onClose: () => void): ActWindow {
  const root = el(`act-win ${cls}`);
  const head = el('act-head');
  head.appendChild(el('act-title', title));
  const x = el('act-close', '×', 'button');
  x.title = 'Đóng';
  x.onclick = onClose;
  const body = el('act-body');
  root.append(head, x, body);
  stageEl().appendChild(root);
  const offs = [makeDraggable(root, head, `act.${cls}`), closeOnEscape(onClose)];
  return {
    root, body,
    dispose: () => {
      for (const off of offs) off();
      root.remove();
    },
  };
}
