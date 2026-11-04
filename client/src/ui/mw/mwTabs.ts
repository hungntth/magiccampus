// Thần khí window tabs 1-3: Thăng cấp (mWeaponUpgrade), Phân giải (magicWeaponResolve), Sửa chữa (magicWeaponRepair / AllRepair).
// Strings follow EquiptFuncPanel (U[158..165], S[90..92]); the numbers come from the H5 helper getMWPanel.

import { EQUIP_PROP_LABELS, MW, MW_STONE_TID, mwRepairStones, type MWPanelInfo } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { SlotType } from '@mc/shared';
import { el, fmt } from '../feature/dom';
import { act, picker } from './mwPicker';
import type { MwCtx } from './mwTypes';

export const isWorn = (i: { slotType: number }): boolean => i.slotType === SlotType.EQUIP;

/** "HP: 1618" style line of one main stat. */
export function statLine(prop: number, num: number): string {
  return `${EQUIP_PROP_LABELS[prop] ?? 'Thuộc tính'}: ${fmt(num)}`;
}

/** Name, level, colour and the two main lines of the selected weapon. */
export function summary(c: MWPanelInfo): HTMLElement {
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-title', `${c.name}${c.level > 0 ? `  +${c.level}` : ''}`));
  box.appendChild(el('div', 'ft-muted', `${c.main ? 'Thần khí chính' : 'Thần khí phụ'}${c.binded ? ' · đã khóa' : ' · chưa khóa'}${c.worn ? ' · đang mặc' : ''}`));
  if (c.main) {
    box.appendChild(el('div', 'ft-line', statLine(c.mainProp1, c.mainPropNum1)));
    box.appendChild(el('div', 'ft-line', statLine(c.mainProp2, c.mainPropNum2)));
  }
  return box;
}

const have = (n: number, need: number): string => `${fmt(n)}${n < need ? ' (thiếu)' : ''}`;

export function renderUpgrade(body: HTMLElement, c: MwCtx): void {
  body.appendChild(picker(c.items, c.selId, (id) => c.pick(id)));
  const s = c.sel;
  if (!s) {
    body.appendChild(el('div', 'ft-muted', 'Chỉ thần khí chính đã khóa mới có thể thăng cấp (cấp 16 trở lên cần nhân vật cấp 100).'));
    return;
  }
  body.appendChild(summary(s));
  const box = el('div', 'ft-box');
  if (!s.main) {
    box.appendChild(el('div', 'ft-muted', 'Thần khí phụ không thể thăng cấp.'));
  } else if (!s.next) {
    box.appendChild(el('div', 'ft-result', 'Đã thăng cấp cao nhất!'));
  } else {
    box.appendChild(el('div', 'ft-h', `Thăng lên cấp ${s.next.level} (tối đa ${MW.MAX_LEVEL})`));
    box.appendChild(el('div', 'ft-line', `Điểm thần tu cần: ${fmt(s.next.spirit)}  (có ${have(s.spirituality, s.next.spirit)})`));
    box.appendChild(el('div', 'ft-line', `Pha Lê Thần Giới: ${s.next.itemNum}  (có ${have(s.stones.crystal, s.next.itemNum)})`));
    box.appendChild(el('div', 'ft-line', `Tỉ lệ thành công: ${s.next.rate}%`));
    box.appendChild(el('div', 'ft-muted', `Thuộc tính cấp ${s.next.level}: ${statLine(s.mainProp1, s.next.propNum1)}, ${statLine(s.mainProp2, s.next.propNum2)}`));
    box.appendChild(el('div', 'ft-muted', 'Mỗi lần thử đều tiêu hao thần tu và Pha Lê, dù thành công hay thất bại.'));
  }
  const btns = el('div', 'ft-btns');
  if (s.main && !s.binded) btns.appendChild(act('Khóa thần khí', c.busy, true, () => c.act.bind()));
  else btns.appendChild(act('Thăng cấp', c.busy, s.main && !!s.next && s.binded, () => c.act.upgrade()));
  box.appendChild(btns);
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}

export function renderResolve(body: HTMLElement, c: MwCtx): void {
  body.appendChild(picker(c.items.filter((i) => !isWorn(i)), c.selId, (id) => c.pick(id), 'Chọn thần khí trong túi (đang mặc phải tháo ra trước)'));
  const s = c.sel;
  if (!s || s.worn) {
    body.appendChild(el('div', 'ft-muted', 'Phân giải thần khí chính: nhận lại 40% điểm thần tu đã dùng và 1 Thâm Lam Tinh. Thần khí phụ: 1 Thâm Lam Tinh.'));
    return;
  }
  body.appendChild(summary(s));
  const box = el('div', 'ft-box');
  box.appendChild(el('div', 'ft-line', s.main ? `Nhận lại 40% thần tu đã dùng cho ${s.level} cấp và 1 Thâm Lam Tinh.` : 'Nhận 1 Thâm Lam Tinh.'));
  box.appendChild(act('Phân giải', c.busy, true, () => askConfirm('Xác nhận phân giải trang bị này?', () => c.act.resolve())));
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}

export function renderRepair(body: HTMLElement, c: MwCtx): void {
  body.appendChild(picker(c.items, c.selId, (id) => c.pick(id)));
  const worn = c.items.filter(isWorn);
  const wornMissing = worn.map((i) => i.maxDurability - i.durability);
  const box = el('div', 'ft-box');
  const s = c.sel;
  if (s) {
    body.appendChild(summary(s));
    const missing = Math.max(0, s.maxDurability - s.durability);
    box.appendChild(el('div', 'ft-line', `Độ bền: ${s.durability}/${s.maxDurability}`));
    box.appendChild(el('div', 'ft-line', `Cần ${mwRepairStones([missing])} Thâm Lam Tinh  (có ${s.stones.repair})`));
    box.appendChild(act('Sửa', c.busy, missing > 0 && s.stones.repair >= mwRepairStones([missing]), () => c.act.repair(false)));
  } else {
    box.appendChild(el('div', 'ft-muted', 'Sửa chữa cần Thâm Lam Tinh, độ bền hồi phục tối đa (hết độ bền thì thần khí mất sức mạnh).'));
  }
  const allNeed = mwRepairStones(wornMissing);
  const stones = s?.stones.repair ?? 0;
  box.appendChild(el('div', 'ft-line', `Tất cả thần khí đang mặc: cần ${allNeed} Thâm Lam Tinh`));
  box.appendChild(act('Sửa tất cả (đang mặc)', c.busy, allNeed > 0 && (s ? stones >= allNeed : true), () => c.act.repair(true)));
  body.appendChild(box);
  if (c.note) body.appendChild(el('div', 'ft-result', c.note));
}

export const STONE_NAMES: Record<keyof typeof MW_STONE_TID, string> = {
  repair: 'Thâm Lam Tinh', skillReset: 'Thâm Hồng Tinh', trans: 'Hoán Thần Thạch', propReset: 'Tinh Hồn Thạch', crystal: 'Pha Lê Thần Giới',
};
