// Mail reading pane (legacy MailPanel): sender, subject, sanitized body, gift (Tặng), COD (Thu phí), the attachment with its tooltip,
// and the Nhận / Trả lời / Xóa buttons. Pure view: MailController owns the calls (take with the COD confirmation, delete confirms).

import { MAIL_TEXT, mailHasContent, mailIsCod, mailIsSystem, type MailView } from '@mc/shared';
import { iconUrl } from '../../assets';
import { fillItemCell, NAME_COLORS } from '../itemCell';
import { attachTip } from '../itemTip';
import { el, fmt, setSafeHtml } from './mailUtil';

export interface MailReadHost {
  playerLevel(): number;
  onTake(m: MailView): void;
  onReply(m: MailView): void;
  onDelete(m: MailView): void;
}

function attachmentCell(m: MailView, level: number): HTMLElement {
  const a = m.attachment;
  const cell = el('div', 'bag-cell');
  if (!a) {
    cell.classList.add('filled');
    cell.title = 'Có đính kèm';
    return cell;
  }
  if (a.item) {
    fillItemCell(cell, a.item, { level }, 'bag');
    cell.draggable = false;
    return cell;
  }
  cell.classList.add('filled');
  if (a.color > 0) cell.style.borderColor = NAME_COLORS[a.color] ?? '';
  if (a.iconCode && a.iconCode !== '0') {
    const img = el('img');
    img.src = iconUrl(a.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (a.count > 1) cell.appendChild(el('span', 'bag-count', String(a.count)));
  const pet = a.pet?.data;
  attachTip(cell, () => {
    const box = el('div', 'it-body');
    box.appendChild(el('div', 'it-name', pet ? `${a.name} (cấp ${pet.level})` : a.name));
    if (pet) box.appendChild(el('div', '', `Thọ mệnh: ${pet.life}`));
    return box;
  });
  return cell;
}

export function renderMailDetail(host: MailReadHost, m: MailView): HTMLElement {
  const root = el('div', 'mail-detail');
  root.appendChild(el('h4', '', m.subject || '(không có tiêu đề)'));
  root.appendChild(el('div', 'mail-from', `${MAIL_LABEL.sender}: ${m.sn}${m.returned ? ' (thư trả lại)' : ''}`));
  const body = el('div', 'mail-text');
  setSafeHtml(body, m.text);
  root.appendChild(body);

  const lines = el('div', 'mail-lines');
  if (m.money > 0 || m.gold > 0) {
    lines.appendChild(el('div', '', `${MAIL_LABEL.gift}: ${m.gold > 0 ? `${fmt(m.gold)} Vàng ` : ''}${m.money > 0 ? `${fmt(m.money)} Bạc` : ''}`.trim()));
  }
  if (mailIsCod(m)) {
    lines.appendChild(el('div', 'cod', `${MAIL_LABEL.cod}: ${m.codGold > 0 ? `${fmt(m.codGold)} Vàng ` : ''}${m.codMoney > 0 ? `${fmt(m.codMoney)} Bạc` : ''}`.trim()));
    lines.appendChild(el('div', 'cod', MAIL_TEXT.COD_NOT_CONFIRMED));
  }
  root.appendChild(lines);

  if (m.itemType > 0) {
    const row = el('div', 'mail-attach');
    row.appendChild(attachmentCell(m, host.playerLevel()));
    row.appendChild(el('span', '', m.attachment ? `${m.attachment.name}${m.attachment.count > 1 ? ` x${m.attachment.count}` : ''}` : 'Có đính kèm'));
    root.appendChild(row);
  }

  const actions = el('div', 'mail-actions');
  if (mailHasContent(m)) {
    const take = el('button', 'mail-btn', mailIsCod(m) ? MAIL_LABEL.codTake : MAIL_LABEL.take);
    take.onclick = () => host.onTake(m);
    actions.appendChild(take);
  }
  if (!mailIsSystem(m)) {
    const reply = el('button', 'mail-btn', 'Trả lời');
    reply.onclick = () => host.onReply(m);
    actions.appendChild(reply);
  }
  const del = el('button', 'mail-btn danger', 'Xóa');
  del.onclick = () => host.onDelete(m);
  actions.appendChild(del);
  root.appendChild(actions);
  return root;
}

/** Flash MAILMANAGERPANEL_S / MAILPANEL_S / MAIL_PANEL_U labels. */
export const MAIL_LABEL = {
  sender: 'Người gửi',
  gift: 'Tặng',
  cod: 'Thu phí',
  take: 'Nhận',
  codTake: 'Nhận thư',
} as const;
