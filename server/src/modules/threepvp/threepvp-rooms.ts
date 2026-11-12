// Pure 3v3 room registry (M14 phase H, no sockets / Mongo): rooms with up to three seats (seat 1 = leader), the smallest-free id rule,
// join refusals in the Go order, seat renumbering on removal (ready flags reset), password / level-limit normalisation, the ready / queue
// flags and the wire view. Unit-tested in threepvp-rooms.test.ts; ThreePvpRoomsService adds sessions, pushes and teleports.

import { THREE_PVP, THREE_PVP_TEXT, type PvpRoom } from '@mc/shared';

export interface Seat {
  cid: number;
  name: string;
  level: number;
}

export interface Room {
  id: number;
  leaderId: number;
  pass: string;
  min: number;
  max: number;
  /** Seat order, [0] = leader. */
  members: Seat[];
  /** Members (not the leader) that pressed ready. */
  ready: Set<number>;
  /** In the matching pool. */
  queued: boolean;
  /** In a battle right now. */
  fighting: boolean;
  /** Losses in a row (a win clears it, a draw keeps it). */
  losses: number;
  restUntil: number;
  lastOpponent: number | null;
  /** Characters the leader invited (they may join without the password). */
  invited: Set<number>;
}

export type JoinRefusal = 'full' | 'queued' | 'level' | 'pass';

/** Password: digits only, at most 6, stored without leading zeros ('' = open room); null when malformed. */
export function normalizePass(raw: unknown): string | null {
  const s = typeof raw === 'number' ? String(raw) : raw;
  if (typeof s !== 'string' || !/^\d*$/.test(s) || s.length > THREE_PVP.PASS_MAX_DIGITS) return null;
  return s.replace(/^0+/, '');
}

/** Level limits clamped to [MIN_LEVEL, MAX_LEVEL] with min <= max; null when either bound is not a number. */
export function clampLimit(min: unknown, max: unknown): { min: number; max: number } | null {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const a = Math.min(Math.max(Math.floor(lo), THREE_PVP.MIN_LEVEL), THREE_PVP.MAX_LEVEL);
  const b = Math.min(Math.max(Math.floor(hi), THREE_PVP.MIN_LEVEL), THREE_PVP.MAX_LEVEL);
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

export const REFUSAL_TEXT: Readonly<Record<JoinRefusal, string>> = {
  full: THREE_PVP_TEXT.FULL,
  queued: THREE_PVP_TEXT.QUEUED,
  level: THREE_PVP_TEXT.LEVEL_RANGE,
  pass: THREE_PVP_TEXT.BAD_PASS,
};

export interface RemoveResult {
  room: Room;
  /** The removed character led the room: the next seat took over (null when nobody is left or the leader stayed). */
  newLeaderId: number | null;
  empty: boolean;
  /** The room was in the queue and had to leave it. */
  wasQueued: boolean;
}

export class RoomBook {
  private readonly rooms = new Map<number, Room>();
  private readonly byMember = new Map<number, number>();

  all(): Room[] {
    return [...this.rooms.values()].sort((a, b) => a.id - b.id);
  }

  get(id: number): Room | undefined {
    return this.rooms.get(id);
  }

  roomOf(cid: number): Room | undefined {
    const id = this.byMember.get(cid);
    return id === undefined ? undefined : this.rooms.get(id);
  }

  /** Seat number (1..3) of a member, 0 when absent. */
  seatOf(room: Room, cid: number): number {
    return room.members.findIndex((m) => m.cid === cid) + 1;
  }

  /** New room led by `leader` with the smallest free id, the full level range and no password. */
  create(leader: Seat): Room {
    let id = 1;
    while (this.rooms.has(id)) id++;
    const room: Room = {
      id, leaderId: leader.cid, pass: '', min: THREE_PVP.MIN_LEVEL, max: THREE_PVP.MAX_LEVEL, members: [leader], ready: new Set(),
      queued: false, fighting: false, losses: 0, restUntil: 0, lastOpponent: null, invited: new Set(),
    };
    this.rooms.set(id, room);
    this.byMember.set(leader.cid, id);
    return room;
  }

  /** First refusal in the Go order: full, queued, level range, password (an invited character skips the password). */
  joinRefusal(room: Room, level: number, pass: string, invitedCid?: number): JoinRefusal | null {
    if (room.members.length >= THREE_PVP.SEATS) return 'full';
    if (room.queued || room.fighting) return 'queued';
    if (level < room.min || level > room.max) return 'level';
    const invited = invitedCid !== undefined && room.invited.has(invitedCid);
    if (room.pass !== '' && !invited && room.pass !== (normalizePass(pass) ?? pass)) return 'pass';
    return null;
  }

  join(room: Room, seat: Seat): void {
    room.members.push(seat);
    room.invited.delete(seat.cid);
    this.byMember.set(seat.cid, room.id);
  }

  /** Removes a member: seats renumber, ready flags reset, the next seat leads, an empty room is deleted. */
  remove(cid: number): RemoveResult | null {
    const room = this.roomOf(cid);
    if (!room) return null;
    const wasLeader = room.leaderId === cid;
    const wasQueued = room.queued;
    room.members = room.members.filter((m) => m.cid !== cid);
    this.byMember.delete(cid);
    room.ready.clear();
    room.queued = false;
    room.invited.delete(cid);
    if (room.members.length === 0) {
      this.rooms.delete(room.id);
      return { room, newLeaderId: null, empty: true, wasQueued };
    }
    if (wasLeader) room.leaderId = room.members[0].cid;
    return { room, newLeaderId: wasLeader ? room.leaderId : null, empty: false, wasQueued };
  }

  /** A non-leader toggles ready; returns the new state or null for the leader / a stranger. */
  toggleReady(room: Room, cid: number): boolean | null {
    if (cid === room.leaderId || !room.members.some((m) => m.cid === cid)) return null;
    if (room.ready.has(cid)) room.ready.delete(cid);
    else room.ready.add(cid);
    return room.ready.has(cid);
  }

  /** The leader may start once every other present member is ready (a solo leader at once). */
  canStart(room: Room): boolean {
    return room.members.every((m) => m.cid === room.leaderId || room.ready.has(m.cid));
  }

  /** Empty seats (2..3) of a room, for the armLeader pushes. */
  emptySeats(room: Room): number[] {
    const out: number[] = [];
    for (let seat = room.members.length + 1; seat <= THREE_PVP.SEATS; seat++) out.push(seat);
    return out;
  }

  clear(): void {
    this.rooms.clear();
    this.byMember.clear();
  }

  /** Wire view; the password is masked ('*' = locked, '' = open): only the leader's own push carries the digits. */
  toWire(room: Room): PvpRoom {
    const memberList: PvpRoom['memberList'] = {};
    room.members.forEach((m, i) => {
      memberList[String(i + 1)] = { cid: m.cid, name: m.name, level: m.level, state: room.ready.has(m.cid) || m.cid === room.leaderId ? 1 : 0 };
    });
    return { id: room.id, leaderId: room.leaderId, pass: room.pass === '' ? '' : '*', limit: { lev: { min: room.min, max: room.max } }, memberList };
  }
}
