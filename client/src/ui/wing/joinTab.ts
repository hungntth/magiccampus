// "Dung hợp" tab: normal fusion (the selected wing + 4 unworn wings of its colour, auto-filled) and the senior fusion (4..10 / 16 unworn wings
// of the same template and colour). The success rate is quoted from the shared rules; the confirm dialog warns that the subs are consumed.

import { WING_COLOUR_MAX, WING_SENIOR_JOIN, WING_SENIOR_MIN, wingJoinRate, wingJoinTidsValid, wingSeniorRate, type BagItem } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { button, el } from '../feature/dom';
import { colourName, wgCell, wingById, wingLabel, wingPicker, wingsOf, worn } from './wingDom';
import type { WingUiHost } from './wingTypes';

/** Unworn wings of the main's colour that can be subs, same template first. */
function candidates(host: WingUiHost, main: BagItem): BagItem[] {
  return wingsOf(host)
    .filter((w) => w.id !== main.id && !worn(w) && w.wing?.colour === main.wing?.colour)
    .sort((a, b) => Number(b.tid === main.tid) - Number(a.tid === main.tid) || a.id - b.id);
}

function section(host: WingUiHost, main: BagItem): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', 'Dung hợp'));
  const colour = main.wing?.colour ?? 0;
  const subs = host.state.subs.map((id) => wingById(host, id)).filter((w): w is BagItem => w !== undefined && w.id !== main.id && !worn(w));
  const cells = el('div', 'wg-cells');
  cells.append(wgCell(main.iconCode, undefined, main));
  for (let i = 0; i < 4; i++) cells.appendChild(subs[i] ? wgCell(subs[i].iconCode, undefined, subs[i]) : wgCell('0'));
  box.appendChild(cells);
  const tids = subs.map((s) => s.tid);
  const rate = wingJoinRate(main.tid, colour, tids);
  box.appendChild(el('div', 'ft-line', `Tỉ lệ thành công: ${subs.length === 4 ? rate : '-'}%  (mỗi cánh khác loại -5%)`));
  const pick = button('Tự chọn 4 cánh', () => {
    host.state.subs = candidates(host, main).slice(0, 4).map((w) => w.id);
    host.render();
  });
  const go = button('Dung hợp', () => {
    askConfirm(`Dung hợp ${main.name.trim()} với 4 cánh đã chọn (tỉ lệ ${rate}%)? Cả 4 cánh sẽ bị tiêu hao.`, () => host.actions.join(main.id, subs.map((s) => s.id), false));
  }, subs.length !== 4 || colour >= WING_COLOUR_MAX || !wingJoinTidsValid(main.tid, tids));
  box.appendChild(el('div', 'ft-btns', '')).append(pick, go);
  if (colour >= WING_COLOUR_MAX) box.appendChild(el('div', 'ft-muted', 'Cánh cam không thể dung hợp thêm.'));
  return box;
}

function senior(host: WingUiHost, main: BagItem): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', 'Dung hợp cao cấp'));
  const colour = main.wing?.colour ?? 0;
  const limit = WING_SENIOR_JOIN[colour];
  if (!limit) {
    box.appendChild(el('div', 'ft-muted', 'Chỉ cánh xanh lam và tím mới dung hợp cao cấp.'));
    return box;
  }
  const same = candidates(host, main).filter((w) => w.tid === main.tid);
  const count = Math.min(limit.max, Math.max(WING_SENIOR_MIN, host.state.seniorCount));
  const num = el('input', 'ft-num');
  num.type = 'number';
  num.min = String(WING_SENIOR_MIN);
  num.max = String(limit.max);
  num.value = String(count);
  num.onchange = () => {
    host.state.seniorCount = Math.min(limit.max, Math.max(WING_SENIOR_MIN, Math.trunc(Number(num.value) || WING_SENIOR_MIN)));
    host.render();
  };
  const rate = wingSeniorRate(colour, count);
  box.appendChild(el('div', 'ft-line', `Cùng loại có thể dùng: ${same.length}. Số cánh dung hợp (${WING_SENIOR_MIN}-${limit.max}):`));
  const go = button('Dung hợp cao cấp', () => {
    askConfirm(`Dùng ${count} cánh ${main.name.trim()} ${colourName(main)} để dung hợp (tỉ lệ ${rate}%)? Các cánh sẽ bị tiêu hao.`,
      () => host.actions.join(main.id, same.slice(0, count).map((w) => w.id), true));
  }, same.length < count);
  box.append(num, el('div', 'ft-line', `Tỉ lệ thành công: ${rate}%`), go);
  return box;
}

export function renderJoin(body: HTMLElement, host: WingUiHost): void {
  const split = el('div', 'ft-split wg-split');
  const main = wingById(host, host.state.sel);
  const detail = el('div', 'ft-detail');
  if (main) detail.append(el('div', 'ft-title', wingLabel(main)), section(host, main), senior(host, main));
  else detail.appendChild(el('div', 'ft-muted', 'Chọn một cánh bên trái.'));
  if (host.state.note) detail.appendChild(el('div', 'ft-result', host.state.note));
  split.append(wingPicker(host), detail);
  body.appendChild(split);
}
