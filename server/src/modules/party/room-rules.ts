// Pure recruit-room state (M14 phase F): per-leader create cooldown and the pending applications (one per applicant, lazy expiry on an
// injectable clock). The ad itself lives on the party (`Party.room`); RoomService orchestrates and pushes. Unit-tested in room-rules.test.ts.

import { ROOM } from '@mc/shared';

interface Application {
  partyId: number;
  expiresAt: number;
}

export type ApplyOutcome = 'ok' | 'already' | 'full';

export class RoomBook {
  private readonly applications = new Map<number, Application>();
  private readonly lastCreate = new Map<number, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Milliseconds until `leader` may create a room again (0 = now). */
  cooldownLeft(leader: number): number {
    const at = this.lastCreate.get(leader);
    return at === undefined ? 0 : Math.max(0, at + ROOM.createCooldownMs - this.now());
  }

  markCreated(leader: number): void {
    this.lastCreate.set(leader, this.now());
  }

  /** Records an application; refused when the applicant already has a live one or the room's list is full. */
  apply(applicant: number, partyId: number): ApplyOutcome {
    if (this.pendingOf(applicant) !== undefined) return 'already';
    if (this.applicantsOf(partyId).length >= ROOM.maxApplicants) return 'full';
    this.applications.set(applicant, { partyId, expiresAt: this.now() + ROOM.applyTtlMs });
    return 'ok';
  }

  /** The party id the applicant is waiting on (live applications only). */
  pendingOf(applicant: number): number | undefined {
    const app = this.applications.get(applicant);
    if (!app) return undefined;
    if (app.expiresAt <= this.now()) {
      this.applications.delete(applicant);
      return undefined;
    }
    return app.partyId;
  }

  /** Live applicants of a room in arrival order. */
  applicantsOf(partyId: number): number[] {
    const out: number[] = [];
    for (const [cid, app] of [...this.applications]) {
      if (app.expiresAt <= this.now()) this.applications.delete(cid);
      else if (app.partyId === partyId) out.push(cid);
    }
    return out;
  }

  drop(applicant: number): boolean {
    return this.applications.delete(applicant);
  }

  /** Drops every application of a room; returns the applicants that were waiting. */
  dropParty(partyId: number): number[] {
    const gone = this.applicantsOf(partyId);
    for (const cid of gone) this.applications.delete(cid);
    return gone;
  }

  /** Forgets cooldown stamps that have run out (called by the room sweep). */
  prune(): void {
    for (const [cid, at] of [...this.lastCreate]) if (at + ROOM.createCooldownMs <= this.now()) this.lastCreate.delete(cid);
  }

  /** Disconnect: forget the character's application and cooldown. */
  forget(cid: number): void {
    this.applications.delete(cid);
    this.lastCreate.delete(cid);
  }
}
