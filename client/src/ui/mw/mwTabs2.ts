// Thần khí window tabs 4-7: Kỹ năng (magicWeaponResetSkill), Chuyển thuộc tính (MWTrans), Tái lập thuộc tính (queryMWResetPropMax /
// magicWeaponResetProp, single phase) and Tẩy luyện (showMWInfo lines + activateMWPro; the succinct roll itself is deferred).

import { EQUIP_PROP_LABELS, MW, type MWFlag } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el, fmt } from '../feature/dom';
import { act, picker } from './mwPicker';
import { isWorn, STONE_NAMES, statLine, summary } from './mwTabs';
import type { MwCtx } from './mwTypes';

export function renderSkill(body: HTMLElement, c: MwCtx): void {
  body.appendChild(picker(c.items.filter((i) => i.position === MW.MAIN_POSITION), c.selId, (id) => c.pick(id), 'Chọn thần khí chính'));
  const s = c.sel;
  if (!s || !s.main) {
    body.appendChild(el('div', 'ft-muted', 'Chỉ kỹ năng của thần khí chính mới có thể tái thiết lập (1 Thâm Hồng Tinh mỗi lần, nhận ngẫu nhiên 1 kỹ năng mới).'));
    return;
  }
  body.appendChild(summary(s));
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-h', 'Chọn kỹ năng thiết lập lại'));
  if (s.skills.length === 0) box.appendChild(el('div', 'ft-muted', 'Thần khí này chưa có kỹ năng.'));
  for (const k of s.skills) {
    const row = el('label', 'ft-check');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'mw-skill';
    radio.checked = k.pos === c.skillPos;
    radio.onchange = () => c.setSkillPos(k.pos);
    row.append(radio, document.createTextNode(`${k.pos}. ${k.name}`));
    row.title = k.description;
    box.appendChild(row);
  }
  box.appendChild(el('div', 'ft-line', `${STONE_NAMES.skillReset}: ${s.stones.skillReset}`));
  const chosen = s.skills.find((k) => k.pos === c.skillPos);
  box.appendChild(act('Tái thiết lập', c.busy, !!chosen && s.stones.skillReset >= 1, () => {
    askConfirm(`Xác nhận tái thiết lập kỹ năng thần khí: ${chosen?.name ?? ''}?`, () => c.act.resetSkill());
  }));
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}

export function renderTrans(body: HTMLElement, c: MwCtx): void {
  const mains = c.items.filter((i) => i.position === MW.MAIN_POSITION);
  body.appendChild(picker(mains.filter((i) => !isWorn(i)), c.selId, (id) => c.pick(id), 'Thần khí gốc (trong túi, sẽ mất)'));
  body.appendChild(picker(mains.filter((i) => i.id !== c.selId), c.secondId, (id) => c.pickSecond(id), 'Thần khí mục tiêu (nhận thuộc tính, sẽ bị khóa)'));
  const a = c.sel;
  const b = c.second;
  if (!a || !b) {
    body.appendChild(el('div', 'ft-muted', 'Chỉ chuyển giữa các thần khí chính, thần khí mục tiêu phải có điểm thuộc tính thấp hơn. Cần 1 Hoán Thần Thạch.'));
    return;
  }
  const cols = el('div', 'ft-cols');
  for (const [label, w] of [['Gốc', a], ['Mục tiêu', b]] as const) {
    const col = el('div', 'ft-col ft-box');
    col.append(el('div', 'ft-h', label), el('div', 'ft-line', w.name), el('div', 'ft-line', statLine(w.mainProp1, w.mainPropNum1)),
      el('div', 'ft-line', statLine(w.mainProp2, w.mainPropNum2)));
    cols.appendChild(col);
  }
  body.appendChild(cols);
  const box = el('div', 'ft-box');
  const ok = a.main && b.main && !a.worn && b.mainPropNum1 < a.mainPropNum1 && a.stones.trans >= 1;
  box.appendChild(el('div', 'ft-line', `${STONE_NAMES.trans}: ${a.stones.trans}`));
  box.appendChild(act('Chuyển thuộc tính', c.busy, ok, () => {
    askConfirm('Sau khi chuyển thuộc tính thì thần khí bên trái sẽ mất, thần khí bên phải sẽ khóa, xác nhận tiến hành chuyển thuộc tính thần khí?', () => c.act.trans());
  }));
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}

export function renderResetProp(body: HTMLElement, c: MwCtx): void {
  body.appendChild(picker(c.items.filter((i) => i.position === MW.MAIN_POSITION), c.selId, (id) => c.pick(id), 'Chọn thần khí chính'));
  const s = c.sel;
  if (!s || !s.main) {
    body.appendChild(el('div', 'ft-muted', `Thần khí chính khóa cấp ${MW.RESET_LEVEL} trở lên: ngẫu nhiên lại giới hạn HP và tốc độ (từ giá trị gốc tới gấp đôi), tốn ${MW.RESET_STONES} Tinh Hồn Thạch và cần ${fmt(MW.RESET_SPIRIT)} thần tu.`));
    return;
  }
  body.appendChild(summary(s));
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-line', `Điểm thuộc tính hiện tại: ${fmt(s.mainPropNum1)} / ${fmt(s.mainPropNum2)}`));
  const max = c.resetMax;
  box.appendChild(el('div', 'ft-line', `Giới hạn thuộc tính: ${fmt(s.tplPropNum1)} - ${max ? fmt(max.n1) : '?'} / ${fmt(s.tplPropNum2)} - ${max ? fmt(max.n2) : '?'}`));
  box.appendChild(el('div', 'ft-line', `Thần tu: ${fmt(s.spirituality)} (cần ${fmt(MW.RESET_SPIRIT)}, không bị trừ)`));
  box.appendChild(el('div', 'ft-line', `${STONE_NAMES.propReset}: ${s.stones.propReset} (cần ${MW.RESET_STONES})`));
  box.appendChild(el('div', 'ft-muted', 'Kết quả được áp dụng ngay, có thể thấp hơn giá trị hiện tại.'));
  const ok = s.binded && s.level >= MW.RESET_LEVEL && s.spirituality >= MW.RESET_SPIRIT && s.stones.propReset >= MW.RESET_STONES;
  box.appendChild(act('Tái lập thuộc tính', c.busy, ok, () => c.act.resetProp()));
  if (!s.binded) box.appendChild(el('div', 'ft-muted', 'Thần khí phải khóa (mở tab Thăng cấp để khóa).'));
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}

const lineOf = (flag: MWFlag, i: number): string => {
  const l = flag[`succ${i}` as keyof MWFlag];
  return l ? `${EQUIP_PROP_LABELS[l.propType] ?? `#${l.propType}`}: +${l.propVal}` : 'Chưa kích hoạt';
};

export function renderSuccinct(body: HTMLElement, c: MwCtx): void {
  body.appendChild(picker(c.items.filter((i) => i.position > MW.MAIN_POSITION), c.selId, (id) => c.pick(id), 'Chọn thần khí phụ'));
  const s = c.sel;
  if (!s || s.main) {
    body.appendChild(el('div', 'ft-muted', `Thần khí phụ cấp ${MW.ACTIVATE_LEVEL}: kích hoạt tuần tự 3 dòng thuộc tính ngẫu nhiên, mỗi dòng ${MW.ACTIVATE_GOLD} vàng. Tẩy luyện (đổi dòng) chưa được hỗ trợ.`));
    return;
  }
  body.appendChild(summary(s));
  const box = el('div', 'ft-box');
  const firstEmpty = [0, 1, 2].find((i) => !s.flag[`succ${i}` as keyof MWFlag]);
  for (let i = 0; i < 3; i++) {
    const row = el('div', 'ft-btns');
    row.appendChild(el('span', 'ft-line', `${i + 1}. ${lineOf(s.flag, i)}`));
    if (i === firstEmpty) {
      row.appendChild(act('Kích hoạt', c.busy, true, () => {
        askConfirm(`Cần ${MW.ACTIVATE_GOLD} vàng để kích hoạt chức năng này, xác nhận kích hoạt？`, () => c.act.activate(i));
      }));
    }
    box.appendChild(row);
  }
  box.appendChild(el('div', 'ft-muted', 'Các dòng này chỉ để hiển thị (giống máy chủ gốc, không cộng vào chỉ số). Tẩy luyện chưa được hỗ trợ.'));
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}
