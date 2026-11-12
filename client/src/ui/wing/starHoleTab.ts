// "Thăng tinh" tab (1..5 Lông Vũ Thăng Tinh per try, single try or automatic up to a target; a failure drops the star by the level rule) and
// "Đục lỗ" tab (new wings have all ten holes open: 5 for the character, 5 for the pet; the drill button only serves wings with fewer holes).

import { WING_HOLE_ITEM_NUM, WING_ITEM, WING_MONEY, WING_STAR_MAX, holeCounts, nextWingHole, starRate, wingStarAfterFail, type BagItem } from '@mc/shared';
import { button, el } from '../feature/dom';
import { holeGrid, materialOf, needLine, wingById, wingLabel, wingPicker } from './wingDom';
import type { WingUiHost } from './wingTypes';

function frame(host: WingUiHost, wing: BagItem | undefined, content: (w: BagItem) => HTMLElement[]): HTMLElement {
  const split = el('div', 'ft-split wg-split');
  const detail = el('div', 'ft-detail');
  if (wing) detail.append(el('div', 'ft-title', wingLabel(wing)), ...content(wing));
  else detail.appendChild(el('div', 'ft-muted', 'Chọn một cánh bên trái.'));
  if (host.state.note) detail.appendChild(el('div', 'ft-result', host.state.note));
  split.append(wingPicker(host), detail);
  return split;
}

function select(min: number, max: number, value: number, label: (n: number) => string, onChange: (n: number) => void): HTMLSelectElement {
  const s = el('select', 'ft-num');
  for (let n = min; n <= max; n++) {
    const o = el('option', '', label(n));
    o.value = String(n);
    s.appendChild(o);
  }
  s.value = String(value);
  s.onchange = () => onChange(Number(s.value));
  return s;
}

export function renderStar(body: HTMLElement, host: WingUiHost): void {
  const wing = wingById(host, host.state.sel);
  body.appendChild(frame(host, wing, (w) => {
    const star = w.star ?? 0;
    const st = host.state;
    const stone = materialOf(host, WING_ITEM.STAR);
    const rate = starRate(star, st.stoneCount);
    const box = el('div', 'ft-box');
    box.append(
      el('div', 'ft-line', `Sao hiện tại: ${star}/${WING_STAR_MAX}`),
      el('div', 'ft-muted', `Thất bại: về ${wingStarAfterFail(star)} sao`),
      needLine('Lông Vũ Thăng Tinh', stone.count, st.stoneCount),
    );
    const row = el('div', 'ft-btns');
    row.append(
      el('span', 'ft-line', 'Số Lông Vũ mỗi lần:'),
      select(1, 5, st.stoneCount, String, (n) => { st.stoneCount = n; host.render(); }),
      el('span', 'ft-line', `Tỉ lệ: ${rate}%`),
    );
    box.appendChild(row);
    const auto = el('div', 'ft-btns');
    const target = Math.min(WING_STAR_MAX, Math.max(star + 1, st.starTarget || star + 1));
    auto.append(
      button('Thăng tinh', () => host.actions.star(st.stoneCount, w.id, stone.id, 0), star >= WING_STAR_MAX || stone.count < st.stoneCount),
      el('span', 'ft-line', 'Tự động đến:'),
      select(Math.min(WING_STAR_MAX, star + 1), WING_STAR_MAX, target, (n) => `${n} sao`, (n) => { st.starTarget = n; host.render(); }),
      button('Tự động', () => host.actions.star(st.stoneCount, w.id, stone.id, target), star >= WING_STAR_MAX || stone.count < st.stoneCount),
    );
    box.appendChild(auto);
    return [box];
  }));
}

export function renderHole(body: HTMLElement, host: WingUiHost): void {
  const wing = wingById(host, host.state.sel);
  body.appendChild(frame(host, wing, (w) => {
    const { char, pet } = holeCounts(w.wing?.holes ?? []);
    const next = nextWingHole(w.wing?.holes ?? []);
    const mat = materialOf(host, WING_ITEM.HOLE);
    const box = el('div', 'ft-box');
    box.append(
      el('div', 'ft-line', `Lỗ nhân vật: ${char}/5  -  Lỗ pet: ${pet}/5`),
      holeGrid(w, () => undefined),
      el('div', 'ft-muted', 'Cánh mới có sẵn 10 lỗ mở (5 nhân vật, 5 pet).'),
    );
    if (next) {
      box.append(
        needLine('Lông Vũ Kim Cương', mat.count, next.cost),
        el('div', 'ft-line', `Phí: ${WING_MONEY.HOLE} bạc  (lỗ ${next.slot % 2 === 1 ? 'nhân vật' : 'pet'} tiếp theo cần ${WING_HOLE_ITEM_NUM[Math.floor((next.slot - 1) / 2)]} Lông Vũ Kim Cương)`),
        button('Đục lỗ', () => host.actions.hole(w.id, mat.id), !w.binded || mat.count < next.cost),
      );
      if (!w.binded) box.appendChild(el('div', 'ft-muted', 'Cánh cần phải khóa.'));
    }
    return [box];
  }));
}
