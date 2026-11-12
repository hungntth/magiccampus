// Pure fairy rules (Go application/fairy/grow.go Raise / AddExp, skill.go ChangeState, skin.go): fruit feeding, satiety, guard / rest and
// skins. Plans never mutate their input; the service charges / consumes first, then writes the planned state (spend before credit).

import { FAIRY, FAIRY_FRUIT_EXP, FAIRY_LEVEL_EXP, FAIRY_RAISE_TYPES, FAIRY_SKIN_ITEM_TIDS, FAIRY_TEXT, type FairyFailCode, type FairyInfo } from '@mc/shared';
import type { FairySkinState, FairyState } from './fairy-state';

/** A bag stack offered to the feed / raise tabs. */
export interface BagStack {
  id: number;
  tid: number;
  /** Item template type. */
  type: number;
  stack: number;
}

/** Server level (thresholds met, exp 0 -> 0), the cap check of Go expToLv. */
export function levelOf(exp: number): number {
  let lv = 0;
  for (const t of FAIRY_LEVEL_EXP) {
    if (exp >= t) lv++;
    else break;
  }
  return Math.min(lv, FAIRY.MAX_LEVEL);
}

export interface FeedPlan {
  /** Units to take per bag stack, in order, and the exp each take gives. */
  takes: { id: number; n: number; exp: number }[];
}

/**
 * addFairyExp(id, stacks, qty): every listed fruit stack (3390/3391/3392) gives qty fruits, one daily feed each, until the feeds run out or the
 * fairy reaches level 20 (Go AddExp; the client sends one stack and qty 1). Non-fruit or short stacks are skipped.
 */
export function planFeed(f: FairyInfo, stacks: readonly BagStack[], qty: number): FeedPlan | { error: FairyFailCode } {
  if (levelOf(f.exp) >= FAIRY.MAX_LEVEL) return { error: 'max' };
  if (f.flag.en <= 0) return { error: 'out' };
  const n = Math.max(1, qty);
  const cap = FAIRY_LEVEL_EXP[FAIRY_LEVEL_EXP.length - 1];
  let exp = f.exp;
  let en = f.flag.en;
  const takes: FeedPlan['takes'] = [];
  for (const s of stacks) {
    if (en <= 0 || levelOf(exp) >= FAIRY.MAX_LEVEL) break;
    const per = FAIRY_FRUIT_EXP[s.tid];
    if (!per || s.stack < n || takes.some((t) => t.id === s.id)) continue;
    const gain = Math.min(per * n, cap - exp);
    takes.push({ id: s.id, n, exp: gain });
    exp += gain;
    en--;
  }
  return takes.length === 0 ? { error: 'item' } : { takes };
}

/** Applies the takes that were actually consumed: exp (capped) and one feed per take. */
export function applyFeed(f: FairyInfo, done: readonly { exp: number }[]): FairyInfo {
  const cap = FAIRY_LEVEL_EXP[FAIRY_LEVEL_EXP.length - 1];
  const exp = Math.min(cap, f.exp + done.reduce((a, t) => a + t.exp, 0));
  return { ...f, exp, flag: { ...f.flag, en: Math.max(0, f.flag.en - done.length) } };
}

/** fairyRaise(id, item, qty): a crafting material (types 601..605) adds 100 satiety per unit, capped at 10000. */
export function planRaise(f: FairyInfo, item: BagStack | undefined, qty: number): { doh: number; n: number } | { error: FairyFailCode } {
  if (f.doh >= FAIRY.DOH_MAX) return { error: 'full' };
  if (!item || !FAIRY_RAISE_TYPES.includes(item.type)) return { error: 'item' };
  const n = Math.max(1, qty);
  if (item.stack < n) return { error: 'num' };
  return { doh: Math.min(FAIRY.DOH_MAX, f.doh + FAIRY.RAISE_DOH * n), n };
}

export interface StatePlan {
  state: FairyState;
  /** Other fairies sent to rest by a new guard. */
  rested: number[];
  /** The fairy got bound by guarding for the first time. */
  bound: boolean;
  newState: number;
  /** The guarding fairy changed (look / stats must refresh). */
  guardChanged: boolean;
}

/** changeFairyState(id, s): 1 = guard (any other guard rests, binds on first guard), anything else = rest (Go ChangeState). */
export function planState(s: FairyState, id: number, wanted: number): StatePlan | null {
  const f = s.fairies.get(id);
  if (!f) return null;
  const newState = wanted === FAIRY.STATE.GUARD ? FAIRY.STATE.GUARD : FAIRY.STATE.REST;
  const fairies = new Map(s.fairies);
  const rested: number[] = [];
  let bound = false;
  if (newState === FAIRY.STATE.GUARD) {
    for (const o of s.fairies.values()) {
      if (o.id !== id && o.state === FAIRY.STATE.GUARD) {
        fairies.set(o.id, { ...o, state: FAIRY.STATE.REST });
        rested.push(o.id);
      }
    }
    bound = f.binded === 0;
  }
  fairies.set(id, { ...f, state: newState, binded: bound ? 1 : f.binded });
  return { state: { fairies }, rested: rested.sort((a, b) => a - b), bound, newState, guardChanged: f.state !== newState || rested.length > 0 };
}

/** A skin is usable when unlocked with gold or when the player owns a fairy of that template (FairySkinCanvas isHad). */
export const skinOwned = (skin: FairySkinState, roster: FairyState, tid: number): boolean =>
  skin.list.includes(tid) || [...roster.fairies.values()].some((f) => f.tid === tid);

/** setFairyRes(tid, type): 2 shows an owned skin, 1 (or anything else) hides it when active. Null = refused (not owned). */
export function planSetRes(skin: FairySkinState, roster: FairyState, tid: number, type: number): { skin: FairySkinState; type: number } | null {
  if (!skinOwned(skin, roster, tid)) return null;
  if (type === FAIRY.SKIN.SHOW) return { skin: { ...skin, actFairy: tid }, type };
  return { skin: { ...skin, actFairy: skin.actFairy === tid ? 0 : skin.actFairy }, type: FAIRY.SKIN.HIDE };
}

/** setFairyResList(tid): unlock for 550 gold; refusal text when the template is unknown, already owned or item-only (15 / 16). */
export function planUnlockSkin(skin: FairySkinState, roster: FairyState, tid: number, exists: boolean): { skin: FairySkinState; cost: number } | { error: string } {
  if (!exists) return { error: FAIRY_TEXT.WRONG_ITEM };
  if (skinOwned(skin, roster, tid)) return { error: FAIRY_TEXT.ALREADY_OWNED };
  if (FAIRY_SKIN_ITEM_TIDS.includes(tid)) return { error: FAIRY_TEXT.SKIN_NEED_ITEM };
  return { skin: { ...skin, list: [...skin.list, tid].sort((a, b) => a - b) }, cost: FAIRY.SKIN_COST };
}
