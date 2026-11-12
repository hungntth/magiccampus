// Pure marriage rules (M14 D): proposal / seek / NPC pair gates, couple ordering, board and rank sorting + paging, the in-memory
// NPC proposal book (60 s, one per target) and the hall tier picks of phase E (30 min). No I/O; clocks are injected.

import {
  MARRIAGE, MARRIAGE_TEXT, RelationType, dailyRequestCheck, type CharMarriageRow, type CoupleRankRow, type MarriageSekRow,
} from '@mc/shared';

export interface Person {
  id: number;
  name: string;
  level: number;
  /** 0 male, 1 female. */
  gender: number;
}

export type RequestRefusal = 'level' | 'gender' | 'married' | 'targetMarried' | 'oncePerTarget' | 'dailyCap';

const REFUSAL_TEXT: Record<RequestRefusal, string> = {
  level: MARRIAGE_TEXT.requestLevel,
  gender: MARRIAGE_TEXT.sameGender,
  married: MARRIAGE_TEXT.married,
  targetMarried: MARRIAGE_TEXT.targetMarried,
  oncePerTarget: MARRIAGE_TEXT.oncePerTarget,
  dailyCap: MARRIAGE_TEXT.dailyCap,
};

export const requestRefusalText = (r: RequestRefusal): string => REFUSAL_TEXT[r];

/** `marriageSeeking` gate (Go UpdateSeeking): level 30, not married. */
export function checkSeek(level: number, married: boolean): 'level' | 'married' | null {
  if (level < MARRIAGE.minLevel) return 'level';
  return married ? 'married' : null;
}

/** `marriageRequest` gate in the Go order: proposer level, gender, proposer married, target married, then the day limits. */
export function checkRequest(a: {
  from: Person; to: Person; fromMarried: boolean; toMarried: boolean;
  sent: readonly { toId: number; addDate: number }[]; now: number;
}): RequestRefusal | null {
  if (a.from.level < MARRIAGE.minLevel) return 'level';
  if (a.from.gender === a.to.gender) return 'gender';
  if (a.fromMarried) return 'married';
  if (a.toMarried) return 'targetMarried';
  return dailyRequestCheck(a.sent, a.to.id, a.now);
}

export type NpcRefusal = 'level' | 'gender' | 'married' | 'targetMarried';

/** NPC marriage gate (Go npcMarriagePair): both Lv >= 30, opposite gender, neither married. */
export function checkNpcPair(from: Person, to: Person, fromMarried: boolean, toMarried: boolean): NpcRefusal | null {
  if (from.level < MARRIAGE.minLevel || to.level < MARRIAGE.minLevel) return 'level';
  if (from.gender === to.gender) return 'gender';
  if (fromMarried) return 'married';
  return toMarried ? 'targetMarried' : null;
}

export const NPC_REFUSAL_TEXT: Record<NpcRefusal, string> = {
  level: MARRIAGE_TEXT.npcBothLevel,
  gender: MARRIAGE_TEXT.npcSameGender,
  married: MARRIAGE_TEXT.married,
  targetMarried: MARRIAGE_TEXT.targetMarried,
};

/** Male = gender 0 (Go orderCouple); two partners of one gender (not reachable through the gates) keep the given order. */
export function orderCouple<T extends { gender: number }>(a: T, b: T): { male: T; female: T } {
  return a.gender !== 0 && b.gender === 0 ? { male: b, female: a } : { male: a, female: b };
}

/** Seek board order: flag desc, newest first. */
export function sortSeek(rows: MarriageSekRow[]): MarriageSekRow[] {
  return [...rows].sort((a, b) => b.flag - a.flag || b.addDate - a.addDate);
}

/** Own list order (Go): everything by addDate desc (the ad is not forced first). */
export function sortCharList(rows: CharMarriageRow[]): CharMarriageRow[] {
  return [...rows].sort((a, b) => b.addDate - a.addDate);
}

export interface RankInput {
  maleName: string;
  femaleName: string;
  type: number;
  intimacy: number;
  marriedAt: number;
  time: string;
}

/** Intimacy desc, then married earlier first. */
export function sortRank(rows: readonly RankInput[]): RankInput[] {
  return [...rows].sort((a, b) => b.intimacy - a.intimacy || a.marriedAt - b.marriedAt);
}

/** One page of the sorted rank (`page` 0-based, 48 per page); `num` is the total. */
export function pageRank(sorted: readonly RankInput[], page: number): { data: CoupleRankRow[]; num: number; start: number } {
  const start = Math.max(0, Math.trunc(page)) * MARRIAGE.rankPage;
  const data = sorted.slice(start, start + MARRIAGE.rankPage).map((r) => ({
    maleName: r.maleName, femaleName: r.femaleName, type: r.type, luxtime: r.intimacy, time: r.time,
  }));
  return { data, num: sorted.length, start };
}

/** Trimmed seek / proposal text without control characters, at most `MARRIAGE.contentMax` characters. */
export function normalizeContent(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MARRIAGE.contentMax);
}

export interface Proposal {
  fromId: number;
  fromName: string;
  toId: number;
  toName: string;
  expiresAt: number;
}

/** NPC marriage proposals in memory: one pending per target, 60 s. */
export class ProposalBook {
  private readonly byTarget = new Map<number, Proposal>();

  set(p: Omit<Proposal, 'expiresAt'>, now: number): Proposal {
    const full = { ...p, expiresAt: now + MARRIAGE.npcProposalMs };
    this.byTarget.set(p.toId, full);
    return full;
  }

  /** Consumes the target's proposal; null when none or expired. */
  take(toId: number, now: number): Proposal | null {
    const p = this.byTarget.get(toId);
    this.byTarget.delete(toId);
    return p && now <= p.expiresAt ? p : null;
  }

  peek(toId: number): Proposal | undefined {
    return this.byTarget.get(toId);
  }

  /** Drops every proposal sent by or addressed to the character. */
  forget(characterId: number): void {
    this.byTarget.delete(characterId);
    for (const [to, p] of this.byTarget) if (p.fromId === characterId) this.byTarget.delete(to);
  }
}

/** Hall tier chosen at the NPC (phase E reads it at booking time), valid 30 minutes. */
export class TierPicks {
  private readonly picks = new Map<number, { tier: number; expiresAt: number }>();

  set(characterId: number, tier: number, now: number): void {
    this.picks.set(characterId, { tier, expiresAt: now + MARRIAGE.tierPickMs });
  }

  /** The live pick or 0. */
  get(characterId: number, now: number): number {
    const p = this.picks.get(characterId);
    if (!p || now > p.expiresAt) {
      this.picks.delete(characterId);
      return 0;
    }
    return p.tier;
  }

  forget(characterId: number): void {
    this.picks.delete(characterId);
  }
}

/**
 * What the pair held before they marry: a tutor or brother row refuses (the mentor / brotherhood state would desync), a black
 * row is refused by the link itself; otherwise the type a divorce restores (1 friend wins over 3 enemy, 0 = delete the rows).
 */
export function priorBond(types: readonly (number | undefined)[]): { ok: true; prior: 0 | 1 | 3 } | { ok: false } {
  const has = (t: number): boolean => types.includes(t);
  if (has(RelationType.TUTOR) || has(RelationType.BROTHER)) return { ok: false };
  if (has(RelationType.FRIEND)) return { ok: true, prior: 1 };
  return { ok: true, prior: has(RelationType.ENEMY) ? 3 : 0 };
}
