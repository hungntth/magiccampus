// "Tặng quà" dialog for intimacy items (templates 32 / 1302 / 1303 / 1315): friend name + quantity, then useIntimacyItem. The
// server answers with bag pushes and onSetClose; refusals come back as RPC errors and are toasted. The last friend selected in
// the IM window prefills the name.

import { INTIMACY_ITEMS, intimacyItemAmount, type BagItem } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { stageEl } from '../stage';
import { toast } from '../screens';
import '../bag.css';

let lastTarget = '';

/** Remembers the friend row last selected in the IM window (prefill of the gift name). */
export function rememberGiftTarget(name: string): void {
  lastTarget = name;
}

export const isIntimacyItem = (tid: number): boolean => Object.prototype.hasOwnProperty.call(INTIMACY_ITEMS, tid);

const field = <K extends 'div' | 'button' | 'input'>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Opens the dialog for one bag stack; returns a function that closes it. */
export function openIntimacyGift(client: GameClient, item: BagItem): () => void {
  const per = intimacyItemAmount(item.tid) ?? 0;
  const root = field('div', 'amount-dialog intimacy-gift');
  const title = field('div', 'amount-title', `Tặng ${item.name}`);
  const name = field('input', 'amount-input gift-name');
  name.placeholder = 'Tên người nhận (bạn bè)';
  name.maxLength = 30;
  name.value = lastTarget;
  const qty = field('input', 'amount-input gift-qty');
  qty.type = 'number';
  qty.min = '1';
  qty.max = String(item.stackNum);
  qty.value = '1';
  const total = field('div', 'amount-total');
  const amount = (): number => Math.max(1, Math.min(item.stackNum, Math.floor(Number(qty.value)) || 1));
  const refresh = (): void => {
    total.textContent = `Điểm thân mật mỗi bên: +${per * amount()} (có ${item.stackNum})`;
  };
  qty.oninput = refresh;
  const ok = field('button', 'amount-btn', 'Tặng');
  const cancel = field('button', 'amount-btn', 'Hủy');
  const row = field('div', 'amount-row');
  row.append(ok, cancel);
  root.append(title, name, qty, total, row);

  const close = (): void => root.remove();
  const send = (): void => {
    const who = name.value.trim();
    if (!who) return void toast('Hãy nhập tên người nhận.', true);
    const n = amount();
    close();
    void client.call('useIntimacyItem', who, n, item.tid).then(
      () => rememberGiftTarget(who),
      (e) => toast((e as Error).message, true),
    );
  };
  root.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') send();
    else if (e.key === 'Escape') close();
  };
  ok.onclick = send;
  cancel.onclick = close;
  stageEl().appendChild(root);
  refresh();
  (name.value ? qty : name).focus();
  return close;
}
