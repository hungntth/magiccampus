// In-memory room registry: which sessions are in which map, for scene broadcasts.
// Also tracks sessions per account so a second login can kick the first.

import { Injectable } from '@nestjs/common';
import type { Session } from './session';

@Injectable()
export class SceneManager {
  private readonly rooms = new Map<number, Set<Session>>();
  private readonly byAccount = new Map<string, Session>();
  private readonly byCharacter = new Map<number, Session>();

  /** `copyId` (M10 maze, > 0) puts the session in its own room keyed by the copy id while `session.mapId` stays the template map. */
  join(session: Session, mapId: number, copyId = 0): void {
    this.leave(session);
    const key = copyId > 0 ? copyId : mapId;
    let room = this.rooms.get(key);
    if (!room) {
      room = new Set();
      this.rooms.set(key, room);
    }
    room.add(session);
    session.mapId = mapId;
    session.copyId = copyId;
    session.bankOpen = false;
  }

  leave(session: Session): void {
    if (!session.mapId) return;
    const key = session.copyId > 0 ? session.copyId : session.mapId;
    const room = this.rooms.get(key);
    room?.delete(session);
    if (room && room.size === 0) this.rooms.delete(key);
    session.mapId = 0;
    session.copyId = 0;
    session.bankOpen = false;
  }

  members(mapId: number): Session[] {
    return [...(this.rooms.get(mapId) ?? [])];
  }

  broadcast(mapId: number, method: string, args: unknown[], exclude?: Session): void {
    for (const s of this.rooms.get(mapId) ?? []) {
      if (s !== exclude) s.callback(method, ...args);
    }
  }

  broadcastAll(method: string, args: unknown[], exclude?: Session): void {
    for (const room of this.rooms.values()) {
      for (const s of room) if (s !== exclude) s.callback(method, ...args);
    }
  }

  bindAccount(session: Session, accountId: string): Session | undefined {
    const previous = this.byAccount.get(accountId);
    this.byAccount.set(accountId, session);
    return previous && previous !== session ? previous : undefined;
  }

  bindCharacter(session: Session, characterId: number): void {
    this.byCharacter.set(characterId, session);
  }

  findByCharacter(characterId: number): Session | undefined {
    return this.byCharacter.get(characterId);
  }

  /** Every session that has a character bound (online characters). */
  onlineSessions(): Session[] {
    return [...this.byCharacter.values()];
  }

  release(session: Session): void {
    this.leave(session);
    if (session.accountId && this.byAccount.get(session.accountId) === session) {
      this.byAccount.delete(session.accountId);
    }
    if (session.characterId !== null && this.byCharacter.get(session.characterId) === session) {
      this.byCharacter.delete(session.characterId);
    }
  }

  onlineCount(): number {
    return this.byCharacter.size;
  }
}
