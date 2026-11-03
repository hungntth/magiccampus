// Small "enter the amount" dialog (legacy NumPanel) used by the shop buy flow: number input 1..max, total price
// line, Đồng ý / Hủy. Enter confirms, Esc cancels (and does not reach the shop's own Esc handler).

import { stageEl } from './stage';
import './bag.css';

export interface AmountOptions {
  title: string;
  max: number;
  /** Text shown under the input for the current amount, e.g. "Thành tiền: 200 Bạc". */
  totalText(amount: number): string;
  onOk(amount: number): void;
}

/** Opens the dialog and returns a function that closes it. */
export function askAmount(opts: AmountOptions): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog';
  const title = document.createElement('div');
  title.className = 'amount-title';
  title.textContent = opts.title;
  const input = document.createElement('input');
  input.className = 'amount-input';
  input.type = 'number';
  input.min = '1';
  input.max = String(opts.max);
  input.value = '1';
  const total = document.createElement('div');
  total.className = 'amount-total';
  const ok = document.createElement('button');
  ok.className = 'amount-btn';
  ok.textContent = 'Đồng ý';
  const cancel = document.createElement('button');
  cancel.className = 'amount-btn';
  cancel.textContent = 'Hủy';
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, cancel);
  root.append(title, input, total, row);

  const close = (): void => root.remove();
  const value = (): number => {
    const n = Math.floor(Number(input.value));
    return Number.isFinite(n) ? Math.max(1, Math.min(opts.max, n)) : 1;
  };
  const refresh = (): void => {
    total.textContent = opts.totalText(value());
  };
  const confirm = (): void => {
    const amount = value();
    close();
    opts.onOk(amount);
  };
  input.oninput = refresh;
  input.onblur = () => {
    input.value = String(value());
    refresh();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') close();
    else return;
    e.stopPropagation();
    e.preventDefault();
  };
  ok.onclick = confirm;
  cancel.onclick = close;
  stageEl().appendChild(root);
  refresh();
  input.focus();
  input.select();
  return close;
}
