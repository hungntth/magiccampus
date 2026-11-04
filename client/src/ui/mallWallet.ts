// Mall wallet column (legacy SystemShopPanel bottom-right): Kim phiếu / Vàng balances with the payment checkboxes
// (changeMoneyType 3 / 4 through PaymentControl, exclusive like the Flash pair; disabled while a change is in flight) and the
// điểm thưởng (exPoint) row with its "Đổi điểm thưởng" link. Icons are the original skins (/ui/Panels_BagPanel).

import type { PlayerData } from '@mc/shared';
import type { PaymentControl } from '../game/payment';
import { notReady } from './hud/skin';
import { el } from './shopCell';

const SKIN = '/ui/Panels_BagPanel';

interface Row {
  icon: string;
  tip: string;
  value: (p: PlayerData) => number;
  /** changeMoneyType id of the checkbox; undefined = the points row. */
  type?: number;
  label: string;
}

// Labels and hints: BAGPANEL_U[8] "K.ph", BAGPANEL_U[9] "Vàng", BAGPANEL_S[16] / [17], SYSTEMSHOPPANEL_U[50].
const ROWS: Row[] = [
  { icon: 'GoldBinded', type: 3, label: 'K.ph', value: (p) => p.goldBind,
    tip: 'Kim phiếu. Chọn chi trả bằng kim phiếu: Vật phẩm sau khi mua bằng kim phiếu sẽ bị khóa.' },
  { icon: '1663', type: 4, label: 'Vàng', value: (p) => p.gold,
    tip: 'Vàng. Chọn chi trả bằng vàng: Vật phẩm sau khi mua bằng vàng sẽ không bị khóa.' },
  { icon: 'ExchangePoint', label: 'Đổi điểm thưởng', value: (p) => p.exPoint ?? 0, tip: 'Điểm thưởng' },
];

export interface MallWallet {
  element: HTMLElement;
  /** Re-reads the balances (after onUPP / onAddMoney). */
  refresh(): void;
  destroy(): void;
}

export function mallWallet(ctl: PaymentControl, player: () => PlayerData): MallWallet {
  const element = el('div', 'mall-wallet');
  const parts = ROWS.map((r) => {
    const row = el('div', 'mall-wallet-row');
    row.title = r.tip;
    const icon = el('span', 'mall-wallet-icon');
    icon.style.backgroundImage = `url(${SKIN}/${r.icon}.png)`;
    const amount = el('span', 'mall-wallet-num');
    row.append(icon, amount);
    let input: HTMLInputElement | null = null;
    if (r.type !== undefined) {
      const type = r.type;
      const box = el('label', 'mall-wallet-pick');
      input = el('input', '');
      input.type = 'checkbox';
      const self = input;
      self.onchange = () => {
        self.checked = !self.checked; // the reply decides; refresh() sets the real state
        void ctl.select(type);
      };
      box.append(self, r.label);
      row.appendChild(box);
    } else {
      const link = el('button', 'mall-wallet-link', r.label);
      link.onclick = notReady;
      row.appendChild(link);
    }
    element.appendChild(row);
    return { r, amount, input };
  });
  const refresh = (): void => {
    const p = player();
    const chosen = ctl.prefs().selectedGoldType;
    for (const { r, amount, input } of parts) {
      amount.textContent = r.value(p).toLocaleString('vi-VN');
      if (!input) continue;
      input.checked = chosen === r.type;
      input.disabled = ctl.pending;
    }
  };
  refresh();
  return { element, refresh, destroy: ctl.subscribe(refresh) };
}
