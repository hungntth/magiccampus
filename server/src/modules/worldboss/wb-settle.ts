// World boss ranking and settlement planning (Go application/worldboss ranking.go + settle.go), pure. Only damage > 0 is ranked, ties keep
// the lower character id first. Rank payloads: top 10 world, top 10 of the viewer's class, `myRank` = the viewer's 0-based index in the
// whole class list (-1 unranked). Settlement: class top 1-3 get that rank's bag, the killing blow the Nhất Kích bag, LUCKY_COUNT lucky
// winners drawn uniformly among damage dealers outside their class top 3 get the Quà May Mắn bag (`luckyNum` 1). Bags are template ids.

import type { WbAwardItem, WbClassRank, WbGlobalRank, WbRankEntry } from '@mc/shared';
import { WB } from './wb-config';

export interface WbRanked {
  cid: number;
  name: string;
  classId: number;
  damage: number;
}

export function sortedByDamage<T extends WbRanked>(list: Iterable<T>): T[] {
  return [...list].filter((p) => p.damage > 0).sort((a, b) => b.damage - a.damage || a.cid - b.cid);
}

export function rankEntries(list: readonly WbRanked[]): WbRankEntry[] {
  return list.slice(0, WB.RANK_LIST).map((p) => ({ name: p.name, score: p.damage }));
}

export function classList<T extends WbRanked>(sorted: readonly T[], classId: number): T[] {
  return sorted.filter((p) => p.classId === classId);
}

/** The two rank payloads of initWbView / onUpdateWbRank for one viewer (`viewer` undefined = nobody: empty class list). */
export function buildRank(sorted: readonly WbRanked[], viewer: Pick<WbRanked, 'cid' | 'classId' | 'damage'> | undefined): { rank1: WbGlobalRank; rank2: WbClassRank } {
  const cls = viewer ? classList(sorted, viewer.classId) : [];
  const myRank = viewer && viewer.damage > 0 ? cls.findIndex((p) => p.cid === viewer.cid) : -1;
  return { rank1: { globalRank: rankEntries(sorted) }, rank2: { classRank: rankEntries(cls), myRank } };
}

/** 1-based world / class positions (0 = unranked). */
export function settlementRanks(sorted: readonly WbRanked[], p: Pick<WbRanked, 'cid' | 'classId'>): { world: number; cls: number } {
  return { world: sorted.findIndex((x) => x.cid === p.cid) + 1, cls: classList(sorted, p.classId).findIndex((x) => x.cid === p.cid) + 1 };
}

export interface SettlePlan {
  cid: number;
  worldRank: number;
  classRank: number;
  awards: WbAwardItem[];
  luckyNum: number;
}

/** Picks `count` distinct lucky winners among `pool` (sorted by id, partial Fisher-Yates over the injected RNG). */
export function drawLucky(pool: readonly number[], count: number, rng: () => number): number[] {
  const ids = [...pool].sort((a, b) => a - b);
  const n = Math.min(count, ids.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

/** Ranks and gift bags of every damage dealer. `lastHitterId` 0 = timeout (no killing blow). */
export function planSettlement(sorted: readonly WbRanked[], lastHitterId: number, rng: () => number): Map<number, SettlePlan> {
  const plans = new Map<number, SettlePlan>();
  for (const p of sorted) {
    const { world, cls } = settlementRanks(sorted, p);
    const awards: WbAwardItem[] = [];
    if (cls >= 1 && cls <= WB.TOP_RANKS) awards.push({ itemId: WB.CLASS_RANK_BAGS[cls - 1], num: 1 });
    if (p.cid === lastHitterId) awards.push({ itemId: WB.LAST_HIT_BAG, num: 1 });
    plans.set(p.cid, { cid: p.cid, worldRank: world, classRank: cls, awards, luckyNum: 0 });
  }
  const pool = [...plans.values()].filter((p) => p.classRank > WB.TOP_RANKS).map((p) => p.cid);
  for (const cid of drawLucky(pool, WB.LUCKY_COUNT, rng)) {
    const plan = plans.get(cid)!;
    plan.luckyNum = 1;
    plan.awards.push({ itemId: WB.LUCKY_BAG, num: 1 });
  }
  return plans;
}

/** "-" for an unranked position (the result window inserts it raw). */
export const rankLabel = (rank: number): string | number => (rank <= 0 ? '-' : rank);
