// In-memory Kết bái ceremonies (Go application/brotherhood ceremony.go): a draft waits for the leader's fee confirmation
// (beginBrother), a live ceremony waits for every participant's answer (60 s, one NO cancels). Clock passed in for tests.

import { BROTHER, type BrotherKindId } from '@mc/shared';
import type { Participant } from './brother-rules';

export interface Ceremony {
  kind: BrotherKindId;
  leaderId: number;
  leaderName: string;
  /** Group the ceremony joins / disbands; 0 for a new group. */
  groupId: number;
  participants: Participant[];
  fee: number;
  expires: number;
  agreed: Set<number>;
}

export type AnswerResult =
  | { state: 'expired' }
  | { state: 'refused'; ceremony: Ceremony }
  | { state: 'waiting'; ceremony: Ceremony }
  | { state: 'ready'; ceremony: Ceremony };

export const idsOf = (c: Ceremony): number[] => c.participants.map((p) => p.id);

export class BrotherCeremonies {
  private readonly drafts = new Map<number, Ceremony>();
  private readonly live = new Map<number, Ceremony>();

  /** Stores the leader's draft (replacing an older one). */
  putDraft(c: Ceremony, now: number): void {
    this.drafts.set(c.leaderId, { ...c, expires: now + BROTHER.answerMs });
  }

  /** The leader's live draft, consumed; null when missing or expired. */
  takeDraft(leaderId: number, now: number): Ceremony | null {
    const d = this.drafts.get(leaderId);
    this.drafts.delete(leaderId);
    return d && d.expires > now ? d : null;
  }

  /** Registers a ceremony (the leader agrees already when `leaderAgrees`); false when a participant has another live one. */
  register(c: Ceremony, now: number, leaderAgrees: boolean): boolean {
    for (const id of idsOf(c)) {
      const other = this.live.get(id);
      if (other && other.expires > now) return false;
    }
    const entry: Ceremony = { ...c, expires: now + BROTHER.answerMs, agreed: new Set(leaderAgrees ? [c.leaderId] : []) };
    for (const id of idsOf(c)) this.live.set(id, entry);
    return true;
  }

  /** A participant answers a ceremony of `kind`; `ready` means everybody agreed (the ceremony is removed, so it runs once). */
  answer(characterId: number, kind: BrotherKindId, agree: boolean, now: number): AnswerResult {
    const c = this.live.get(characterId);
    if (!c || c.kind !== kind || c.expires <= now) {
      if (c && c.expires <= now) this.drop(c);
      return { state: 'expired' };
    }
    if (!agree) {
      this.drop(c);
      return { state: 'refused', ceremony: c };
    }
    c.agreed.add(characterId);
    if (!c.participants.every((p) => c.agreed.has(p.id))) return { state: 'waiting', ceremony: c };
    this.drop(c);
    return { state: 'ready', ceremony: c };
  }

  /** Drops the character's draft and live ceremony (disconnect, character leave); returns the live one that was cancelled. */
  dropFor(characterId: number): Ceremony | null {
    this.drafts.delete(characterId);
    const c = this.live.get(characterId) ?? null;
    if (c) this.drop(c);
    return c;
  }

  get liveCount(): number {
    return new Set(this.live.values()).size;
  }

  get draftCount(): number {
    return this.drafts.size;
  }

  private drop(c: Ceremony): void {
    for (const id of idsOf(c)) if (this.live.get(id) === c) this.live.delete(id);
  }
}
