// Pure Chân Hồn Thần Thú state transitions (Go application/prs service.go / forms.go / swap.go). Every plan works on a copy and returns the new
// state or an error text (PRS_TEXT); the service validates, spends, then writes. H5 differences: the chip bag is kept merged (one stack per chip id)
// and compacted to positions 1..N (the Flash bag pages by entry count), activePRSShow only takes tab-0 forms, timed forms always count minutes,
// and swapPRSChip follows the client rule PRS_PANEL[15] (three different chips in the exchange slots -> one random chip; Go rerolled 1:1).

import { PRS, PRS_TEXT, prsFormActive, type GetPrsChipPush, type PrsChipBag, type PrsShowRow, type PrsTreeRow } from '@mc/shared';
import { cloneBag, panelOf, type PrsState } from './prs-state';

export type Plan<T> = ({ state: PrsState } & T) | { error: string };
export const isError = <T>(p: Plan<T>): p is { error: string } => 'error' in p;

const copy = (s: PrsState): PrsState => panelOf(s);

/** One stack per chip id, positions renumbered 1..N in their previous order. */
export function normalizeBag(bag: PrsChipBag): PrsChipBag {
  const order: number[] = [];
  const sums = new Map<number, number>();
  for (const key of Object.keys(bag).map(Number).sort((a, b) => a - b)) {
    const s = bag[String(key)]!;
    if (s.chipNum <= 0) continue;
    if (!sums.has(s.chipId)) order.push(s.chipId);
    sums.set(s.chipId, (sums.get(s.chipId) ?? 0) + s.chipNum);
  }
  return Object.fromEntries(order.map((chipId, i) => [String(i + 1), { chipId, chipNum: sums.get(chipId)! }]));
}

/** Adds chips to the (normalized) bag; false when a new stack would exceed CHIP_BAG_MAX. */
export function addChips(bag: PrsChipBag, chipId: number, n: number): boolean {
  const hit = Object.values(bag).find((s) => s.chipId === chipId);
  if (hit) {
    hit.chipNum += n;
    return true;
  }
  const size = Object.keys(bag).length;
  if (size >= PRS.CHIP_BAG_MAX) return false;
  bag[String(size + 1)] = { chipId, chipNum: n };
  return true;
}

/** Removes `n` chips of `chipId` over the stacks; false (bag untouched) when short. */
export function takeChips(bag: PrsChipBag, chipId: number, n: number): boolean {
  const have = Object.values(bag).reduce((t, s) => t + (s.chipId === chipId ? s.chipNum : 0), 0);
  if (have < n) return false;
  let left = n;
  for (const [k, s] of Object.entries(bag)) {
    if (s.chipId !== chipId || left <= 0) continue;
    const take = Math.min(s.chipNum, left);
    s.chipNum -= take;
    left -= take;
    if (s.chipNum <= 0) delete bag[k];
  }
  return true;
}

/** Drops expired timed forms (and un-equips one of them); `changed` tells the caller to write. */
export function pruneExpired(s: PrsState, nowMs: number): { state: PrsState; changed: boolean; unequipped: boolean } {
  const next = copy(s);
  let changed = false;
  for (const [id, exp] of Object.entries(next.actLimitObj)) {
    if (exp > nowMs) continue;
    delete next.actLimitObj[id];
    changed = true;
  }
  const unequipped = next.useSid > 0 && !prsFormActive(next, next.useSid, nowMs);
  if (unequipped) next.useSid = 0;
  const bag = normalizeBag(next.chipBag);
  if (JSON.stringify(bag) !== JSON.stringify(next.chipBag)) {
    next.chipBag = bag;
    changed = true;
  }
  return { state: next, changed: changed || unequipped, unequipped };
}

/** addSoulTreeLvl: the current node's cost moves tid to its next node; next 0 = max. */
export function planTreeUp(s: PrsState, treeOf: (id: number) => PrsTreeRow | undefined): Plan<{ cost: number }> {
  const cur = treeOf(s.tid);
  if (!cur || cur.next <= 0 || !treeOf(cur.next)) return { error: PRS_TEXT.MAX_TREE };
  const next = copy(s);
  next.tid = cur.next;
  return { state: next, cost: cur.cost };
}

const nextActIndex = (actArr: Record<string, number>): number => Object.keys(actArr).reduce((m, k) => Math.max(m, Number(k) + 1), 0);

/** activePRSShow (tab 0): consume needNum chips of needChipId from the chip bag, then actArr (or a timed entry when the row has a limit). */
export function planActivate(s: PrsState, show: PrsShowRow | undefined, nowMs: number): Plan<object> {
  if (!show || show.tab !== PRS.TAB_GODDESS) return { error: PRS_TEXT.BAD_SHOW };
  if (prsFormActive(s, show.id, nowMs)) return { error: PRS_TEXT.ALREADY };
  const next = copy(s);
  if (show.needNum > 0 && !takeChips(next.chipBag, show.needChipId, show.needNum)) return { error: PRS_TEXT.NO_CHIPS };
  next.chipBag = normalizeBag(next.chipBag);
  if (show.limitType > 0 && show.limitTime > 0) next.actLimitObj[String(show.id)] = nowMs + show.limitTime * 60_000;
  else next.actArr[String(nextActIndex(next.actArr))] = show.id;
  return { state: next };
}

/** activePRSShowSpe (tab 1): the caller removes the bag items; the form lasts limitTime minutes (PRSShowCvs arithmetic). */
export function planActivateSpe(s: PrsState, show: PrsShowRow | undefined, nowMs: number): Plan<{ itemId: number; count: number }> {
  if (!show || show.tab !== PRS.TAB_SPECIAL || show.needChipId <= 0) return { error: PRS_TEXT.BAD_SHOW };
  if (prsFormActive(s, show.id, nowMs)) return { error: PRS_TEXT.ALREADY };
  const next = copy(s);
  next.actLimitObj[String(show.id)] = nowMs + Math.max(0, show.limitTime) * 60_000;
  return { state: next, itemId: show.needChipId, count: Math.max(1, show.needNum) };
}

/** replacePRSShow: equip an activated form. */
export function planReplace(s: PrsState, showId: number, nowMs: number): Plan<object> {
  if (!prsFormActive(s, showId, nowMs)) return { error: PRS_TEXT.NOT_ACTIVE };
  const next = copy(s);
  next.useSid = showId;
  return { state: next };
}

export function planCancel(s: PrsState): Plan<object> {
  const next = copy(s);
  next.useSid = 0;
  return { state: next };
}

/** movePRSChip: direction 1 = chip bag slot `from` <-> exchange slot `to`, 2 = exchange slot `from` <-> chip bag slot `to` (whole stacks swap). */
export function planMove(s: PrsState, from: number, to: number, direction: number): Plan<object> {
  const toExc = direction === PRS.MOVE_TO_EXC;
  if (!toExc && direction !== PRS.MOVE_TO_BAG) return { error: PRS_TEXT.BAD_CHIP };
  const [bagPos, excPos] = toExc ? [from, to] : [to, from];
  if (!(bagPos >= 1 && bagPos <= PRS.CHIP_BAG_MAX && excPos >= 1 && excPos <= PRS.EXC_SLOTS)) return { error: PRS_TEXT.BAD_CHIP };
  const next = copy(s);
  const src = toExc ? next.chipBag : next.excBag;
  if (!src[String(from)]) return { error: PRS_TEXT.BAD_CHIP };
  const a = next.chipBag[String(bagPos)];
  const b = next.excBag[String(excPos)];
  if (b) next.chipBag[String(bagPos)] = b;
  else delete next.chipBag[String(bagPos)];
  if (a) next.excBag[String(excPos)] = a;
  else delete next.excBag[String(excPos)];
  next.chipBag = normalizeBag(next.chipBag);
  return { state: next };
}

/** exchangePRSChip: one chip for its costCrystal Kết Tinh Thần Dụ. */
export function planExchange(s: PrsState, chipId: number, costOf: (id: number) => number | undefined): Plan<{ cost: number }> {
  const cost = costOf(chipId);
  if (cost === undefined) return { error: PRS_TEXT.BAD_CHIP };
  const next = copy(s);
  if (!addChips(next.chipBag, chipId, 1)) return { error: PRS_TEXT.BAG_FULL };
  return { state: next, cost };
}

/** Adds drawn chip ids to the bag; the rewards are merged per id (one onGetPRSChip each). */
export function applyDraws(s: PrsState, ids: readonly number[]): Plan<{ rewards: GetPrsChipPush[] }> {
  const next = copy(s);
  next.chipBag = normalizeBag(next.chipBag);
  const rewards: GetPrsChipPush[] = [];
  for (const id of ids) {
    if (!addChips(next.chipBag, id, 1)) return { error: PRS_TEXT.BAG_FULL };
    const r = rewards.find((x) => x.id === id);
    if (r) r.num += 1;
    else rewards.push({ t: PRS.TBL_CHIP, id, num: 1 });
  }
  return { state: next, rewards };
}

/** How many swaps the exchange slots allow: three different chip ids in slots 1..3 -> min of their counts (0 = not ready). */
export function swapCapacity(exc: PrsChipBag): number {
  const slots = [1, 2, 3].map((p) => exc[String(p)]);
  if (slots.some((x) => !x || x.chipNum <= 0)) return 0;
  if (new Set(slots.map((x) => x!.chipId)).size !== PRS.EXC_SLOTS) return 0;
  return Math.min(...slots.map((x) => x!.chipNum));
}

/** swapPRSChip / swapPRSChipTimes: consume one of each exchange slot per swap (`times` swaps), the caller draws the new chips. */
export function planSwap(s: PrsState, times: number): Plan<{ times: number }> {
  const cap = swapCapacity(s.excBag);
  if (cap <= 0) return { error: PRS_TEXT.SWAP_NEED };
  const n = Math.min(cap, Math.max(1, times));
  const next = copy(s);
  const exc: PrsChipBag = cloneBag(next.excBag);
  for (const p of ['1', '2', '3']) {
    exc[p]!.chipNum -= n;
    if (exc[p]!.chipNum <= 0) delete exc[p];
  }
  next.excBag = exc;
  return { state: next, times: n };
}
