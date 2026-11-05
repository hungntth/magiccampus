// One skill-window row (legacy SkillUseSlot): icon, name + level, the TipReqSkill tooltip lines and the Học / Nâng / Đầy cấp
// button. The row is an HTML5 drag source carrying {st: 52, sid} for the hotbar.

import { CLASS_RANK_NAMES, HotbarKind, type SkillLearnView } from '@mc/shared';
import { iconUrl } from '../assets';
import { el } from './actWindow';

export const HOTBAR_DRAG_MIME = 'application/x-mc-hotbar';

/** TIPREQSKILL_S lines for the next learn / upgrade step. */
export function reqTip(r: SkillLearnView): string {
  if (r.learned && r.nextSid === 0) return `${r.name}\n${r.description}\nĐã max cấp`;
  const lines = [r.name, r.description];
  if (r.bookName) lines.push(`Sách kỹ năng cần: ${r.bookName}`);
  lines.push(`Cấp độ nhân vật cần: ${r.reqLevel}`);
  if (r.expSkill > 0) lines.push(`Kinh nghiệm thăng cấp cần: ${r.expSkill}`);
  if (r.price > 0) lines.push(`Tiền thăng cấp cần: ${r.price}`);
  if (r.reqCl > 0) lines.push(`Cấp độ nghề cần: ${CLASS_RANK_NAMES[r.reqCl] ?? r.reqCl}`);
  return lines.filter((l) => l !== '').join('\n');
}

export function skillRow(r: SkillLearnView, enabled: boolean, onAct: () => void): HTMLElement {
  const row = el('skill-row');
  row.title = reqTip(r);
  const icon = document.createElement('img');
  icon.className = 'skill-icon';
  icon.src = iconUrl(r.iconCode);
  icon.alt = '';
  const name = el('skill-name', r.learned ? `${r.name}  Lv${r.level}` : r.name);
  const max = r.learned && r.nextSid === 0;
  const btn = el('act-btn skill-btn', max ? 'Đầy cấp' : r.learned ? 'Nâng' : 'Học', 'button') as HTMLButtonElement;
  btn.disabled = max || !enabled;
  btn.onclick = onAct;
  if (r.learned) {
    row.draggable = true;
    row.ondragstart = (e) => e.dataTransfer?.setData(HOTBAR_DRAG_MIME, JSON.stringify({ st: HotbarKind.SKILL, sid: r.sid }));
  }
  row.append(icon, name, btn);
  return row;
}
