// Pure party rules (no sockets, no Mongo): membership, pending invites / join requests with a lazy 60 s expiry on an
// injectable clock, leave / kick / leader transfer / disband, AFK, follower selection and the mList linked list.
// PartyManager (party.manager.ts) is the injectable instance; everything here is unit-tested in party-rules.test.ts.

import { GroupCantJoinCode, PartyLimits, type GroupMember, type MList, type MListNode, type RoomAd } from '@mc/shared';

export interface Party {
  id: number;
  leaderId: number;
  /** Leader first. */
  members: number[];
  afk: Set<number>;
  /** M14 F: set while the party is advertised on the recruit board; such a party survives with one member. */
  room?: RoomAd;
}

export type Fail<R extends string> = { ok: false; reason: R; code?: number };

export type InviteResult = { ok: true } | Fail<'self' | 'inGroup' | 'full'>;
export type AcceptResult = { ok: true; party: Party; created: boolean } | Fail<'expired' | 'inGroup' | 'full'>;
export type RequestResult = { ok: true; leaderId: number } | Fail<'self' | 'inGroup' | 'noParty' | 'full'>;
export type AddResult = { ok: true; party: Party } | Fail<'notLeader' | 'expired' | 'inGroup' | 'full'>;
export type DenyKind = 'invite' | 'request' | 'none';

export type LeaveResult =
  | { kind: 'none' }
  /** Still a party: `newLeaderId` is set when the leader left. */
  | { kind: 'left'; party: Party; leaverId: number; newLeaderId: number | null }
  /** Dropped to one member: the party is gone; `members` are the old members (leaver included), leader first. */
  | { kind: 'dismissed'; leaverId: number; members: number[] };

export type KickResult = { ok: true; result: LeaveResult } | Fail<'notLeader' | 'self' | 'notMember'>;
export type GiveLeaderResult =
  | { ok: true; party: Party; oldLeaderId: number; wasAfk: boolean }
  | Fail<'notLeader' | 'self' | 'notMember'>;
export type JoinResult = { ok: true; party: Party } | Fail<'gone' | 'inGroup' | 'full'>;
export type AfkResult = { ok: true; party: Party } | Fail<'noParty' | 'leader'>;

export interface PartyFlags {
  inGroup: boolean;
  isLeader: boolean;
  groupAfk: boolean;
}

export interface Placement {
  mapId: number;
  x: number;
  y: number;
}

interface Pending {
  partyId: number | null;
  expiresAt: number;
}

export class PartyBook {
  private nextId = 1;
  private readonly parties = new Map<number, Party>();
  private readonly byMember = new Map<number, number>();
  /** toId -> (fromId -> expiry) */
  private readonly invites = new Map<number, Map<number, Pending>>();
  /** applicantId -> request for a specific party */
  private readonly requests = new Map<number, Pending>();

  constructor(private readonly now: () => number = Date.now) {}

  partyOf(cid: number): Party | undefined {
    const id = this.byMember.get(cid);
    return id === undefined ? undefined : this.parties.get(id);
  }

  partyById(id: number): Party | undefined {
    return this.parties.get(id);
  }

  allParties(): Party[] {
    return [...this.parties.values()];
  }

  /** M14 F: a one-member party for a recruit room (null when the character already has a party). */
  createSolo(leaderId: number): Party | null {
    return this.partyOf(leaderId) ? null : this.create(leaderId);
  }

  /** M14 F: the leader approved a recruit-room applicant; no invite or request needed. */
  addToParty(partyId: number, cid: number): JoinResult {
    const party = this.parties.get(partyId);
    if (!party) return { ok: false, reason: 'gone' };
    if (this.partyOf(cid)) return { ok: false, reason: 'inGroup', code: GroupCantJoinCode.IN_GROUP };
    if (party.members.length >= PartyLimits.MAX_MEMBERS) return { ok: false, reason: 'full', code: GroupCantJoinCode.FULL };
    this.add(party, cid);
    return { ok: true, party };
  }

  isLeader(cid: number): boolean {
    return this.partyOf(cid)?.leaderId === cid;
  }

  flagsOf(cid: number): PartyFlags {
    const party = this.partyOf(cid);
    if (!party) return { inGroup: false, isLeader: false, groupAfk: false };
    return { inGroup: true, isLeader: party.leaderId === cid, groupAfk: party.afk.has(cid) };
  }

  /** Non-leader, non-AFK members cannot walk on their own (they follow the leader). */
  canWalk(cid: number): boolean {
    const party = this.partyOf(cid);
    return !party || party.leaderId === cid || party.afk.has(cid);
  }

  /** Members that follow the leader's moves and map changes: not the leader, not AFK. */
  followersOf(leaderId: number): number[] {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId) return [];
    return party.members.filter((m) => m !== leaderId && !party.afk.has(m));
  }

  /** Records a pending invite. The party is created only when the target accepts. */
  invite(fromId: number, toId: number): InviteResult {
    if (fromId === toId) return { ok: false, reason: 'self' };
    if (this.partyOf(toId)) return { ok: false, reason: 'inGroup', code: GroupCantJoinCode.IN_GROUP };
    const party = this.partyOf(fromId);
    if (party && party.members.length >= PartyLimits.MAX_MEMBERS) {
      return { ok: false, reason: 'full', code: GroupCantJoinCode.FULL };
    }
    let from = this.invites.get(toId);
    if (!from) this.invites.set(toId, (from = new Map()));
    this.prune(from);
    from.set(fromId, { partyId: null, expiresAt: this.now() + PartyLimits.INVITE_TTL_MS });
    return { ok: true };
  }

  hasInvite(toId: number, fromId: number): boolean {
    return this.live(this.invites.get(toId)?.get(fromId)) !== undefined;
  }

  /** `toId` accepts the invite of `fromId`; creates the party when the inviter had none. */
  accept(toId: number, fromId: number): AcceptResult {
    const pending = this.live(this.invites.get(toId)?.get(fromId));
    if (!pending) {
      this.invites.get(toId)?.delete(fromId);
      return { ok: false, reason: 'expired' };
    }
    this.invites.get(toId)?.delete(fromId);
    if (this.partyOf(toId)) return { ok: false, reason: 'inGroup', code: GroupCantJoinCode.IN_GROUP };
    let party = this.partyOf(fromId);
    if (party && party.members.length >= PartyLimits.MAX_MEMBERS) {
      return { ok: false, reason: 'full', code: GroupCantJoinCode.FULL };
    }
    let created = false;
    if (!party) {
      party = this.create(fromId);
      created = true;
    }
    this.add(party, toId);
    return { ok: true, party, created };
  }

  /** A player without a party asks the party of `targetId` (any member) to take them in; the leader decides. */
  request(applicantId: number, targetId: number): RequestResult {
    if (applicantId === targetId) return { ok: false, reason: 'self' };
    if (this.partyOf(applicantId)) return { ok: false, reason: 'inGroup', code: GroupCantJoinCode.IN_GROUP };
    const party = this.partyOf(targetId);
    if (!party) return { ok: false, reason: 'noParty' };
    if (party.members.length >= PartyLimits.MAX_MEMBERS) return { ok: false, reason: 'full', code: GroupCantJoinCode.FULL };
    this.requests.set(applicantId, { partyId: party.id, expiresAt: this.now() + PartyLimits.INVITE_TTL_MS });
    return { ok: true, leaderId: party.leaderId };
  }

  /** The leader accepts the request of `applicantId` (groupAdd). */
  acceptRequest(leaderId: number, applicantId: number): AddResult {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId) return { ok: false, reason: 'notLeader' };
    const req = this.live(this.requests.get(applicantId));
    if (!req || req.partyId !== party.id) {
      this.requests.delete(applicantId);
      return { ok: false, reason: 'expired' };
    }
    this.requests.delete(applicantId);
    if (this.partyOf(applicantId)) return { ok: false, reason: 'inGroup', code: GroupCantJoinCode.IN_GROUP };
    if (party.members.length >= PartyLimits.MAX_MEMBERS) return { ok: false, reason: 'full', code: GroupCantJoinCode.FULL };
    this.add(party, applicantId);
    return { ok: true, party };
  }

  /** groupReqDeny(otherId): the caller declines an invite from `otherId` or, as leader, a request of `otherId`. */
  deny(callerId: number, otherId: number): DenyKind {
    if (this.live(this.invites.get(callerId)?.get(otherId))) {
      this.invites.get(callerId)?.delete(otherId);
      return 'invite';
    }
    const party = this.partyOf(callerId);
    const req = this.live(this.requests.get(otherId));
    if (party && party.leaderId === callerId && req && req.partyId === party.id) {
      this.requests.delete(otherId);
      return 'request';
    }
    return 'none';
  }

  leave(cid: number): LeaveResult {
    const party = this.partyOf(cid);
    if (!party) return { kind: 'none' };
    const old = [...party.members];
    party.members = party.members.filter((m) => m !== cid);
    party.afk.delete(cid);
    this.byMember.delete(cid);
    // A room (recruit ad) survives with one member and dissolves only when empty.
    if (party.members.length === 0 || (party.members.length <= 1 && !party.room)) {
      for (const m of party.members) this.byMember.delete(m);
      this.parties.delete(party.id);
      this.dropRequestsFor(party.id);
      return { kind: 'dismissed', leaverId: cid, members: old };
    }
    let newLeaderId: number | null = null;
    if (party.leaderId === cid) {
      newLeaderId = party.members.find((m) => !party.afk.has(m)) ?? party.members[0];
      this.promote(party, newLeaderId);
    }
    return { kind: 'left', party, leaverId: cid, newLeaderId };
  }

  kick(leaderId: number, targetId: number): KickResult {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId) return { ok: false, reason: 'notLeader' };
    if (targetId === leaderId) return { ok: false, reason: 'self' };
    if (!party.members.includes(targetId)) return { ok: false, reason: 'notMember' };
    return { ok: true, result: this.leave(targetId) };
  }

  giveLeader(leaderId: number, targetId: number): GiveLeaderResult {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId) return { ok: false, reason: 'notLeader' };
    if (targetId === leaderId) return { ok: false, reason: 'self' };
    if (!party.members.includes(targetId)) return { ok: false, reason: 'notMember' };
    const wasAfk = party.afk.has(targetId);
    this.promote(party, targetId);
    return { ok: true, party, oldLeaderId: leaderId, wasAfk };
  }

  /** The leader cannot be AFK (followers would have nobody to follow, and the flag would mean nothing). */
  setAfk(cid: number, afk: boolean): AfkResult {
    const party = this.partyOf(cid);
    if (!party) return { ok: false, reason: 'noParty' };
    if (party.leaderId === cid) return { ok: false, reason: 'leader' };
    if (afk) party.afk.add(cid);
    else party.afk.delete(cid);
    return { ok: true, party };
  }

  /** Disconnect: drops every pending invite / request the character sent or received. */
  forget(cid: number): void {
    this.invites.delete(cid);
    for (const from of this.invites.values()) from.delete(cid);
    this.requests.delete(cid);
  }

  private create(leaderId: number): Party {
    const party: Party = { id: this.nextId++, leaderId, members: [leaderId], afk: new Set() };
    this.parties.set(party.id, party);
    this.byMember.set(leaderId, party.id);
    return party;
  }

  private add(party: Party, cid: number): void {
    party.members.push(cid);
    this.byMember.set(cid, party.id);
    this.invites.delete(cid);
    this.requests.delete(cid);
  }

  /** Makes `cid` leader: first in the list, no longer AFK. */
  private promote(party: Party, cid: number): void {
    party.leaderId = cid;
    party.afk.delete(cid);
    party.members = [cid, ...party.members.filter((m) => m !== cid)];
  }

  private dropRequestsFor(partyId: number): void {
    for (const [applicant, req] of this.requests) if (req.partyId === partyId) this.requests.delete(applicant);
  }

  private live(p: Pending | undefined): Pending | undefined {
    return p && p.expiresAt > this.now() ? p : undefined;
  }

  private prune(from: Map<number, Pending>): void {
    for (const [id, p] of from) if (!this.live(p)) from.delete(id);
  }
}

/** Flash `mList`: linked list {head: {obj, next}, len}, leader first. */
export function buildMList(members: GroupMember[]): MList {
  let head: MListNode | null = null;
  for (let i = members.length - 1; i >= 0; i--) head = { obj: members[i], next: head };
  return { head, len: members.length };
}

/** unGroupAFK(true): the leader must be on the same map within AFK_RETURN_DISTANCE pixels. */
export function withinAfkReturn(member: Placement, leader: Placement): boolean {
  return member.mapId === leader.mapId && Math.hypot(member.x - leader.x, member.y - leader.y) <= PartyLimits.AFK_RETURN_DISTANCE;
}
