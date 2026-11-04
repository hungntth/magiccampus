// "Pháp Tinh" tab (MagicCrystalPanel): 16 energy pools, 4 per page, each with activate / raise cap / fill (type 1 permanent, 2 limit,
// amount) / recover. Costs come from the shared catalog; refusals arrive as server toasts.

import {
  crystalActivateCost, crystalCurrentValue, crystalLevelUpCost, crystalStatType, MAGIC_CRYSTAL, propLabel, type CrystalSlot,
  type MagicCrystalData,
} from '@mc/shared';
import { button, el, fmt } from './dom';

export const CRYSTAL_PAGE = 4;

export interface CrystalTabApi {
  data: MagicCrystalData | null;
  page: number;
  dust: number;
  pre: number;
  limit: number;
  pointType: '1' | '2';
  busy: boolean;
  onPage(p: number): void;
  onType(t: '1' | '2'): void;
  onActivate(i: number): void;
  onUp(i: number): void;
  onRecover(i: number): void;
  onAdd(i: number, amount: number): void;
}

function pool(i: number, c: CrystalSlot, api: CrystalTabApi): HTMLElement {
  const box = el('div', 'ft-pool');
  const t = crystalStatType(i);
  const value = Math.floor(crystalCurrentValue(i, c) * 10_000) / 10_000;
  box.appendChild(el('div', 'ft-h', `Hồ ${i + 1}: ${propLabel(t)}${c.a ? ` · Lv${c.lv}` : ''}`));
  if (!c.a) {
    const cost = crystalActivateCost(i) ?? 0;
    box.appendChild(el('div', 'ft-line', `Chưa kích hoạt · cần ${cost} Bụi Ảo Năng`));
    box.appendChild(button('Kích hoạt', () => api.onActivate(i), api.busy || api.dust < cost));
    return box;
  }
  box.appendChild(el('div', 'ft-line', `Năng lượng ${c.l + c.s}/${c.max} (VV ${c.l}, Tạm ${c.s}) · +${value} ${propLabel(t)}`));
  const row = el('div', 'ft-btns');
  const input = el('input', 'ft-num');
  input.type = 'number';
  input.min = '1';
  input.max = String(MAGIC_CRYSTAL.MAX_ADD);
  input.value = String(Math.max(1, Math.min(c.max - c.l - c.s, 100)));
  row.append(input, button('Nạp', () => api.onAdd(i, Math.trunc(Number(input.value))), api.busy || c.l + c.s >= c.max));
  const up = crystalLevelUpCost(i, c.lv) ?? 0;
  if (up > 0) row.appendChild(button(`Tăng giới hạn (${up})`, () => api.onUp(i), api.busy || api.dust < up));
  row.appendChild(button(`Thu hồi (${MAGIC_CRYSTAL.RECOVER_COST})`, () => api.onRecover(i), api.busy || c.l + c.s <= 0 || api.dust < MAGIC_CRYSTAL.RECOVER_COST));
  box.appendChild(row);
  return box;
}

export function renderCrystal(body: HTMLElement, api: CrystalTabApi): void {
  if (!api.data) {
    body.appendChild(el('div', 'ft-muted', 'Đang tải...'));
    return;
  }
  body.appendChild(el('div', 'ft-line', `Bụi Ảo Năng: ${fmt(api.dust)} · Pha Lê Vĩnh Hằng: ${fmt(api.pre)} · Pha Lê Cực Hạn: ${fmt(api.limit)}`));
  const types = el('div', 'ft-subtabs');
  (['1', '2'] as const).forEach((t) => {
    const b = el('button', `ft-subtab${api.pointType === t ? ' on' : ''}`, t === '1' ? 'Dùng Pha Lê Vĩnh Hằng' : 'Dùng Pha Lê Cực Hạn');
    b.onclick = () => api.onType(t);
    types.appendChild(b);
  });
  body.appendChild(types);
  const pages = Math.ceil(MAGIC_CRYSTAL.SLOTS / CRYSTAL_PAGE);
  for (let k = 0; k < CRYSTAL_PAGE; k++) {
    const i = api.page * CRYSTAL_PAGE + k;
    const c = api.data[String(i)];
    if (c) body.appendChild(pool(i, c, api));
  }
  const nav = el('div', 'ft-btns');
  nav.append(
    button('<', () => api.onPage(api.page - 1), api.page <= 0),
    el('span', 'ft-line', `${api.page + 1}/${pages}`),
    button('>', () => api.onPage(api.page + 1), api.page >= pages - 1),
  );
  body.appendChild(nav);
}
