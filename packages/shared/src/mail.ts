// Thùng Thư (mail) contract: showMailP / addMail / takeMail / setReadDate / delMail / delMails / closeMail and the pushes
// initViewMailMngP(), onAddMail(MailView | MailError), onDelMail(id). Legacy: Go internal/domain/mail, handlers/mail/dto.go.

import type { BagItem } from './inventory.js';
import type { PetWrapper } from './pet.js';

export const MAIL = {
  BOX_MAX: 100,
  SUBJECT_MAX: 100,
  TEXT_MAX: 1000,
  UNREAD_DAYS: 30,
  READ_DAYS: 10,
  PAGE: 12,
  LOGIN_NOTICE: 5,
  LOGIN_DELAY_MS: 6000,
  SENDER_MAX: 50,
} as const;

/** addMail obj.type: client slot type of the attachment (9 bag item instance, 39 pet, -1 none). */
export const MailAttachType = { ITEM: 9, PET: 39, NONE: -1 } as const;
/** MailView.itemType: template table of the attachment display (29 item, 19 equipment, 12 creature, -1 none). */
export const MailItemTable = { ITEM: 29, EQUIP: 19, PET: 12, NONE: -1 } as const;
export const SYSTEM_SENDER = 'Hệ thống';

/** H5 display data of the attachment (the Flash client reads its static tables instead). */
export interface MailAttachmentView {
  kind: 'item' | 'pet' | 'template';
  name: string;
  iconCode: string;
  color: number;
  count: number;
  item?: BagItem; // escrowed bag item instance (tooltip)
  pet?: PetWrapper; // escrowed pet (tooltip)
}

export interface MailView {
  id: number;
  senderId: number | '0'; // "0" for system mail
  receiverId: number;
  sn: string; // sender name
  receiverName: string; // set on the sender's own echo of a sent mail, else ''
  subject: string;
  text: string; // player text is HTML-escaped, system text is raw HTML
  money: number;
  gold: number;
  codMoney: number;
  codGold: number;
  codFlag: 1 | -1;
  itemType: number; // MailItemTable, -1 none
  itemId: number; // template id (creature template for a pet), -1 none
  stackNum: number; // -1 none
  date: number; // ms
  readDate: number; // ms, -1 unread
  returned: boolean;
  attachment?: MailAttachmentView;
}

export interface MailError {
  id: -1;
  type: 'noSuchReceiver' | 'overMaxMail';
}

export interface ShowMailReply {
  mailList: Record<string, MailView>;
  currentTime: number;
}

export interface AddMailArg {
  subject: string;
  text: string;
  codFlag: 1 | -1;
  codMoney: number;
  codGold: number;
  money: number;
  gold: number;
  type?: number; // MailAttachType, absent when no slot is attached
  id?: number; // item instance id or pet id
  readDate?: -1;
}

export interface SetReadDateReply {
  id: number;
  newDate: number;
}

/** Verbatim refusal / client texts (Go handlers/mail/rpc.go, Language.as MAILMANAGERPANEL_S / MAILPANEL_S). */
export const MAIL_TEXT = {
  SELF: 'Không thể tự gửi thư cho mình!',
  MONEY: 'Lỗi số vàng điền vào!',
  BAG_FULL: 'Bạn không có đủ chỗ trống trong túi đồ!',
  PET_FULL: 'Bạn không có đủ chỗ trống trong túi pet!',
  COD_FUNDS: 'Bạn không có đủ tiền để trả thư này!',
  BAD_ATTACHMENT: 'Vật phẩm này không thể gửi qua thư!',
  PET_BOUND: 'Không thể gửi bưu kiện pet đã khóa!',
  PET_ACTIVE: 'Pet đang xuất chiến, đi theo hoặc được cưỡi, hãy cho pet nghỉ ngơi trước khi gửi!',
  PET_EQUIPPED: 'Pet đang mang trang bị, hãy tháo trang bị pet trước khi gửi!',
  TRADING: 'Đang giao dịch, không thể thao tác vật phẩm!',
  UNAVAILABLE: 'Thư không tồn tại hoặc đã được nhận!',
  BUSY: 'Hệ thống bận, vui lòng thử lại sau!',
  NEED_RECEIVER: 'Điền tên người nhận!',
  COD_NOT_CONFIRMED: 'Đây là thư thu phí, vui lòng đọc kỹ để tránh bị lừa.',
} as const;

/** Refusal for a sender below PLAYER_EXCHANGE_MIN_LEVEL (legacy Open Beta patch text). */
export const MAIL_LEVEL_TEXT = (level: number): string => `Cần đạt cấp ${level} để gửi thư.`;

/** Flash MailManagerPanel.setMailState: int(30 - days since sent) unread, int(10 - days since read) once read (never < 0 here). */
export function mailRemainingDays(m: Pick<MailView, 'date' | 'readDate'>, now: number): number {
  const day = 86_400_000;
  const left = m.readDate === -1 ? MAIL.UNREAD_DAYS - (now - m.date) / day : MAIL.READ_DAYS - (now - m.readDate) / day;
  return Math.max(0, Math.trunc(left));
}

/** Legacy Mail.HasContent: something to take (money, gold or an attachment). */
export function mailHasContent(m: Pick<MailView, 'money' | 'gold' | 'itemType'>): boolean {
  return m.money > 0 || m.gold > 0 || m.itemType > 0;
}

export function mailIsCod(m: Pick<MailView, 'codMoney' | 'codGold'>): boolean {
  return m.codMoney > 0 || m.codGold > 0;
}

export function mailIsSystem(m: Pick<MailView, 'senderId'>): boolean {
  return m.senderId === '0';
}

/** Trims and clips to `max` characters (code points), like Go clip(). */
export function clipText(text: string, max: number): string {
  const t = text.trim();
  const chars = [...t];
  return chars.length <= max ? t : chars.slice(0, max).join('');
}
