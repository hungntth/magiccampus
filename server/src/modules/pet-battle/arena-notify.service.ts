// Pushes of a pet arena fight that go to other sessions: the defender's log line (only to a session that opened the arena panel, the client
// throws on onPetArenaFight before it was built), the war report to everybody online (onPetArenaSysMsg) and system-channel announcements.

import { Injectable } from '@nestjs/common';
import type { PetArenaFightPush, PetArenaSysMsg } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { ArenaFeedService } from './arena-feed.service';

@Injectable()
export class ArenaNotifyService {
  constructor(private readonly scenes: SceneManager, private readonly feed: ArenaFeedService) {}

  /** The defender's guest line (with its refreshed list) when it is online with the panel open; otherwise it reads the kept log on open. */
  toDefender(defenderId: number, payload: PetArenaFightPush): boolean {
    const session = this.scenes.findByCharacter(defenderId);
    if (!session || !this.feed.isOpen(session)) return false;
    session.callback('onPetArenaFight', payload);
    return true;
  }

  /** onPetArenaSysMsg(msg, group) to every online player (Go broadcastSysMsg). */
  broadcastSys(group: number, msg: PetArenaSysMsg): void {
    for (const session of this.scenes.onlineSessions()) session.callback('onPetArenaSysMsg', msg, group);
  }

  announce(text: string): void {
    this.scenes.broadcastAll('onSystemSay', [text]);
  }
}
