// Headline channel 6 (Loa Lớn Siêu Cấp, item 2297, M14 phase G): text length check, one speaker consumed (persisted before anything is
// broadcast), onSay channel 6 to everyone, the last headline kept 30 minutes and replayed to a character entering the world.
// Pushes: onSay (channel 6), onAddCharactorSlot / onDelCharactorSlot (speaker spent).

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ChatChannel, HEADLINE, HEADLINE_TEXT, plainLength, type SayPush } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { InventoryService } from '../inventory/inventory.service';
import { withCharLock } from '../inventory/char-lock';
import { SceneHooks } from '../scene/scene-hooks.service';

interface Board {
  payload: SayPush;
  expiresAt: number;
}

@Injectable()
export class HeadlineService implements OnModuleInit {
  private board: Board | null = null;

  constructor(
    private readonly scenes: SceneManager,
    private readonly inventory: InventoryService,
    private readonly hooks: SceneHooks,
  ) {}

  onModuleInit(): void {
    // fromMap 0 = entering the world (sceneLogin): players who log in later still see the last headline.
    this.hooks.onMapChanged('headline-replay', (session, fromMap) => (fromMap === 0 ? this.replay(session) : undefined));
  }

  /** say(text, 6): validated, one 2297 consumed, then the board and every client get the line. */
  post(session: Session, payload: SayPush): Promise<void> {
    if (plainLength(payload.msg) > HEADLINE.maxChars) throw RpcException.forbidden(HEADLINE_TEXT.TOO_LONG);
    const id = session.characterId!;
    return withCharLock(id, async () => {
      const have = (await this.inventory.countByTemplate(id, [HEADLINE.itemId])).get(HEADLINE.itemId) ?? 0;
      if (have < 1) throw RpcException.forbidden(HEADLINE_TEXT.NO_SPEAKER);
      const spent = await this.inventory.removeByTemplate(id, HEADLINE.itemId, 1);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      const line: SayPush = { ...payload, channelId: ChatChannel.HEADLINE };
      this.board = { payload: line, expiresAt: Date.now() + HEADLINE.ttlMs };
      this.scenes.broadcastAll('onSay', [line]);
    });
  }

  /** The live headline, if any (also used by tests / the client replay). */
  current(now = Date.now()): SayPush | null {
    if (this.board && this.board.expiresAt <= now) this.board = null;
    return this.board?.payload ?? null;
  }

  private replay(session: Session): void {
    const line = this.current();
    if (line) session.callback('onSay', line);
  }
}
