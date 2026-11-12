// "Thăng cấp" tab (worn wing only): level / exp bar and the bonus of this and the next level, Linh Vũ advance (one item or until the next level)
// with the crit charm option, the charm shop, the look buttons (base, level 5, level 10) and the dye button for orange Thiên Sứ / Bích Không /
// Ác Ma wings. State = onShowNewWingPro; the server refuses looks / dyes whose art is not in the asset cache.

import { WING_ITEM, WING_LEVEL_MAX, WING_TEXT, type NewWingProState } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { bar, button, el } from '../feature/dom';

import type { WingUiHost } from './wingTypes';

function status(s: NewWingProState): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', `Cánh đang mặc - cấp ${s.level}/${WING_LEVEL_MAX}`));
  if (s.level < WING_LEVEL_MAX) box.appendChild(bar(s.curExp, s.nextExp, `${s.curExp}/${s.nextExp}`));
  else box.appendChild(el('div', 'ft-muted', WING_TEXT.MAX_LEVEL));
  box.append(
    el('div', 'ft-line', `Thuộc tính cộng thêm: +${s.curAdd.mainPropNum1}%${s.level < WING_LEVEL_MAX ? ` (cấp sau: +${s.nextAdd.mainPropNum1}%)` : ''}`),
    el('div', 'ft-muted', `Chỉ số gốc: ${s.basicPro.mainPropNum1} / ${s.basicPro.mainPropNum2} / ${s.basicPro.propNum1} / ${s.basicPro.propNum2}`),
  );
  return box;
}

function advanceBox(host: WingUiHost, s: NewWingProState): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-line', `Linh Vũ: ${s.num1}   Linh Phiến Bạo Kích Phù: ${s.num2}`));
  const check = el('label', 'ft-check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = host.state.useCrit;
  cb.onchange = () => {
    host.state.useCrit = cb.checked;
    host.render();
  };
  check.append(cb, document.createTextNode('Dùng Linh Phiến Bạo Kích Phù (x2 / x5 / x10)'));
  const off = s.eid === 0 || s.level >= WING_LEVEL_MAX || s.num1 <= 0;
  const row = el('div', 'ft-btns');
  row.append(
    button('Thăng cấp', () => host.actions.advance(host.state.useCrit, 1), off),
    button('Thăng nhanh', () => host.actions.advance(host.state.useCrit, 2), off),
    button('Mua Bạo Kích Phù', () => host.actions.buyCrit()),
  );
  box.append(check, row);
  return box;
}

function looks(host: WingUiHost, s: NewWingProState): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', 'Hình dạng và nhuộm màu'));
  const row = el('div', 'ft-btns');
  ['Dạng gốc', 'Dạng cấp 5', 'Dạng cấp 10'].forEach((name, i) => {
    const same = s.arr[i] === s.arr[0] && i > 0;
    const b = button(name, () => host.actions.setLook(i), s.eid === 0 || same);
    b.classList.toggle('on', s.arr[i] === s.curRescode);
    row.appendChild(b);
  });
  box.appendChild(row);
  box.appendChild(el('div', 'ft-muted', 'Chỉ cánh cam Ánh Sáng / Bích Không / Ác Ma / Thiên Sứ có dạng cấp 5 và 10.'));
  box.appendChild(button('Nhuộm cánh', () => askConfirm(WING_TEXT.DYE_CONFIRM(10), () => host.actions.dye()), s.eid === 0));
  return box;
}

export function renderAdvance(body: HTMLElement, host: WingUiHost): void {
  const s = host.state.advance;
  const col = el('div', 'ft-detail');
  if (!s || s.eid === 0) col.appendChild(el('div', 'ft-muted', s ? 'Hãy mặc cánh để thăng cấp.' : 'Đang tải...'));
  else col.append(status(s), advanceBox(host, s), looks(host, s));
  if (s && s.eid === 0) col.appendChild(advanceBox(host, s));
  col.appendChild(el('div', 'ft-muted', `Linh Vũ (${WING_ITEM.EXP}) cho 10 kinh nghiệm; ${WING_TEXT.ADVANCE_RULE}`));
  if (host.state.note) col.appendChild(el('div', 'ft-result', host.state.note));
  body.appendChild(col);
}
