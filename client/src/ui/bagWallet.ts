// Currency fields of the bag window (2 x 2: Ngân phiếu, Kim phiếu, Bạc, Vàng) with their payment radios; clicking a
// checkbox picks that currency (changeMoneyType 1 / 3 / 2 / 4), the pairs Ngân phiếu / Bạc and Kim phiếu / Vàng are exclusive.

import type { MoneyKey, PlayerData } from '@mc/shared';

const SKIN = '/ui/Panels_BagPanel';

// Legacy BAGPANEL_U labels and BAGPANEL_S payment hints (Language.as). Row-major 2 x 2, as in the original.
const WALLET: { key: MoneyKey; icon: string; tip: string; type: number }[] = [
  { key: 'moneyBind', icon: 'SilverBinded', type: 1,
    tip: 'Ngân phiếu. Chọn chi trả bằng ngân phiếu: Vật phẩm sau khi mua bằng ngân phiếu sẽ bị khóa.' },
  { key: 'goldBind', icon: 'GoldBinded', type: 3,
    tip: 'Kim phiếu. Chọn chi trả bằng kim phiếu: Vật phẩm sau khi mua bằng kim phiếu sẽ bị khóa.' },
  { key: 'money', icon: '11533', type: 2,
    tip: 'Bạc. Chọn chi trả bằng bạc: Vật phẩm sau khi mua bằng bạc sẽ không bị khóa.' },
  { key: 'gold', icon: '1663', type: 4,
    tip: 'Vàng. Chọn chi trả bằng vàng: Vật phẩm sau khi mua bằng vàng sẽ không bị khóa.' },
];

export class BagWallet {
  readonly element = document.createElement('div');
  private readonly values = new Map<MoneyKey, HTMLElement>();
  private readonly checks = new Map<number, HTMLElement>();

  constructor(onPick: (type: number) => void) {
    this.element.className = 'bag-wallet';
    for (const w of WALLET) {
      const field = document.createElement('div');
      field.className = 'bag-money';
      field.title = w.tip;
      const icon = document.createElement('span');
      icon.className = 'bag-money-icon';
      icon.style.backgroundImage = `url(${SKIN}/${w.icon}.png)`;
      const value = document.createElement('span');
      value.className = 'bag-money-val';
      const check = document.createElement('span');
      check.className = 'bag-check pickable';
      check.dataset.type = String(w.type);
      check.onclick = () => onPick(w.type);
      this.checks.set(w.type, check);
      field.append(icon, value, check);
      this.values.set(w.key, value);
      this.element.appendChild(field);
    }
  }

  render(p: PlayerData): void {
    for (const w of WALLET) this.values.get(w.key)!.textContent = String(p[w.key] ?? 0);
    for (const [type, check] of this.checks) {
      check.classList.toggle('checked', type === (p.selectedMoneyType ?? 1) || type === (p.selectedGoldType ?? 3));
    }
  }
}
