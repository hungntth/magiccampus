// "Thiết lập" tab: re-roll the four lines of a bound purple / orange wing (prefix) and the two locked percents of a bound blue+ wing (bind).
// Both are previews: the material and silver are paid at once and the new values wait for "Đồng ý" / "Hủy bỏ" (kept in memory by the server).

import {
  EQUIP_PROP_LABELS, WING_BIND_ITEM_NUM, WING_ITEM, WING_MONEY, WING_PREFIX_ITEM_NUM, type BagItem, type WingPropLines,
} from '@mc/shared';
import { button, el } from '../feature/dom';
import { materialOf, needLine, wingById, wingLabel, wingPicker } from './wingDom';
import type { WingUiHost } from './wingTypes';

const label = (prop: number): string => EQUIP_PROP_LABELS[prop] ?? `#${prop}`;

/** Current lines of a wing as shown by the tooltip (instance rolls only). */
function current(w: BagItem): WingPropLines | null {
  const l = w.lines;
  if (!l) return null;
  return {
    mainProp1: l.mainProp1 ?? 0, mainProp2: l.mainProp2 ?? 0, mainPropNum1: l.mainPropNum1 ?? 0, mainPropNum2: l.mainPropNum2 ?? 0, prop1: l.prop1 ?? 0,
    prop2: l.prop2 ?? 0, propNum1: l.propNum1 ?? 0, propNum2: l.propNum2 ?? 0, bindMainPropNum1: l.bindMainPropNum1 ?? 0, bindMainPropNum2: l.bindMainPropNum2 ?? 0,
  };
}

function lineRows(now: WingPropLines | null, next: WingPropLines): HTMLElement {
  const box = el('div', 'ft-props');
  const rows: [number, number, number | undefined][] = [
    [next.mainProp1, next.mainPropNum1, now?.mainPropNum1], [next.mainProp2, next.mainPropNum2, now?.mainPropNum2],
    [next.prop1, next.propNum1, now?.propNum1], [next.prop2, next.propNum2, now?.propNum2],
  ];
  for (const [prop, value, old] of rows) if (prop > 0) box.appendChild(el('div', 'ft-prop', `${label(prop)}: ${old ?? '?'} -> ${value}`));
  box.appendChild(el('div', 'ft-prop', `Thuộc tính khóa: ${now?.bindMainPropNum1 ?? '?'}% / ${now?.bindMainPropNum2 ?? '?'}% -> ${next.bindMainPropNum1}% / ${next.bindMainPropNum2}%`));
  return box;
}

function prefixBox(host: WingUiHost, w: BagItem): HTMLElement {
  const box = el('div', 'ft-box');
  const need = WING_PREFIX_ITEM_NUM[w.wing?.colour ?? 0];
  const mat = materialOf(host, WING_ITEM.PREFIX);
  box.appendChild(el('div', 'ft-h', 'Tái thiết lập thuộc tính'));
  const pre = host.state.prefix;
  if (pre && pre.wingId === w.id) {
    box.append(lineRows(current(w), pre.lines), el('div', 'ft-btns'));
    (box.lastChild as HTMLElement).append(button('Đồng ý', () => host.actions.decidePrefix(true)), button('Hủy bỏ', () => host.actions.decidePrefix(false)));
    return box;
  }
  if (need === undefined) {
    box.appendChild(el('div', 'ft-muted', 'Chỉ có cánh tím và cam mới có thể tái thiết lập thuộc tính.'));
    return box;
  }
  box.append(
    needLine('Lông Vũ Phượng Hoàng', mat.count, need),
    el('div', 'ft-line', `Phí: ${WING_MONEY.PREFIX} bạc (trả ngay khi xem trước)`),
    button('Tái thiết lập', () => host.actions.prefix(w.id, mat.id), !w.binded || mat.count < need),
  );
  if (!w.binded) box.appendChild(el('div', 'ft-muted', 'Cánh cần phải khóa.'));
  return box;
}

function bindBox(host: WingUiHost, w: BagItem): HTMLElement {
  const box = el('div', 'ft-box');
  const mat = materialOf(host, WING_ITEM.BIND);
  box.appendChild(el('div', 'ft-h', 'Đổi thuộc tính khóa'));
  const pre = host.state.bind;
  if (pre && pre.wingId === w.id) {
    box.append(
      el('div', 'ft-line', `Hiện tại: ${pre.cur[0]}% / ${pre.cur[1]}%`), el('div', 'ft-line', `Mới: ${pre.next[0]}% / ${pre.next[1]}%`), el('div', 'ft-btns'),
    );
    (box.lastChild as HTMLElement).append(button('Đồng ý', () => host.actions.decideBind(true)), button('Hủy bỏ', () => host.actions.decideBind(false)));
    return box;
  }
  if ((w.wing?.colour ?? 0) < 2) {
    box.appendChild(el('div', 'ft-muted', 'Cánh phải từ phẩm chất xanh lam trở lên.'));
    return box;
  }
  box.append(
    needLine('Mảnh Ghép Cánh', mat.count, WING_BIND_ITEM_NUM),
    el('div', 'ft-line', `Phí: ${WING_MONEY.BIND} bạc (trả ngay khi xem trước)`),
    button('Đổi thuộc tính khóa', () => host.actions.bind(w.id, mat.id), !w.binded || mat.count < WING_BIND_ITEM_NUM),
  );
  return box;
}

export function renderRefine(body: HTMLElement, host: WingUiHost): void {
  const split = el('div', 'ft-split wg-split');
  const detail = el('div', 'ft-detail');
  const w = wingById(host, host.state.sel);
  if (w) detail.append(el('div', 'ft-title', wingLabel(w)), prefixBox(host, w), bindBox(host, w));
  else detail.appendChild(el('div', 'ft-muted', 'Chọn một cánh bên trái.'));
  if (host.state.note) detail.appendChild(el('div', 'ft-result', host.state.note));
  split.append(wingPicker(host), detail);
  body.appendChild(split);
}
