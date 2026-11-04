// In-memory room registry: which sessions are in which map, for scene broadcasts.
// Also tracks sessions per account so a second login can kick the first.

import { Injectable } from '@nestjs/common';
import type { Session } from './session';

@Injectable()
export class SceneManager {
  private readonly rooms = new Map<number, Set<Session>>();
  private readonly byAccount = new Map<string, Session>();
  private readonly byCharacter = new Map<number, Session>();

  join(session: Session, mapId: number): void {
    this.leave(session);
    let room = this.rooms.get(mapId);
    if (!room) {
      room = new Set();
      this.rooms.set(mapId, room);
    }
    room.add(session);
    session.mapId = mapId;
  }

  leave(session: Session): void {
    if (!session.mapId) return;
    const room = this.rooms.get(session.mapId);
    room?.delete(session);
    if (room && room.size === 0) this.rooms.delete(session.mapId);
    session.mapId = 0;
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
