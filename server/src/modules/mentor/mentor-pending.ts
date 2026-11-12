// In-memory Sư đồ state that never reaches Mongo: directed IM requests (5 min, keyed by pair AND direction so a requester cannot
// accept their own request) and the NPC 49 drafts (60 s: the member asked, the alert is up, confirmTutor must follow). Clock is
// passed in so the expiry rules are unit-tested.

import { MENTOR_NPC_DRAFT_MS, MENTOR_REQUEST_MS } from '@mc/shared';

export class PendingRequests {
  private readonly open = new Map<string, number>(); // key -> expiry (ms)

  private static key(teacherId: number, studentId: number, byStudent: boolean): string {
    return `${teacherId}:${studentId}:${byStudent ? 'S' : 'T'}`;
  }

  /** The student (`byStudent`) or the teacher asked; replaces an older identical request. */
  remember(teacherId: number, studentId: number, byStudent: boolean, now: number): void {
    for (const [k, exp] of this.open) if (exp <= now) this.open.delete(k);
    this.open.set(PendingRequests.key(teacherId, studentId, byStudent), now + MENTOR_REQUEST_MS);
  }

  /** True once per live request. The teacher answers a student's request, the student answers a teacher's. */
  consume(teacherId: number, studentId: number, byStudent: boolean, now: number): boolean {
    const key = PendingRequests.key(teacherId, studentId, byStudent);
    const exp = this.open.get(key);
    this.open.delete(key);
    return exp !== undefined && exp > now;
  }

  /** Disconnect / character leave: drops every request involving the character. */
  dropFor(characterId: number): void {
    for (const k of this.open.keys()) {
      const [t, s] = k.split(':');
      if (Number(t) === characterId || Number(s) === characterId) this.open.delete(k);
    }
  }

  get size(): number {
    return this.open.size;
  }
}

export class NpcDrafts {
  private readonly open = new Map<number, { leaderId: number; expires: number }>(); // member id -> draft

  set(studentId: number, leaderId: number, now: number): void {
    this.open.set(studentId, { leaderId, expires: now + MENTOR_NPC_DRAFT_MS });
  }

  /** True once when the member has a live draft naming this leader. */
  take(studentId: number, leaderId: number, now: number): boolean {
    const d = this.open.get(studentId);
    this.open.delete(studentId);
    return d !== undefined && d.expires > now && d.leaderId === leaderId;
  }

  dropFor(characterId: number): void {
    for (const [s, d] of this.open) if (s === characterId || d.leaderId === characterId) this.open.delete(s);
  }

  get size(): number {
    return this.open.size;
  }
}
