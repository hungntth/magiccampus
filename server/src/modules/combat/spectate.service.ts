// Battle spectate (M9 phase H, Go combat/watch.go + spectate_watcher.go): startWatch(targetCid) / quitWatch(). A watcher gets
// onWatch(<start payload>), then every onBattlePlayList of that battle (never commands); 5 s after the end marker (or when the
// battle goes away) onWatchEnd(). Released on quitWatch, a new startWatch, disconnect and the watcher's own battle start.
// In memory only.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { WATCH_END_DELAY_MS, type BattlePlayList, type StartWatchReply, type WatchPush } from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { BattleManager } from './battle.manager';
import type { Battle } from './battle.types';
import { watchRefusal } from './spectate';

@Injectable()
export class SpectateService implements OnModuleInit {
  /** watcher character id -> watched battle id */
  private readonly watching = new Map<number, string>();

  constructor(
    private readonly manager: BattleManager,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    this.gateway.onDisconnect((session) => {
      if (session.characterId !== null) this.release(session.characterId);
    });
  }

  isWatching(characterId: number): boolean {
    return this.watching.has(characterId);
  }

  start(session: Session, targetCid: number): StartWatchReply {
    const me = session.characterId!;
    const target = this.scenes.findByCharacter(targetCid);
    const battle = target ? this.manager.ofCharacter(targetCid) : undefined;
    const why = watchRefusal({
      self: targetCid === me,
      watcherInBattle: session.battleId !== null,
      targetOnline: target !== undefined,
      sameMap: target?.mapId === session.mapId,
      targetInBattle: battle !== undefined,
      battleEnded: battle?.ended ?? false,
      hasStart: battle?.start !== undefined,
    });
    if (why || !battle?.start) {
      const error = why ?? 'Không thể xem trận chiến này.';
      session.callback('onSystemSay', error);
      return { success: false, error };
    }
    this.release(me);
    battle.watchers ??= new Set();
    battle.watchers.add(me);
    this.watching.set(me, battle.id);
    const push: WatchPush = { ...battle.start, watch: true };
    session.callback('onWatch', push);
    return { success: true };
  }

  /** quitWatch, a new watch, a disconnect or the watcher's own battle. */
  release(characterId: number): void {
    const id = this.watching.get(characterId);
    if (id === undefined) return;
    this.watching.delete(characterId);
    this.manager.get(id)?.watchers?.delete(characterId);
  }

  /** Called with every playlist of a battle; an end marker schedules onWatchEnd for the current watchers. */
  playlist(battle: Battle, groups: BattlePlayList, ended: boolean): void {
    const watchers = battle.watchers;
    if (!watchers || watchers.size === 0) return;
    for (const cid of watchers) this.scenes.findByCharacter(cid)?.callback('onBattlePlayList', groups);
    if (ended) this.finish(battle);
  }

  /** The battle is over (or cancelled): onWatchEnd 5 s later for everyone still watching it. */
  finish(battle: Battle): void {
    const cids = [...(battle.watchers ?? [])];
    battle.watchers?.clear();
    setTimeout(() => {
      for (const cid of cids) {
        if (this.watching.get(cid) !== battle.id) continue;
        this.watching.delete(cid);
        this.scenes.findByCharacter(cid)?.callback('onWatchEnd');
      }
    }, WATCH_END_DELAY_MS).unref();
  }
}
