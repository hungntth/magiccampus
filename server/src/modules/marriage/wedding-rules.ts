// Pure wedding hall rules (M14 phase E): the shape of a booking the services pass around, the scheduler decision (open / close /
// missed), hall admission, invitee picking, red envelope alternation, exact refunds and the ring plan. No I/O; the clock is injected.

import { WEDDING, WEDDING_TEXT, hallClosesAt, weddingTier, type WeddingTier } from '@mc/shared';

/** A booking row as the services read it (dates as epoch ms). */
export interface Booking {
  id: number;
  marriageId: number;
  maleId: number;
  femaleId: number;
  bookerId: number;
  line: number;
  startAt: number;
  /** 0 open hall, 1 invitation only. */
  flag: number;
  tier: number;
  costBind: number;
  costMoney: number;
  started: boolean;
  maleAgreed: boolean;
  femaleAgreed: boolean;
  finishedAt: number | null;
  invited: number[];
  redBags: number;
}

export const partnerIn = (b: Booking, cid: number): number => (cid === b.maleId ? b.femaleId : b.maleId);
export const isSpouseIn = (b: Booking, cid: number): boolean => cid === b.maleId || cid === b.femaleId;

export type SchedulerAction = 'open' | 'close' | 'missed' | null;

/** What the 10 s tick does with a booking: a hall past its close time ends (or, never opened, is refunded), a due one opens. */
export function schedulerAction(b: Booking, now: number): SchedulerAction {
  if (now >= hallClosesAt(b.startAt, b.finishedAt)) return b.started ? 'close' : 'missed';
  return !b.started && now >= b.startAt ? 'open' : null;
}

/** `enterWeddingHall` admission in the Go order; `holdsCard` = the character carries an invitation card (1691-1693). */
export function admission(b: Booking | null, cid: number, holdsCard: boolean): 'gone' | 'closed' | 'needInvite' | null {
  if (!b) return 'gone';
  if (!b.started) return 'closed';
  if (b.flag === 1 && !isSpouseIn(b, cid) && !b.invited.includes(cid) && !holdsCard) return 'needInvite';
  return null;
}

export const ADMISSION_TEXT: Record<'gone' | 'closed' | 'needInvite', string> = {
  gone: WEDDING_TEXT.gone,
  closed: WEDDING_TEXT.closed,
  needInvite: WEDDING_TEXT.needInvite,
};

export interface FriendRef {
  cid: number;
  name: string;
}

/** Up to ten online friends that are neither the couple nor already invited, in the list order. */
export function pickInvitees(friends: readonly FriendRef[], b: Booking, online: (cid: number) => boolean): FriendRef[] {
  const out: FriendRef[] = [];
  for (const f of friends) {
    if (out.length >= WEDDING.invitesPerCard) break;
    if (isSpouseIn(b, f.cid) || b.invited.includes(f.cid) || out.some((o) => o.cid === f.cid) || !online(f.cid)) continue;
    out.push(f);
  }
  return out;
}

/** Red envelopes go to the groom first, then the bride, alternating (`count` = envelopes already given). */
export const redBagRecipient = (b: Booking, count: number): number => (count % 2 === 0 ? b.maleId : b.femaleId);

/** The exact silver split paid at booking, returned to the booker on a cancel or a missed hall. */
export const refundOf = (b: Booking): { bind: number; money: number } => ({ bind: b.costBind, money: b.costMoney });

/** Pair name used by prompts: [groom, bride] ids of the vows still open. */
export function pendingVows(b: Booking): { male: boolean; female: boolean } {
  return { male: !b.maleAgreed, female: !b.femaleAgreed };
}

/** What a finished vow pair receives: ring template of the tier and whether the precious title comes with it. */
export function ringPlan(tier: number): { ring: number; title: boolean } | null {
  const t: WeddingTier | undefined = weddingTier(tier);
  return t ? { ring: t.ring, title: t.type === 3 } : null;
}

/** Sanitised line number (H5 has one line; the value is stored as sent when it is a small positive integer). */
export const normalizeLine = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 1;
};
