// Text input dialog of the marriage UI (seek ad / proposal message): a title, a text area (100 characters, MARRIAGE.contentMax) and
// Gửi / Hủy. Reuses the amount-dialog look; Esc cancels, Ctrl+Enter sends.

import { MARRIAGE } from '@mc/shared';
import { stageEl } from '../stage';
import { el } from './marriageDom';
import '../bag.css';

/** Opens the dialog; `onSubmit` receives the trimmed text. Returns a function that closes it. */
export function askText(title: string, placeholder: string, onSubmit: (text: string) => void): () => void {
  const root = el('div', 'amount-dialog marriage-text-dialog');
  const area = el('textarea', 'marriage-textarea');
  area.maxLength = MARRIAGE.contentMax;
  area.placeholder = placeholder;
  area.rows = 4;
  const ok = el('button', 'amount-btn', 'Gửi');
  const cancel = el('button', 'amount-btn', 'Hủy');
  const row = el('div', 'amount-row');
  row.append(ok, cancel);
  root.append(el('div', 'amount-title', title), area, row);
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
  };
  const send = (): void => {
    close();
    onSubmit(area.value.trim());
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.stopPropagation();
      send();
    }
  }
  area.onkeydown = (e) => e.stopPropagation();
  ok.onclick = send;
  cancel.onclick = close;
  window.addEventListener('keydown', onKey, true);
  stageEl().appendChild(root);
  area.focus();
  return close;
}
