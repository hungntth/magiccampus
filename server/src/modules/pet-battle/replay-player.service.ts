// Plays a stored pet battle replay to one session (replayPetPVEFight / replayPetFight): onBattleReplay(start, bid) at once, then after
// 2.5 s (the client first-round START_DELAY is 2 s) ONE onBattlePlayList holding every round and the bare end marker. Shared by PPVE
// and the arena; the caller decides what a missing replay says.

import { Injectable } from '@nestjs/common';
import { PET_REPLAY_DELAY_MS } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { ReplayStore } from './replay.store';

@Injectable()
export class ReplayPlayerService {
  /** Gap between the two pushes; a field so tests can shrink it. */
  delayMs: number = PET_REPLAY_DELAY_MS;

  constructor(private readonly replays: ReplayStore) {}

  /** False when the replay is unknown (or another character's); nothing is sent then. */
  play(session: Session, characterId: number, bid: string): boolean {
    const replay = this.replays.get(characterId, bid);
    if (!replay) return false;
    session.callback('onBattleReplay', replay.start, replay.id);
    setTimeout(() => session.callback('onBattlePlayList', replay.playList), this.delayMs).unref();
    return true;
  }
}
