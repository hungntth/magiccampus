// "Lông vũ" tab: the ten hole cells of the wing (click an empty hole to inlay the selected bag feather, click a feather to remove it for the
// silver fee), the bag feather list, the upgrade (5 same feathers -> 1 of the next level, optional luck item 3021) and the mix (formula + its
// two inputs, filled from the bag, optional luck item 3017).

import {
  FEATHER_DEL_MONEY, FEATHER_MIX_LUCK_ADD, FEATHER_UPDATE_BATCH, FEATHER_UPDATE_LUCK_ADD, WING_ITEM, type BagItem,
} from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { button, el } from '../feature/dom';
import { holeGrid, isFeather, isFormula, materialOf, needLine, wgCell, wingById, wingLabel, wingPicker } from './wingDom';
import { featherText } from './wingTip';
import type { WingUiHost } from './wingTypes';

/** Bag feather stacks (one cell each, the selected one highlighted). */
function featherList(host: WingUiHost): HTMLElement {
  const box = el('div', 'wg-items');
  const feathers = host.items().filter((i) => isFeather(i) && i.slotType === 0);
  if (feathers.length === 0) box.appendChild(el('div', 'ft-muted', 'Túi không có Lông Vũ.'));
  for (const f of feathers) {
    const cell = wgCell(f.iconCode, f.stackNum, f);
    cell.classList.toggle('pick', host.state.feather === f.id);
    cell.dataset.item = String(f.id);
    cell.onclick = () => {
      host.state.feather = f.id;
      host.render();
    };
    box.appendChild(cell);
  }
  return box;
}

function holes(host: WingUiHost, w: BagItem): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', 'Lỗ khảm (hàng trên: nhân vật, hàng dưới: pet)'));
  box.appendChild(holeGrid(w, (slot, tid) => {
    const picked = host.items().find((i) => i.id === host.state.feather);
    if (tid === 0 && picked) host.actions.inlay(w.id, slot, picked.id);
    else if (tid > 0) {
      const info = w.wing?.feathers[String(tid)];
      const silver = FEATHER_DEL_MONEY[Math.min(FEATHER_DEL_MONEY.length - 1, info?.colour ?? 0)];
      host.actions.remove(w.id, slot, info?.name ?? `#${tid}`, silver);
    }
  }));
  const inlaid = Object.entries(w.wing?.feathers ?? {}).map(([, f]) => `${f.name}: ${featherText(f)}`);
  box.appendChild(el('div', 'ft-muted', host.state.feather ? 'Nhấp ô trống để khảm Lông Vũ đã chọn; nhấp Lông Vũ để bỏ.' : 'Chọn một Lông Vũ trong túi rồi nhấp ô trống.'));
  for (const line of inlaid) box.appendChild(el('div', 'ft-prop', line));
  return box;
}

function upgrade(host: WingUiHost): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', `Thăng cấp Lông Vũ (${FEATHER_UPDATE_BATCH} -> 1)`));
  const f = host.items().find((i) => i.id === host.state.feather);
  const luck = materialOf(host, WING_ITEM.FEATHER_LUCK);
  const useLuck = host.state.useLuck && luck.count > 0;
  if (!f) {
    box.appendChild(el('div', 'ft-muted', 'Chọn một Lông Vũ trong túi.'));
    return box;
  }
  box.append(
    el('div', 'ft-line', `${f.name} x${f.stackNum} - mỗi Lông Vũ Chúc Phúc +${FEATHER_UPDATE_LUCK_ADD}% tỉ lệ`),
    needLine('Lông Vũ cùng loại', f.stackNum, FEATHER_UPDATE_BATCH),
  );
  const check = el('label', 'ft-check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = host.state.useLuck;
  cb.onchange = () => {
    host.state.useLuck = cb.checked;
    host.render();
  };
  check.append(cb, document.createTextNode(`Dùng Lông Vũ Chúc Phúc (có ${luck.count})`));
  const row = el('div', 'ft-btns');
  const go = (once: boolean) => () => host.actions.upgrade(f.id, useLuck ? luck.id : -1, useLuck ? 1 : 0, once);
  row.append(button('Thăng cấp 1 lần', go(true), f.stackNum < FEATHER_UPDATE_BATCH), button('Thăng cấp tất cả', go(false), f.stackNum < FEATHER_UPDATE_BATCH));
  box.append(check, row);
  return box;
}

function mix(host: WingUiHost): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', 'Dung hợp Lông Vũ'));
  const formulas = host.items().filter((i) => isFormula(i) && i.slotType === 0);
  if (formulas.length === 0) {
    box.appendChild(el('div', 'ft-muted', 'Túi không có Công Thức Dung Hợp Lông Vũ.'));
    return box;
  }
  const row = el('div', 'wg-items');
  for (const f of formulas) {
    const cell = wgCell(f.iconCode, f.stackNum, f);
    cell.classList.toggle('pick', host.state.formula === f.id);
    cell.onclick = () => {
      host.state.formula = f.id;
      host.render();
    };
    row.appendChild(cell);
  }
  box.appendChild(row);
  const formula = formulas.find((f) => f.id === host.state.formula);
  if (!formula?.featherMix) return box;
  const inputs = formula.featherMix.inputs.map((inp) => ({ ...inp, ...materialOf(host, inp.tid) }));
  const luck = materialOf(host, WING_ITEM.FEATHER_MIX_LUCK);
  const useLuck = host.state.useLuck && luck.count > 0;
  for (const inp of inputs) box.appendChild(needLine(host.items().find((i) => i.tid === inp.tid)?.name ?? `Nguyên liệu #${inp.tid}`, inp.count, inp.num));
  const check = el('label', 'ft-check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = host.state.useLuck;
  cb.onchange = () => {
    host.state.useLuck = cb.checked;
    host.render();
  };
  check.append(cb, document.createTextNode(`Dùng Lông Vũ Chúc Phúc Cao Cấp (có ${luck.count}, +${FEATHER_MIX_LUCK_ADD}%/cái)`));
  const ready = inputs.length > 0 && inputs.every((i) => i.count >= i.num);
  box.append(check, button('Dung hợp lông vũ', () => host.actions.mix(formula.id, [inputs[0]?.id ?? 0, inputs[1]?.id ?? 0], useLuck ? luck.id : -1, useLuck ? 1 : 0), !ready));
  return box;
}

export function renderFeather(body: HTMLElement, host: WingUiHost): void {
  const split = el('div', 'ft-split wg-split');
  const detail = el('div', 'ft-detail');
  const wing = wingById(host, host.state.sel);
  if (wing) detail.append(el('div', 'ft-title', wingLabel(wing)), holes(host, wing));
  else detail.appendChild(el('div', 'ft-muted', 'Chọn một cánh bên trái để khảm / bỏ Lông Vũ.'));
  detail.append(featherList(host), upgrade(host), mix(host));
  if (host.state.note) detail.appendChild(el('div', 'ft-result', host.state.note));
  split.append(wingPicker(host), detail);
  body.appendChild(split);
}
