// M14 phase E: wedding hall wire extras and pure rules shared by server and client. RPCs: bookWeddingHall({line, hour, minute, flag}),
// cancelWeddingHall, enterWeddingHall(cid), changeRing, useWeddingBag(slotId), useRedBag(slotId); pushes: onInitBookList (rows),
// onWeddingTier (H5 extra: the tier picked at the NPC), onChangeRingMale / onChangeRingFemale (vow prompts), onSysEvent t 117-119.
// Pure: booking time roll (UTC+7 clock), the slot-gap check, the close time of a hall, the chat lines of the world events.

import { DAY_MS, VN_OFFSET_MS, startOfDayMs } from './dayKey.js';
import { WEDDING, weddingTier, type BookRow, type SysEventPush } from './marriage.js';

/** Items of the hall flow outside the tier table: the red envelope, the title of a precious wedding, the three invitations. */
export const WEDDING_ITEMS = {
  redBag: 1710,
  invites: [1691, 1692, 1693],
  guestBags: [1715, 1716, 1717],
  giftBags: [1687, 1688, 1689],
  /** Title of a Quý Giá (tier 3) wedding, granted when the rings are exchanged. */
  preciousTitle: 126,
  /** Cards inside each couple gift bag (Go assumption, candy boxes and the outfit are cut: celebration extras are non-goals). */
  giftBagCards: { 1687: 1, 1688: 2, 1689: 3 } as Readonly<Record<number, number>>,
} as const;

/** Hall maps (tier 2 Cao Cấp 63, tier 1 Thông Thường 64, tier 3 Quý Giá 65) and the exit fallback (Anh Vũ Cảnh). */
export const WEDDING_MAPS: readonly number[] = [63, 64, 65];
export const WEDDING_EXIT_FALLBACK_MAP = 34;
export const isHallMap = (mapId: number): boolean => WEDDING_MAPS.includes(mapId);

/** Booking row sent by `onInitBookList`. Flash reads the first seven keys; `type` and `open` are H5 extras. */
export interface WeddingBookRow extends BookRow {
  /** Hall tier 1..3. */
  type: number;
  /** The hall is open now (the "Vào lễ đường" button is offered). */
  open: boolean;
}

/** H5 push before the booking list opens from an NPC pick: the tier the next booking pays for. */
export interface WeddingTierPush {
  type: number;
  label: string;
  cost: number;
}

export const WEDDING_TEXT = {
  notMarried: 'Chỉ người đã kết hôn mới có thể đặt lễ đường.',
  badTime: 'Thời gian đặt trước không hợp lệ.',
  tooFar: 'Chỉ có thể đặt trước trong vòng 24 giờ.',
  duplicate: 'Bạn đã đặt trước lễ đường rồi.',
  gap: 'Khung giờ này ở kênh đã chọn đã có người đặt trước.',
  noTier: 'Hãy chọn loại lễ đường ở Cupid hoặc Nguyệt Lão',
  noMoney: 'Không đủ bạc.',
  noBooking: 'Bạn chưa đặt trước lễ đường.',
  started: 'Hôn lễ đã bắt đầu, không thể hủy.',
  gone: 'Hôn lễ này không tồn tại hoặc đã kết thúc.',
  closed: 'Lễ đường chưa mở cửa.',
  needInvite: 'Cần có thiệp mời mới có thể vào lễ đường này.',
  notStarted: 'Hôn lễ chưa bắt đầu.',
  alreadyRings: 'Hai người đã trao nhẫn rồi.',
  notSpouse: 'Bạn không phải cô dâu hoặc chú rể.',
  notCard: 'Vật phẩm này không phải thiệp mời.',
  notRedBag: 'Vật phẩm này không phải Lì Xì Kết Hôn.',
  noFriends: 'Không có bạn bè trực tuyến nào chưa được mời.',
  friendsFull: 'Hành trang của bạn bè đã đầy, không thể gửi thiệp mời.',
  bagFull: 'Hành trang đã đầy.',
  noItem: 'Không tìm thấy vật phẩm.',
  redBagOutside: 'Hãy mang Lì Xì đến lễ đường đang tổ chức hôn lễ để tặng cô dâu chú rể.',
  cancelled: 'Đã hủy đặt trước lễ đường, bạc đã được hoàn lại.',
  missed: 'Hôn lễ của bạn đã quá giờ mà không mở được, bạc đặt lễ đường đã được hoàn lại.',
  hallClosed: 'Hôn lễ đã kết thúc, bạn được đưa ra khỏi lễ đường.',
  inBattle: 'Đang chiến đấu',
  opened: 'Hôn lễ đã bắt đầu, hãy mở Túi Quà Cưới để nhận Thiệp Hồng mời bạn bè.',
  bookedLine: (name: string, h: number, m: number, line: number): string =>
    `${name} đã đặt trước lễ đường hôn lễ, lễ đường sẽ mở cửa sau ${h > 0 ? `${h} giờ ` : ''}${m} phút ở kênh ${line}`,
  openedLine: (a: string, b: string): string =>
    `Hôn lễ của ${a} và ${b} dưới sự chủ trì của Tộc Trưởng Bối Tư đã chính thức bắt đầu, chúng ta hãy cùng chúc cho đôi trẻ được mãi mãi hạnh phúc, bách niên giai lão!`,
  ringsLine: (female: string, male: string): string => `${female} và ${male} đã trao nhẫn cưới cho nhau, thề nguyện mãi mãi bên nhau!`,
  vowMale: (male: string, female: string): string =>
    `${male}, con có đồng ý tiếp nhận ${female} làm người vợ hợp pháp của mình, cùng sống chung với cô ấy, sẽ mãi mãi yêu thương, tôn trọng, an ủi, bảo vệ và chung thủy với cô ấy, cho đến khi cái chết chia lìa cả hai không?`,
  vowFemale: (female: string, male: string): string =>
    `${female}, con có đồng ý tiếp nhận ${male} làm người chồng hợp pháp của mình, cùng sống chung với anh ấy, sẽ mãi mãi yêu thương, tôn trọng, an ủi, bảo vệ và chung thủy với anh ấy, cho đến khi cái chết chia lìa cả hai không?`,
  vowYes: 'Con đồng ý',
  vowNo: 'Không đồng ý',
  priceNote: (label: string, cost: number): string => `${label}: ${cost.toLocaleString('vi-VN')} bạc`,
  invitedBy: (name: string): string => `${name} mời bạn đến dự hôn lễ, hãy nhấp đôi Thiệp Hồng để nhận quà và vào lễ đường khi hôn lễ bắt đầu.`,
  sentTo: (names: string[]): string => `Đã gửi thiệp mời đến: ${names.join(', ')}`,
  redBagGiven: (name: string): string => `${name} đã tặng Lì Xì Kết Hôn cho cô dâu chú rể.`,
  cardsOpened: (n: number): string => `Đã mở Túi Quà Cưới, nhận được ${n} Thiệp Hồng.`,
} as const;

/** The wire line of a world hall event (Flash WEDDING_BOOK_PANEL_U[14] / [22] / [12]); null for t outside 117-119. */
export function sysEventLine(d: SysEventPush): string | null {
  if (d.t === 117) return WEDDING_TEXT.openedLine(d.n1, d.n2);
  if (d.t === 118) return WEDDING_TEXT.bookedLine(d.n, d.h, d.m, d.l);
  if (d.t === 119) return WEDDING_TEXT.ringsLine(d.n1, d.n2);
  return null;
}

/** 0..23 : 0..59 integers. */
export function validBookingTime(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/**
 * Epoch ms of the booked start: today's hh:mm on the UTC+7 clock; a time more than a minute in the past rolls to tomorrow
 * (Go `date.Before(now - 1 min)`), so "now" itself still books today.
 */
export function nextBookingDate(now: number, hour: number, minute: number): number {
  const today = startOfDayMs(now) + hour * 3_600_000 + minute * 60_000;
  return today < now - 60_000 ? today + DAY_MS : today;
}

/** The booking is further ahead than the 24 h window. */
export const bookingTooFar = (startAt: number, now: number): boolean => startAt > now + WEDDING.maxAheadMs;

export interface BookingSlot {
  marriageId: number;
  startAt: number;
}

/** `duplicate` when the couple already has a booking, `gap` when another start lies closer than 30 min (the gap is global: one line). */
export function bookingConflict(existing: readonly BookingSlot[], marriageId: number, startAt: number): 'duplicate' | 'gap' | null {
  if (existing.some((b) => b.marriageId === marriageId)) return 'duplicate';
  return existing.some((b) => Math.abs(b.startAt - startAt) < WEDDING.slotGapMs) ? 'gap' : null;
}

/** When the hall closes: 60 min after the start, or 10 min after the ring exchange when that comes first. */
export function hallClosesAt(startAt: number, finishedAt: number | null): number {
  const base = startAt + WEDDING.openMs;
  return finishedAt === null ? base : Math.min(base, finishedAt + WEDDING.afterRingMs);
}

/** Hours and whole minutes until the start (never negative), as the t:118 event carries them. */
export function waitParts(startAt: number, now: number): { h: number; m: number } {
  const wait = Math.max(0, startAt - now);
  return { h: Math.floor(wait / 3_600_000), m: Math.floor((wait % 3_600_000) / 60_000) };
}

/** "HH:mm" of an epoch-ms timestamp on the UTC+7 server clock (the booking panel shows server time). */
export function clockText(ms: number): string {
  const d = new Date(ms + VN_OFFSET_MS);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Invitation template -> the guest bag a guest opens it into, or undefined. */
export function guestBagOf(inviteTid: number): number | undefined {
  const i = (WEDDING_ITEMS.invites as readonly number[]).indexOf(inviteTid);
  return i < 0 ? undefined : WEDDING_ITEMS.guestBags[i];
}

/** Ring template of the tier a hall was booked as. */
export const ringOfTier = (type: number): number | undefined => weddingTier(type)?.ring;
