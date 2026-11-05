// In-memory previews of the two-step refinements (element, bind, soul, prefix, pet gear bind / pre), one slot per kind and character, like the
// legacy handler maps. They are dropped on disconnect or when the character leaves the world; materials already charged
// at the preview are not refunded (legacy).

import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { EquipProperties, UpgradeRequest } from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import type { Session } from '../../gateway/session';

export type Pending =
  | { kind: 'element'; equipId: number; element: number }
  | { kind: 'bind'; equipId: number; b1: number; b2: number }
  | { kind: 'soul'; equipId: number; prop: number; num: number }
  | { kind: 'petBind'; equipId: number; b1: number; b2: number }
  | { kind: 'petPre'; equipId: number; b1: number; b2: number }
  | { kind: 'prefix'; req: UpgradeRequest; quality: number; element: number; star: number; lines: EquipProperties };

export type PendingKind = Pending['kind'];

/** The part of GameGateway used here (kept structural so tests can pass a stub). */
export type SessionRef = Pick<Session, 'characterId'>;
export interface SessionHooks {
  onDisconnect(hook: (s: SessionRef) => void | Promise<void>): void;
  onCharacterLeave(hook: (s: SessionRef) => void | Promise<void>): void;
}

@Injectable()
export class RefinePending implements OnModuleInit {
  private readonly map = new Map<string, Pending>();

  constructor(@Inject(GameGateway) private readonly gateway: SessionHooks) {}

  onModuleInit(): void {
    const gone = (s: SessionRef): void => (s.characterId === null ? undefined : this.clear(s.characterId));
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }

  set(characterId: number, p: Pending): void {
    this.map.set(`${characterId}:${p.kind}`, p);
  }

  get<K extends PendingKind>(characterId: number, kind: K): Extract<Pending, { kind: K }> | undefined {
    return this.map.get(`${characterId}:${kind}`) as Extract<Pending, { kind: K }> | undefined;
  }

  /** Removes and returns the preview of that kind. */
  take<K extends PendingKind>(characterId: number, kind: K): Extract<Pending, { kind: K }> | undefined {
    const p = this.get(characterId, kind);
    this.map.delete(`${characterId}:${kind}`);
    return p;
  }

  drop(characterId: number, kind: PendingKind): void {
    this.map.delete(`${characterId}:${kind}`);
  }

  clear(characterId: number): void {
    for (const k of ['element', 'bind', 'soul', 'prefix', 'petBind', 'petPre'] as const) this.drop(characterId, k);
  }
}
