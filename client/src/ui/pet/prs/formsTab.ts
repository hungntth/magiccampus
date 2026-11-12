// "Thần Hóa" tab (PRSShowCvs x2): goddess forms (10 Mảnh Thần Dụ each) and special forms (event items, time-limited). Each card shows the
// form, its state (Chưa kích hoạt / Đã kích hoạt / Đang dùng), the cost or time left and the action button; the right column sums the forms' props.

import {
  PRS, PRS_SHOW_ROWS, PRS_TEXT, PRS_TREE_ROWS, prsChipCount, prsFormState, prsPanelValue, prsPropText, prsRawSums, prsTimeLeft,
  type PrsPanel, type PrsShowRow,
} from '@mc/shared';
import { iconUrl } from '../../../assets';
import { button, el } from '../../feature/dom';
import { propList } from './treeTab';
import { formIcon, formsOfTab, showOf, treeOf, type PrsUiHost } from './prsTypes';

function tooltip(show: PrsShowRow): string {
  const lines = [show.name];
  show.pt.forEach((t, i) => {
    if (t > 0 && show.pn[i]) lines.push(prsPropText(t, prsPanelValue(t, show.pn[i]!)));
  });
  return lines.join('\n');
}

function card(host: PrsUiHost, p: PrsPanel, show: PrsShowRow): HTMLElement {
  const now = host.now();
  const state = prsFormState(p, show.id, now);
  const box = el('div', `prs-form ${state}`);
  box.title = tooltip(show);
  const img = document.createElement('img');
  img.src = iconUrl(formIcon(show));
  img.alt = '';
  img.draggable = false;
  img.onerror = () => img.remove();
  const pic = el('div', 'prs-form-pic');
  pic.appendChild(img);
  box.append(pic, el('div', 'prs-form-name', show.name));
  let note: string;
  if (state === 'locked') {
    note = show.tab === PRS.TAB_GODDESS
      ? PRS_TEXT.CHIP_NEED(prsChipCount(p.chipBag, show.needChipId), show.needNum)
      : PRS_TEXT.ITEM_NEED(show.itemName ?? `Vật phẩm ${show.needChipId}`, host.itemCount(show.needChipId), show.needNum);
  } else {
    note = state === 'equipped' ? PRS_TEXT.IN_USE : PRS_TEXT.ACTIVE;
    const exp = p.actLimitObj[String(show.id)];
    if (exp !== undefined) {
      const t = prsTimeLeft(exp, now);
      note += ` · ${PRS_TEXT.LEFT(t.day, t.hour, t.min)}`;
    }
  }
  box.appendChild(el('div', `prs-form-state ${state}`, note));
  const busy = host.busy();
  if (state === 'locked') box.appendChild(button(PRS_TEXT.ACTIVATE, () => host.activate(show), busy));
  else if (state === 'active') box.appendChild(button(PRS_TEXT.EQUIP, () => host.equip(show.id), busy));
  else box.appendChild(button(PRS_TEXT.CANCEL, () => host.cancel(), busy));
  return box;
}

export function renderFormsTab(host: PrsUiHost, body: HTMLElement): void {
  const p = host.panel();
  if (!p) return;
  const sub = el('div', 'prs-subtabs');
  PRS_TEXT.FORM_TABS.forEach((label, i) => {
    const b = button(label, () => host.setFormTab(i));
    b.classList.toggle('on', host.formTab() === i);
    sub.appendChild(b);
  });
  const grid = el('div', 'prs-forms');
  for (const show of formsOfTab(host.formTab())) grid.appendChild(card(host, p, show));
  const left = el('div', 'prs-col wide');
  left.append(sub, grid);
  const right = el('div', 'prs-col');
  const sums = prsRawSums(p, PRS_TREE_ROWS, treeOf, showOf, host.now());
  const active = PRS_SHOW_ROWS.filter((s) => prsFormState(p, s.id, host.now()) !== 'locked').length;
  right.append(el('div', 'prs-title', `${PRS_TEXT.PROPS} (${active})`), propList(sums.forms), el('div', 'prs-help', PRS_TEXT.HELP_FORMS));
  const cols = el('div', 'prs-cols');
  cols.append(left, right);
  body.appendChild(cols);
}
