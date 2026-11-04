// "Trả bằng" radio row of the NPC shop and the mall: Ngân phiếu / Bạc (silver pair) and Kim phiếu / Vàng (gold pair).
// Clicking a radio calls changeMoneyType through PaymentControl; both pairs stay disabled until the reply arrives.

import type { PaymentControl } from '../game/payment';

interface RadioDef {
  type: number;
  label: string;
  tip: string;
}

const SILVER: RadioDef[] = [
  { type: 1, label: 'Ngân phiếu', tip: 'Vật phẩm sau khi mua bằng ngân phiếu sẽ bị khóa' },
  { type: 2, label: 'Bạc', tip: 'Vật phẩm sau khi mua bằng bạc sẽ không bị khóa' },
];
const GOLD: RadioDef[] = [
  { type: 3, label: 'Kim phiếu', tip: 'Vật phẩm sau khi mua bằng kim phiếu sẽ bị khóa' },
  { type: 4, label: 'Vàng', tip: 'Vật phẩm sau khi mua bằng vàng sẽ không bị khóa' },
];

export interface PaymentRadios {
  element: HTMLElement;
  destroy(): void;
}

let groupSeq = 0;

/** `kinds`: which pairs to show ('gold' for the mall, 'both' for the NPC shop). */
export function paymentRadios(ctl: PaymentControl, kinds: 'gold' | 'both'): PaymentRadios {
  const element = document.createElement('div');
  element.className = 'pay-row';
  const label = document.createElement('span');
  label.className = 'pay-label';
  label.textContent = 'Trả bằng:';
  element.appendChild(label);
  const inputs = new Map<number, HTMLInputElement>();
  const groups = kinds === 'both' ? [SILVER, GOLD] : [GOLD];
  for (const defs of groups) {
    const name = `pay-${groupSeq++}`;
    for (const d of defs) {
      const wrap = document.createElement('label');
      wrap.className = 'pay-radio';
      wrap.title = d.tip;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.dataset.type = String(d.type);
      input.onchange = () => void ctl.select(d.type);
      wrap.append(input, d.label);
      inputs.set(d.type, input);
      element.appendChild(wrap);
    }
  }
  const sync = (): void => {
    const p = ctl.prefs();
    for (const [type, input] of inputs) {
      input.checked = type === p.selectedMoneyType || type === p.selectedGoldType;
      input.disabled = ctl.pending;
    }
  };
  sync();
  return { element, destroy: ctl.subscribe(sync) };
}
