// Tiny single-line text prompt (room password / room id) in the amount-dialog look; Enter confirms, Esc cancels.

import { stageEl } from '../stage';
import '../bag.css';

export function askText(title: string, onOk: (text: string) => void, opts: { digits?: boolean; max?: number; value?: string } = {}): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog';
  const head = document.createElement('div');
  head.className = 'amount-title';
  head.textContent = title;
  const input = document.createElement('input');
  input.className = 'amount-input';
  input.value = opts.value ?? '';
  if (opts.max) input.maxLength = opts.max;
  const mk = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'amount-btn';
    b.textContent = label;
    return b;
  };
  const ok = mk('Đồng ý');
  const cancel = mk('Hủy');
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, cancel);
  root.append(head, input, row);
  const close = (): void => root.remove();
  const confirm = (): void => {
    const v = input.value.trim();
    close();
    onOk(v);
  };
  input.oninput = () => {
    if (opts.digits) input.value = input.value.replace(/\D/g, '');
  };
  input.onkeydown = (e) => {
    e.stopPropagation(); // typing must not reach the HUD hotkeys
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') close();
  };
  ok.onclick = confirm;
  cancel.onclick = close;
  stageEl().appendChild(root);
  input.focus();
  return close;
}
