// "Hắc Diệu Thạch" tab: the current figure of the Hắc Diệu Thạch Trận as a list UI (the legacy panel art is not decompiled): points with
// price / state, triangles with their bonus, the completion bonus and the accumulated totals. Click a reachable point to light it.

import { heiyaoshiBuffText, heiyaoshiPropText, HEIYAOSHI, isHeiyaoshiStage2, type HeiyaoshiPanelData, type HeiyaoshiPointView } from '@mc/shared';
import { button, el, fmt } from './dom';

export interface HeiyaoshiTabApi {
  panel: HeiyaoshiPanelData | null;
  /** Balance of the stone pool of the current figure. */
  stones: number;
  gold: number;
  busy: boolean;
  onLight(point: HeiyaoshiPointView): void;
  onReset(): void;
}

const attrText = (attr: Record<string, number>): string =>
  Object.entries(attr).map(([p, v]) => heiyaoshiPropText(Number(p), v)).join(', ') || '-';

export function renderHeiyaoshi(body: HTMLElement, api: HeiyaoshiTabApi): void {
  const p = api.panel;
  if (!p) {
    body.appendChild(el('div', 'ft-muted', 'Đang tải...'));
    return;
  }
  const d = p.data;
  const v = p.view;
  if (!v) {
    body.appendChild(el('div', 'ft-title', 'Đã hoàn thành toàn bộ Hắc Diệu Thạch Trận'));
    body.appendChild(el('div', 'ft-line', `Tổng thuộc tính: ${heiyaoshiBuffText(d.Buff).join(', ') || '-'}`));
    body.appendChild(button('Đặt lại (thử nghiệm)', api.onReset, api.busy));
    return;
  }
  const stage2 = isHeiyaoshiStage2(v.figure);
  body.appendChild(el('div', 'ft-title', `Hắc Diệu Thạch Trận ${v.figure}/${HEIYAOSHI.MAX_FIGURE} · Giai đoạn ${v.stage}`));
  body.appendChild(el('div', 'ft-line', `${stage2 ? 'T.Hoa H.Diệu Thạch' : 'Hắc Diệu Thạch'}: ${fmt(api.stones)} · Vàng: ${fmt(api.gold)}`));

  const lit = new Set(d.actPoint);
  const grid = el('div', 'ft-hy-grid');
  for (const pt of v.points) {
    const on = lit.has(pt.id);
    const reachable = !on && pt.around.some((n) => lit.has(n));
    const b = el('button', `ft-hy-pt${on ? ' lit' : reachable ? ' open' : ''}`);
    b.dataset.point = String(pt.id);
    b.append(el('div', 'ft-hy-id', `#${pt.id}`), el('div', 'ft-hy-cost', on ? 'Đã kích hoạt' : pt.price > 0 ? `${fmt(pt.price)} thạch` : 'Khởi điểm'));
    b.disabled = !reachable || api.busy;
    b.title = on ? 'Đã kích hoạt' : `…Chưa Kích Hoạt…Kích Hoạt cần ${pt.price} ${stage2 ? 'T.Hoa H.Diệu Thạch' : 'Hắc Diệu Thạch'} (hoặc ${pt.gold} vàng)`;
    b.onclick = () => api.onLight(pt);
    grid.appendChild(b);
  }
  body.appendChild(grid);

  const areas = el('div', 'ft-box');
  areas.appendChild(el('div', 'ft-h', `Tam giác (${d.AreaNum}/${v.areas.length})`));
  for (const a of v.areas) {
    const done = d.actArea[String(a.id)] === 1;
    areas.appendChild(el('div', done ? 'ft-hy-area done' : 'ft-hy-area', `${done ? '✔' : '○'} ${a.points.map((i) => `#${i}`).join(' ')}: ${attrText(a.attribute)}`));
  }
  areas.appendChild(el('div', 'ft-line', `Hoàn thành hình: ${attrText(v.full)}`));
  body.appendChild(areas);
  body.appendChild(el('div', 'ft-line', `Tổng thuộc tính nhận được: ${heiyaoshiBuffText(d.Buff).join(', ') || '-'}`));
  body.appendChild(button('Đặt lại (thử nghiệm)', api.onReset, api.busy));
}
