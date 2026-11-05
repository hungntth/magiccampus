// M10 scene hooks: gate guards asked by sceneChange before a gate teleport (Go handlers/scene/gate_guard.go: the first refusal
// is sent as onMidNote and the player stays), and map-change listeners called on every scene entry (sceneLogin, gates, /go,
// transport, revive) with the map the session left (0 at login). Used by the dungeon sweeper and the world boss HUD.

import { Injectable, Logger } from '@nestjs/common';
import type { Session } from '../../gateway/session';

/** null = allowed; a string = the refusal text. */
export type GateGuard = (session: Session, fromMap: number, toMap: number) => Promise<string | null> | string | null;
export type MapChangeListener = (session: Session, fromMap: number, toMap: number) => Promise<void> | void;

@Injectable()
export class SceneHooks {
  private readonly logger = new Logger(SceneHooks.name);
  private readonly guards: { name: string; fn: GateGuard }[] = [];
  private readonly listeners: { name: string; fn: MapChangeListener }[] = [];

  addGateGuard(name: string, fn: GateGuard): void {
    this.guards.push({ name, fn });
  }

  onMapChanged(name: string, fn: MapChangeListener): void {
    this.listeners.push({ name, fn });
  }

  async gateRefusal(session: Session, fromMap: number, toMap: number): Promise<string | null> {
    for (const g of this.guards) {
      const why = await g.fn(session, fromMap, toMap);
      if (why) return why;
    }
    return null;
  }

  /** Listener failures are logged, never block the move. */
  async mapChanged(session: Session, fromMap: number, toMap: number): Promise<void> {
    for (const l of this.listeners) {
      try {
        await l.fn(session, fromMap, toMap);
      } catch (e) {
        this.logger.error(`map-change listener ${l.name} failed: ${(e as Error).message}`);
      }
    }
  }
}
