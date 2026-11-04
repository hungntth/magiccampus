// "Chiến Hồn" tab (WarSpritePanel): page "Thăng Cấp" (war chain, Dũng Khí Thạch) / "Tiến Hóa" (battle chain, Ý Chí Thạch), a list of the
// 8 sprites, the selected sprite's current / next stats, the two upgrade buttons and the aggregated totals.

import { propLabel, wspValueText, type PropLine, type WspPanelData, type WspRowView } from '@mc/shared';
import { button, el, fmt } from './dom';

export interface WarSpriteTabApi {
  data: WspPanelData | null;
  page: 0 | 1;
  selected: number; // 0..7
  stones: number; // current page stone currency
  gold: number;
  busy: boolean;
  onPage(p: 0 | 1): void;
  onSelect(i: number): void;
  onUpgrade(gold: boolean): void;
}

const line = (p: PropLine): string => `${propLabel(p.t)} ${wspValueText(p.t, p.v)}`;

function rowBox(title: string, r: WspRowView | null): HTMLElement {
  const box = el('div', 'ft-col');
  box.appendChild(el('div', 'ft-h', title));
  if (!r) {
    box.appendChild(el('div', 'ft-muted', 'Đã Max Cấp'));
    return box;
  }
  box.appendChild(el('div', 'ft-line', `Lv${r.level}`));
  for (const p of r.props) box.appendChild(el('div', 'ft-prop', line(p)));
  return box;
}

export function renderWarSprite(body: HTMLElement, api: WarSpriteTabApi): void {
  const v = api.data?.view;
  if (!v) {
    body.appendChild(el('div', 'ft-muted', 'Đang tải...'));
    return;
  }
  const tabs = el('div', 'ft-subtabs');
  ['Thăng Cấp', 'Tiến Hóa'].forEach((t, i) => {
    const b = el('button', `ft-subtab${i === api.page ? ' on' : ''}`, t);
    b.onclick = () => api.onPage(i as 0 | 1);
    tabs.appendChild(b);
  });
  body.appendChild(tabs);
  const slots = api.page === 0 ? v.war : v.battle;
  const wrap = el('div', 'ft-split');
  const list = el('div', 'ft-list');
  slots.forEach((s, i) => {
    const row = el('div', `ft-item${i === api.selected ? ' sel' : ''}`, `${s.cur.name || `#${i + 1}`}  Lv${s.cur.level}`);
    row.onclick = () => api.onSelect(i);
    list.appendChild(row);
  });
  const detail = el('div', 'ft-detail');
  const sel = slots[api.selected];
  if (sel) {
    const cols = el('div', 'ft-cols');
    cols.append(rowBox('Thuộc tính', sel.cur), rowBox('Thuộc tính sau', sel.next));
    detail.appendChild(cols);
    const stone = api.page === 0 ? 'Dũng Khí Thạch' : 'Ý Chí Thạch';
    if (sel.next) {
      detail.appendChild(el('div', 'ft-line', `${stone} cần: ${fmt(sel.cur.costNum)} · có: ${fmt(api.stones)}`));
      detail.appendChild(el('div', 'ft-line', `Vàng cần: ${fmt(sel.cur.costGold)} · có: ${fmt(api.gold)}`));
      const row = el('div', 'ft-btns');
      const verb = api.page === 0 ? 'Thăng cấp' : 'Tiến hóa';
      row.append(button(verb, () => api.onUpgrade(false), api.busy), button(`${verb} (vàng)`, () => api.onUpgrade(true), api.busy));
      detail.appendChild(row);
    }
  }
  wrap.append(list, detail);
  body.appendChild(wrap);
  body.appendChild(el('div', 'ft-h', 'Tổng thuộc tính tăng'));
  const totals = Object.entries(v.totals).filter(([t]) => t !== '5' && t !== '7').sort((a, b) => Number(a[0]) - Number(b[0]));
  const box = el('div', 'ft-props ft-wrap');
  for (const [t, raw] of totals) box.appendChild(el('div', 'ft-prop', `${propLabel(Number(t))} ${wspValueText(Number(t), raw)}`));
  if (totals.length === 0) box.appendChild(el('div', 'ft-muted', '-'));
  body.appendChild(box);
}
