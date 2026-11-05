// Pure mail rules: addMail argument parsing / clipping / escaping, the COD and content predicates, expiry, system mail input
// validation and the texts of the automatic mails (return, COD payment). Legacy: Go application/mail/{send,take}.go and the
// mail_delete / mail_expire SQL functions. No I/O.

import { MAIL, MailAttachType, MailItemTable, SYSTEM_SENDER, clipText } from '@mc/shared';
import type { MailAttachmentData } from './mail.schema';

export const RETURN_TITLE = 'Thư bị trả lại';
export const COD_PAYMENT_TITLE = 'Thu phí thư';
export const DAY_MS = 86_400_000;

export const returnText = (subject: string, receiverName: string): string =>
  `Thư "${subject}" gửi cho ${receiverName} đã bị trả lại, vật phẩm và tiền được hoàn cho bạn.`;

export const codPaymentText = (takerName: string, subject: string): string =>
  `${takerName} đã nhận thư "${subject}" và trả phí cho bạn.`;

const AMOUNT_MAX = 1_000_000_000_000;

/** Non-negative safe integer amount, or null (undefined / missing counts as 0). */
function amount(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  return t >= 0 && t <= AMOUNT_MAX ? t : null;
}

export interface SendInput {
  receiverName: string;
  subject: string;
  text: string;
  money: number;
  gold: number;
  codMoney: number;
  codGold: number;
  attach: { type: 9 | 39; id: number } | null;
}

export type ParsedSend = { ok: true; input: SendInput } | { ok: false; reason: 'args' | 'amount' };

/** addMail(name, obj, delPassMD5): arg 2 (the password) is ignored in H5. Negative / non-numeric amounts are refused. */
export function parseAddMail(args: unknown[]): ParsedSend {
  const name = typeof args[0] === 'string' ? args[0].trim() : '';
  const obj = args[1];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return { ok: false, reason: 'args' };
  const o = obj as Record<string, unknown>;
  const money = amount(o.money);
  const gold = amount(o.gold);
  const codMoney = amount(o.codMoney);
  const codGold = amount(o.codGold);
  if (money === null || gold === null || codMoney === null || codGold === null) return { ok: false, reason: 'amount' };
  const type = Number(o.type);
  const id = Number(o.id);
  const attach = (type === MailAttachType.ITEM || type === MailAttachType.PET) && Number.isInteger(id) && id > 0
    ? { type: type as 9 | 39, id }
    : null;
  const cod = Number(o.codFlag) === 1;
  return {
    ok: true,
    input: {
      receiverName: name,
      subject: clipText(typeof o.subject === 'string' ? o.subject : '', MAIL.SUBJECT_MAX),
      text: clipText(typeof o.text === 'string' ? o.text : '', MAIL.TEXT_MAX),
      money, gold,
      // Go parseSendInput keeps the COD amounts only when codFlag == 1; send() then keeps them only for a loaded mail.
      codMoney: cod ? codMoney : 0,
      codGold: cod ? codGold : 0,
      attach,
    },
  };
}

/** COD survives only when the mail carries something (Go send.go: m.HasContent()). */
export function effectiveCod(input: SendInput): { codMoney: number; codGold: number } {
  const loaded = input.money > 0 || input.gold > 0 || input.attach !== null;
  return loaded ? { codMoney: input.codMoney, codGold: input.codGold } : { codMoney: 0, codGold: 0 };
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Player-written text is HTML-escaped (Flash renders mail text with htmlText); system text is raw HTML. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export interface MailStateFacts {
  readAt: Date | null;
  createdAt: Date;
  claimed: boolean;
  money: number;
  gold: number;
  attachment: MailAttachmentData | null;
  senderId: number;
  returned: boolean;
}

/** Unread mail lives 30 days from its creation, read mail 10 days from the read date. */
export function isExpired(m: Pick<MailStateFacts, 'readAt' | 'createdAt'>, now: number): boolean {
  return m.readAt === null
    ? m.createdAt.getTime() < now - MAIL.UNREAD_DAYS * DAY_MS
    : m.readAt.getTime() < now - MAIL.READ_DAYS * DAY_MS;
}

/** Something left to take: not claimed and money, gold or an attachment. */
export function hasContent(m: Pick<MailStateFacts, 'claimed' | 'money' | 'gold' | 'attachment'>): boolean {
  return !m.claimed && (m.money > 0 || m.gold > 0 || m.attachment !== null);
}

/** Deleting / expiring returns the goods to the sender: a player mail, never returned before, with content left (COD dropped). */
export function canReturn(m: MailStateFacts): boolean {
  return m.senderId > 0 && !m.returned && hasContent(m);
}

export interface SystemMailInput {
  receiverId: number;
  title: string;
  text: string;
  senderName?: string;
  money?: number;
  gold?: number;
  item?: { templateId: number; table: 29 | 19; count: number; bound: boolean; quality?: number };
  escrow?: { fromRef: string; itemId?: number; petId?: number };
  source?: string;
  /** Internal: marks a return mail (never returned twice). */
  returned?: boolean;
}

export interface SystemMailFields {
  receiverId: number;
  senderName: string;
  subject: string;
  text: string;
  money: number;
  gold: number;
  attachment: MailAttachmentData | null;
  source: string | undefined;
  returned: boolean;
}

/** Validates a sendSystemMail call (Go buildSystemMail); null when the input is unusable. */
export function buildSystemFields(input: SystemMailInput): SystemMailFields | null {
  if (!Number.isInteger(input.receiverId) || input.receiverId <= 0) return null;
  const money = amount(input.money);
  const gold = amount(input.gold);
  if (money === null || gold === null) return null;
  let attachment: MailAttachmentData | null = null;
  if (input.item) {
    const it = input.item;
    if (!Number.isInteger(it.templateId) || it.templateId <= 0 || !Number.isInteger(it.count) || it.count <= 0) return null;
    if (it.table !== MailItemTable.ITEM && it.table !== MailItemTable.EQUIP) return null;
    attachment = { kind: 'template', templateId: it.templateId, table: it.table, count: it.count, bound: it.bound, quality: it.quality ?? 0 };
  }
  if (input.escrow) {
    if (attachment) return null; // one attachment per mail
    const { itemId, petId } = input.escrow;
    if (itemId !== undefined && petId === undefined && Number.isInteger(itemId) && itemId > 0) attachment = { kind: 'item', itemId };
    else if (petId !== undefined && itemId === undefined && Number.isInteger(petId) && petId > 0) attachment = { kind: 'pet', petId };
    else return null;
  }
  return {
    receiverId: input.receiverId,
    senderName: clipText(input.senderName ?? '', MAIL.SENDER_MAX) || SYSTEM_SENDER,
    subject: clipText(input.title, MAIL.SUBJECT_MAX),
    text: input.text, // raw HTML, not clipped (Go keeps system content as is)
    money, gold, attachment,
    source: input.source,
    returned: input.returned === true,
  };
}

/** Ids of delMails: a JSON array or a Flash-style {"0": id, ...} map; non-positive / non-integer entries are dropped. */
export function parseIds(raw: unknown): number[] {
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'object' && raw !== null ? Object.entries(raw).filter(([k]) => k !== 'length').map(([, v]) => v) : [];
  return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}
