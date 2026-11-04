// "Giác Ngộ" tab (AwakenPanel): level, next-level cost / rate (+ pity), auto-buy option, the cumulative stat overview and the talent
// points (class talents only). The gacha reply (needGold / success / miss) is handled by the controller.

import { AWAKEN, propLineText, type AwakenInfo, type AwakenSkillView } from '@mc/shared';
import { button, el, fmt, propLines } from './dom';

export interface AwakenTabApi {
  info: AwakenInfo | null;
  classId: number;
  silver: number;
  autoBuy: boolean;
  busy: boolean;
  lastResult: string;
  onAutoBuy(on: boolean): void;
  onAwaken(): void;
  onPoint(skillId: number, add: boolean): void;
}

export function renderAwaken(body: HTMLElement, api: AwakenTabApi): void {
  const i = api.info;
  if (!i) {
    body.appendChild(el('div', 'ft-muted', 'Đang tải...'));
    return;
  }
  body.appendChild(el('div', 'ft-title', `Cấp giác ngộ ${i.awakenLevel} / ${AWAKEN.EDGE}`));
  const n = i.next;
  if (n) {
    const box = el('div', 'ft-box');
    box.append(
      el('div', 'ft-h', `Cấp kế: ${n.name}`),
      el('div', 'ft-line', `Cần đạt cấp ${n.reqLevel} · Hỗn Độn Ma Tinh ${fmt(i.itemHave)}/${fmt(n.itemNum)} · Bạc ${fmt(n.money)} (có ${fmt(api.silver)})`),
      el('div', 'ft-line', `Tỉ lệ thành công: ${n.rate}%${i.awakenAdd > 0 ? ` (+${i.awakenAdd}%)` : ''} · nhận ${n.points} điểm`),
      propLines(n.props),
    );
    const auto = el('label', 'ft-check');
    const cb = el('input', '');
    cb.type = 'checkbox';
    cb.checked = api.autoBuy;
    cb.onchange = () => api.onAutoBuy(cb.checked);
    auto.append(cb, document.createTextNode(' Hỗn Độn Ma Tinh không đủ sẽ tự mua'));
    box.append(auto, button('Giác ngộ', api.onAwaken, api.busy));
    if (api.lastResult) box.appendChild(el('div', 'ft-result', api.lastResult));
    body.appendChild(box);
  } else {
    body.appendChild(el('div', 'ft-line', '7 giác quan đều đã giác ngộ'));
  }
  body.append(el('div', 'ft-h', 'Tổng quan thuộc tính'), propLines(i.total, propLineText));
  body.appendChild(el('div', 'ft-h', `Điểm chưa phân phối: ${i.awakenPoint} · đã phân phối: ${i.awakenPointUsed}`));
  const skills = i.skills.filter((s) => s.reqClass === 0 || s.reqClass === api.classId);
  const list = el('div', 'ft-skills');
  for (const s of skills) list.appendChild(skillRow(s, i, api));
  body.appendChild(list);
}

function skillRow(s: AwakenSkillView, i: AwakenInfo, api: AwakenTabApi): HTMLElement {
  const lv = i.awakenPointDict[s.code] ?? 0;
  const row = el('div', 'ft-skill');
  row.title = `${s.desc.replace(/\\n/g, ' ').replace(/<[^>]+>/g, '')}\nCần ${s.cost} điểm / cấp; cần ${s.req} điểm đã phân phối`;
  row.append(
    el('span', 'ft-skill-name', s.name),
    el('span', 'ft-skill-lv', `${lv}/${s.max}`),
    button('-', () => api.onPoint(s.id, false), api.busy || lv <= 0),
    button('+', () => api.onPoint(s.id, true), api.busy || lv >= s.max || i.awakenPoint < s.cost || i.awakenPointUsed < s.req),
  );
  return row;
}
