// "Tinh Cung" tab (CharactorPanel star page): 12 zodiac stars, the selected star's effect and next level requirements, the level-up timer
// (the controller ticks `[data-star-end]` once a second) and the actions begin / cancel / speed up / raise the addition ("Tư chất Cung").

import {
  STAR, STAR_NAMES, STAR_PROP_LABELS, starAdditionCost, starAdditionRate, starCountdown, starSpeedItemId, type StarsPanel, type StarView,
} from '@mc/shared';
import { button, el, fmt } from './dom';

export interface StarTabApi {
  panel: StarsPanel | null;
  /** Server clock minus the client clock at the last load (finishDate is server time). */
  skew: number;
  selected: number;
  addQty: number;
  playerLevel: number;
  gold: number;
  busy: boolean;
  onSelect(type: number): void;
  onBegin(tid: number): void;
  onCancel(type: number): void;
  onSpeedUp(type: number): void;
  onAddQty(n: number): void;
  onAddition(type: number, qty: number): void;
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

export const starEffectText = (v: StarView, value: number): string => `+${num(value)} ${STAR_PROP_LABELS[v.addProp] ?? v.addProp}`;

export function renderStar(body: HTMLElement, api: StarTabApi): void {
  const p = api.panel;
  if (!p) {
    body.appendChild(el('div', 'ft-muted', 'Đang tải...'));
    return;
  }
  const clock = Date.now() + api.skew;
  body.appendChild(el('div', 'ft-line', `Cấp độ Tinh Cung: ${p.total}${api.playerLevel < STAR.MIN_PLAYER_LEVEL ? ` · cần nhân vật cấp ${STAR.MIN_PLAYER_LEVEL}` : ''}`));

  const grid = el('div', 'ft-star-grid');
  for (let t = 1; t <= STAR.TYPES; t++) {
    const s = p.stars[String(t)];
    const running = (s?.finishDate ?? 0) > 0;
    const b = el('button', `ft-star${t === api.selected ? ' sel' : ''}${running ? ' running' : ''}`);
    b.dataset.star = String(t);
    b.append(el('div', 'ft-star-name', STAR_NAMES[t - 1]), el('div', 'ft-star-lv', `Lv.${s?.level ?? 0}${running ? ' ⏳' : ''}`));
    b.onclick = () => api.onSelect(t);
    grid.appendChild(b);
  }
  body.appendChild(grid);

  const slot = p.stars[String(api.selected)];
  const view = p.view[String(api.selected)];
  if (!slot || !view) return;
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', `Cung ${STAR_NAMES[api.selected - 1]} Lv.${slot.level}`));
  box.appendChild(el('div', 'ft-line', `Hiệu quả hiện tại: ${slot.level > 0 ? starEffectText(view, view.value) : '-'}`));
  box.appendChild(el('div', 'ft-line', `Tư chất Cung: ${slot.addition.toFixed(2)} (nhân hiệu quả)`));
  if (view.description) box.appendChild(el('div', 'ft-muted', view.description));
  const running = slot.finishDate > 0;
  if (running) {
    const left = slot.finishDate - clock;
    const t = el('div', 'ft-result', left > 0 ? `Đang tu luyện: ${starCountdown(left)}` : 'Tu luyện xong, đang nhận thành quả...');
    t.dataset.starEnd = String(slot.finishDate);
    box.appendChild(t);
  }
  const n = view.next;
  if (n) {
    box.appendChild(el('div', 'ft-line', `Cấp ${n.level}: ${starEffectText(view, n.value)}`));
    box.appendChild(el('div', 'ft-muted', `Cần nhân vật cấp ${n.reqLevel} · tổng Cấp Tinh Cung ${n.reqStarLevel} · ${fmt(n.reqMoney)} vàng · ${starCountdown(n.reqSeconds * 1000)}`));
  } else {
    box.appendChild(el('div', 'ft-muted', 'Đã đạt cấp cao nhất'));
  }
  const row = el('div', 'ft-btns');
  const anyRunning = Object.values(p.stars).some((s) => s.finishDate > 0);
  row.append(
    button('Bắt đầu tu luyện', () => n && api.onBegin(n.tid), api.busy || !n || anyRunning || api.playerLevel < STAR.MIN_PLAYER_LEVEL || api.gold < (n?.reqMoney ?? 0)),
    button('Hủy tu luyện', () => api.onCancel(api.selected), api.busy || !running),
    button(`Tăng tốc (Tinh Toái #${starSpeedItemId(api.selected)})`, () => api.onSpeedUp(api.selected), api.busy || !running || slot.finishDate <= clock),
  );
  box.appendChild(row);

  const add = el('div', 'ft-btns');
  const input = el('input', 'ft-num');
  input.type = 'number';
  input.min = '1';
  input.max = String(STAR.MAX_ITEMS_PER_TRY);
  input.value = String(api.addQty);
  const info = el('span', 'ft-muted');
  const refresh = (): void => {
    const q = Math.max(1, Math.trunc(Number(input.value)) || 1);
    const rate = starAdditionRate(slot.addition, q);
    info.textContent = slot.addition >= STAR.ADDITION_MAX
      ? 'Tư chất tối đa'
      : `Tỉ lệ ${num(rate * 100)}% · ${fmt(starAdditionCost(api.selected, rate, slot.addition))} bạc`;
  };
  input.oninput = () => {
    api.onAddQty(Math.max(1, Math.trunc(Number(input.value)) || 1));
    refresh();
  };
  refresh();
  add.append(
    el('span', 'ft-line', 'Hoa Tinh Tú:'), input,
    button('Tăng tư chất', () => api.onAddition(api.selected, Math.max(1, Math.trunc(Number(input.value)) || 1)), api.busy || slot.addition >= STAR.ADDITION_MAX),
    info,
  );
  box.appendChild(add);
  body.appendChild(box);
}
