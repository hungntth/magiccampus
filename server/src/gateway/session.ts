// One connected WebSocket client. Holds auth/character/scene state and sends callbacks.

import type { WebSocket } from 'ws';
import type { ServerMessage, TemporaryEntry } from '@mc/shared';

let nextSessionId = 1;

export class Session {
  readonly id: number;
  accountId: string | null = null;
  username: string | null = null;
  /** Account GM level (0 = player); gates requireGm RPCs. Set at login. */
  gmLevel = 0;
  characterId: number | null = null;
  characterName: string | null = null;
  mapId = 0;
  /** M10 maze: per-character copy room id (scene room key) on a template map; 0 = the ordinary shared map room. */
  copyId = 0;
  lastMoveAt = 0;
  /** Active battle (combat module); set from battle start until battlePlayEnd. */
  battleId: string | null = null;
  /** Bank panel is open (set by npcFuncClick on a type-7 NPC, cleared by closeBank and on map change). */
  bankOpen = false;
  /** Túi tạm thời (M11): volatile overflow list of this connection, max TEMP_BAG.TEMPORARY_MAX, dropped with the session / on character change. */
  temporaryBag: TemporaryEntry[] = [];
  /** Epoch ms before which cbom cannot start a random encounter. */
  encounterUntil = 0;

  constructor(readonly socket: WebSocket) {
    this.id = nextSessionId++;
  }

  get isAuthenticated(): boolean {
    return this.accountId !== null;
  }

  get hasCharacter(): boolean {
    return this.characterId !== null;
  }

  sendRaw(msg: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(msg));
  }

  callback(method: string, ...args: unknown[]): void {
    this.sendRaw({ t: 'cb', m: method, a: args });
  }

  close(code = 1000, reason = ''): void {
    try {
      this.socket.close(code, reason);
    } catch {
      this.socket.terminate();
    }
  }
}
