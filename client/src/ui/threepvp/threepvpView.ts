// Pure helpers of the 3v3 windows (room list / room panel): seat mapping, lock flag, level text, ready-flag patching.

import type { PvpRoom, PvpRoomMember } from '@mc/shared';

export const SEAT_KEYS = ['1', '2', '3'] as const;

/** Seats 1..3 of a room; empty seats are null. */
export function seatsOf(room: PvpRoom): (PvpRoomMember | null)[] {
  return SEAT_KEYS.map((k) => room.memberList[k] ?? null);
}

export const memberCount = (room: PvpRoom): number => seatsOf(room).filter((m) => m !== null).length;

/** The server sends '*' (others) or the digits (leader) for a locked room, '' for an open one. */
export const isLocked = (room: PvpRoom): boolean => room.pass !== '';

export const limitText = (room: PvpRoom): string => `Cấp ${room.limit.lev.min}-${room.limit.lev.max}`;

/** Sets the ready flag of seat `index` (2 or 3). `cid` 0 is the server's placeholder for an empty seat: ignored. */
export function setSeatReady(room: PvpRoom, index: number, cid: number, state: number): boolean {
  if (cid === 0 || index < 2 || index > 3) return false;
  const m = room.memberList[String(index)];
  if (!m || m.cid !== cid) return false;
  m.state = state;
  return true;
}

/** Room ids ascending, for stable card order. */
export const sortedRooms = (rooms: Record<number, PvpRoom>): PvpRoom[] => Object.values(rooms).sort((a, b) => a.id - b.id);

/** Keeps only digits, at most `max` of them (password field). */
export const digitsOnly = (s: string, max: number): string => s.replace(/\D/g, '').slice(0, max);

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `pvp3-btn${cls ? ` ${cls}` : ''}`, label);
  b.onclick = onClick;
  return b;
}
