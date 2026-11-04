// Guild bank (M6 phase B): wire slot, sid mapping and the pure slot planners (deposit / move / spend) shared by the server and
// the client. Slot ids follow GamePredef SLOT_SID_GUILD_BANK = [500, 530, 560, 590, 620]: sid = 500 + slotIndex + 1, 30 per page.
// Pushes (Go-observed names, H5 payloads): onAddGuildSlot(slot) adds or replaces a slot, onDelGuildSlot(slotId) removes one.

export const GUILD_BANK = { PAGE_SIZE: 30, MAX_PAGES: 4, SID_BASE: 500, STACK_MAX: 99999 } as const;

export const guildSlotSid = (slotIndex: number): number => GUILD_BANK.SID_BASE + slotIndex + 1;
export const guildSlotIndex = (sid: number): number => sid - GUILD_BANK.SID_BASE - 1;
export const guildBankCapacity = (pages: number): number => Math.min(GUILD_BANK.MAX_PAGES, Math.max(1, pages)) * GUILD_BANK.PAGE_SIZE;

/** Wire row of `getInitGuildSlot` / `onAddGuildSlot` (`type`/`itemId` as the client's gsList; name and icon are H5 extras). */
export interface GuildSlot {
  id: number;
  sid: number;
  type: number;
  itemId: number;
  stackNum: number;
  tid: number;
  name: string;
  iconCode: string;
}

/** Persistent bank row as the planners see it. */
export interface BankSlotRow {
  id: number;
  slotIndex: number;
  tid: number;
  count: number;
}

export interface DepositPlan {
  tops: { id: number; add: number }[];
  news: { slotIndex: number; count: number }[];
}

/** Where `count` of `tid` goes: top up existing stacks (lowest slot first), then new stacks in the lowest free slots; null when full. */
export function planBankDeposit(
  slots: readonly BankSlotRow[], tid: number, count: number, pages: number, stackMax: number = GUILD_BANK.STACK_MAX,
): DepositPlan | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  const plan: DepositPlan = { tops: [], news: [] };
  let left = count;
  const same = slots.filter((s) => s.tid === tid && s.count < stackMax).sort((a, b) => a.slotIndex - b.slotIndex);
  for (const s of same) {
    if (left <= 0) break;
    const add = Math.min(left, stackMax - s.count);
    plan.tops.push({ id: s.id, add });
    left -= add;
  }
  const used = new Set(slots.map((s) => s.slotIndex));
  const cap = guildBankCapacity(pages);
  for (let i = 0; i < cap && left > 0; i++) {
    if (used.has(i)) continue;
    const n = Math.min(left, stackMax);
    plan.news.push({ slotIndex: i, count: n });
    left -= n;
  }
  return left > 0 ? null : plan;
}

export type BankMovePlan =
  | { kind: 'move'; id: number; toIndex: number }
  | { kind: 'merge'; fromId: number; toId: number; fromLeft: number; toCount: number }
  | { kind: 'swap'; aId: number; bId: number; aIndex: number; bIndex: number };

/** `moveGuildItem(fromSid, toSid)`: into an empty slot = move, same template = merge (cap `stackMax`), other template = swap. */
export function planBankMove(
  slots: readonly BankSlotRow[], fromSid: number, toSid: number, pages: number, stackMax: number = GUILD_BANK.STACK_MAX,
): BankMovePlan | string {
  const cap = guildBankCapacity(pages);
  const a = guildSlotIndex(fromSid);
  const b = guildSlotIndex(toSid);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= cap || b >= cap) return 'Ô kho không hợp lệ';
  if (a === b) return 'Ô kho không đổi';
  const from = slots.find((s) => s.slotIndex === a);
  if (!from) return 'Ô kho trống';
  const to = slots.find((s) => s.slotIndex === b);
  if (!to) return { kind: 'move', id: from.id, toIndex: b };
  if (to.tid !== from.tid) return { kind: 'swap', aId: from.id, bId: to.id, aIndex: a, bIndex: b };
  const moved = Math.min(from.count, stackMax - to.count);
  if (moved <= 0) return 'Ô kho đã đầy';
  return { kind: 'merge', fromId: from.id, toId: to.id, fromLeft: from.count - moved, toCount: to.count + moved };
}

/** A resource need keyed by guild material template (2026 / 2027 / 2039). */
export interface BankNeed {
  tid: number;
  count: number;
}

/** Takes the needs from stacks (lowest slot first); null when any template falls short. Zero needs are ignored. */
export function planBankSpend(slots: readonly BankSlotRow[], needs: readonly BankNeed[]): { id: number; take: number }[] | null {
  const takes: { id: number; take: number }[] = [];
  for (const need of needs) {
    let left = need.count;
    if (left <= 0) continue;
    for (const s of slots.filter((x) => x.tid === need.tid).sort((x, y) => x.slotIndex - y.slotIndex)) {
      if (left <= 0) break;
      const take = Math.min(left, s.count);
      if (take > 0) takes.push({ id: s.id, take });
      left -= take;
    }
    if (left > 0) return null;
  }
  return takes;
}

/** Units of `tid` over all stacks. */
export function bankCount(slots: readonly BankSlotRow[], tid: number): number {
  return slots.reduce((n, s) => (s.tid === tid ? n + s.count : n), 0);
}
