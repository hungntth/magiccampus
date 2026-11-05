// Pure Túi Tiện Dụng rules (no Mongo): capacity from the placed holders (expired ones count 0, only opened holder slots count,
// VIP right 5 bonus on the normal bag, Ma Tâm base 12), holder replacement, and the planners for put / move-between / sort /
// direct loot over rows keyed by 1-based posId. Legacy: Go application/item/tempbag_layout.go, tempbag_moves.go, tempbag_vip.go.

import { TEMP_BAG, TEMP_BAG_TEXT } from '@mc/shared';
import type { StoredHolder, StoredTempSection } from '../character/character.schema';

export interface HolderSection {
  opened: number;
  holders: Record<string, StoredHolder>;
}

/** Defaults on read: no holder slot opened, nothing placed. */
export function sectionOf(section: StoredTempSection | undefined): HolderSection {
  const opened = Math.min(Math.max(Math.floor(Number(section?.opened ?? 0)) || 0, 0), TEMP_BAG.HOLDERS);
  return { opened, holders: section?.holders ?? {} };
}

export const holderExpired = (h: Pick<StoredHolder, 'exp'>, now: number): boolean => h.exp > 0 && now >= h.exp;

/** Usable slots: holders in opened slots that have not expired, + Ma Tâm base or the VIP bonus (normal bag), capped at MAX_POS. */
export function capacityOf(mx: boolean, section: HolderSection, vipBonus: number, now: number): number {
  let total = mx ? TEMP_BAG.MX_BASE : Math.max(vipBonus, 0);
  for (const [key, h] of Object.entries(section.holders)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 1 || idx > section.opened || !(h.tid > 0) || holderExpired(h, now)) continue;
    total += Math.max(h.num, 0);
  }
  return Math.min(total, TEMP_BAG.MAX_POS);
}

/** A holder may be replaced by one with more slots, or the same count when the old one is timed (Go PlaceTempBagHolder). */
export function canReplaceHolder(old: Pick<StoredHolder, 'num' | 'exp'> | undefined, newNum: number): boolean {
  if (!old) return true;
  return !(newNum < old.num || (newNum === old.num && old.exp === 0));
}

/** Expiry ms of a holder template with `t` minutes (t <= 0 = forever = 0). */
export const holderExpiry = (t: number, now: number): number => (t > 0 ? now + t * 60_000 : 0);

export interface TempRow {
  id: number;
  pos: number;
  templateId: number;
  itemType: number;
  isBound: boolean;
  colorCode: number;
  stackCount: number;
  maxStack: number;
}

export interface StackKey {
  templateId: number;
  itemType: number;
  isBound: boolean;
  colorCode: number;
}

/** Same stack: same template / bound / colour, never equipment. */
export const sameStack = (a: StackKey, b: StackKey): boolean =>
  a.itemType === 1 && b.itemType === 1 && a.templateId === b.templateId && a.isBound === b.isBound && a.colorCode === b.colorCode;

export type PutPlan =
  | { kind: 'move'; pos: number }
  | { kind: 'merge'; destId: number; pos: number }
  | { kind: 'error'; note: string };

export interface Incoming extends StackKey {
  stackCount: number;
  maxStack: number;
}

/** addtItemFromBag / addmxFromBag: a whole bag stack goes to `pos` (empty slot, or merged into a matching stack that has room). */
export function planPut(rows: readonly TempRow[], cap: number, pos: number, src: Incoming): PutPlan {
  if (pos > cap) return { kind: 'error', note: TEMP_BAG_TEXT.FULL };
  const target = rows.find((r) => r.pos === pos);
  if (target) {
    if (sameStack(src, target) && src.stackCount + target.stackCount <= target.maxStack) return { kind: 'merge', destId: target.id, pos };
    return { kind: 'error', note: TEMP_BAG_TEXT.SLOT_TAKEN };
  }
  if (rows.length >= cap) return { kind: 'error', note: TEMP_BAG_TEXT.FULL };
  return { kind: 'move', pos };
}

export type BetweenPlan =
  | { kind: 'move'; id: number; from: number; to: number }
  | { kind: 'merge'; srcId: number; destId: number; from: number; to: number }
  | { kind: 'swap'; aId: number; bId: number; from: number; to: number }
  | { kind: 'missing' }
  | { kind: 'error'; note: string };

/** moveItemBtwTemp / movemxBtwTemp. */
export function planBetween(rows: readonly TempRow[], cap: number, from: number, to: number): BetweenPlan {
  const src = rows.find((r) => r.pos === from);
  if (!src) return { kind: 'missing' };
  const dst = rows.find((r) => r.pos === to);
  if (!dst) return to > cap ? { kind: 'error', note: TEMP_BAG_TEXT.FULL } : { kind: 'move', id: src.id, from, to };
  if (sameStack(src, dst) && src.stackCount + dst.stackCount <= dst.maxStack) {
    return { kind: 'merge', srcId: src.id, destId: dst.id, from, to };
  }
  return { kind: 'swap', aId: src.id, bId: dst.id, from, to };
}

export interface SortStep {
  id: number;
  from: number;
  to: number;
}

/** tempBagSort: ordered by template id (stable on the old posId), packed to posId 1..n (no merging, as in Go). */
export function planSortTemp(rows: readonly TempRow[]): SortStep[] {
  return [...rows].sort((a, b) => a.templateId - b.templateId || a.pos - b.pos).map((r, i) => ({ id: r.id, from: r.pos, to: i + 1 }));
}

export type DirectPlan = { kind: 'top'; id: number; pos: number } | { kind: 'new'; pos: number };

/** Loot routed straight into a temp bag: grow a matching stack that takes the whole count, else the first free posId within capacity. */
export function planDirect(rows: readonly TempRow[], cap: number, spec: Incoming): DirectPlan | null {
  const sorted = [...rows].sort((a, b) => a.pos - b.pos);
  for (const r of sorted) {
    if (r.pos <= cap && sameStack(spec, r) && r.stackCount + spec.stackCount <= r.maxStack) return { kind: 'top', id: r.id, pos: r.pos };
  }
  if (spec.stackCount > spec.maxStack || sorted.length >= cap) return null;
  const used = new Set(sorted.map((r) => r.pos));
  for (let pos = 1; pos <= cap; pos++) if (!used.has(pos)) return { kind: 'new', pos };
  return null;
}

/** Item templates the loot router may put in the normal bag: the client rule plus Bụi Vô Hạn / Ma Pháp (types 523 / 524). */
export const isRewardTemp = (tpl: { kind: number; type: number }): boolean =>
  tpl.kind === 6 || tpl.kind === 14 || tpl.type === 503 || tpl.type === 552 || tpl.type === 523 || tpl.type === 524;
