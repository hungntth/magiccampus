// Small yes / no confirmation (legacy Alert) reusing the amount-dialog look: message, Đồng ý / Hủy. Enter confirms,
// Esc cancels (both call onNo when given). Optional button labels (the wedding vow: Con đồng ý / Không đồng ý). Returns a function
// that closes it without calling either.

import { stageEl } from './stage';
import './bag.css';

export function askConfirm(text: string, onYes: () => void, onNo?: () => void, labels?: { yes: string; no: string }): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog confirm-dialog';
  const msg = document.createElement('div');
  msg.className = 'amount-total confirm-text';
  msg.textContent = text;
  const mk = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'amount-btn';
    b.textContent = label;
    return b;
  };
  const ok = mk(labels?.yes ?? 'Đồng ý');
  const cancel = mk(labels?.no ?? 'Hủy');
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, cancel);
  root.append(msg, row);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    if (e.key === 'Enter') yes();
    else no();
  };
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
  };
  const yes = (): void => {
    close();
    onYes();
  };
  const no = (): void => {
    close();
    onNo?.();
  };
  ok.onclick = yes;
  cancel.onclick = no;
  window.addEventListener('keydown', onKey, true);
  stageEl().appendChild(root);
  ok.focus();
  return close;
}
