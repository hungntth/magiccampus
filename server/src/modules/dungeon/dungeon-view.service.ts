// Phụ bản views (H5 helpers): the run strip push onDungeonRun(DungeonRunView | null) on every map change into / out of a ruled
// floor and after progress (victory, credit), and the hub rows of getFbInfo() (tickets, run state, reach, daily lock, first clear).

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DungeonDef, DungeonRunView, FbInfo } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { SceneHooks } from '../scene/scene-hooks.service';
import { difficultyOf, dungeonByMap, enabledDungeons, lockedUntil, pendingOf, pendingText, reachable, runDeadline, runOf } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';

@Injectable()
export class DungeonViewService implements OnModuleInit {
  constructor(
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly sceneHooks: SceneHooks,
  ) {}

  onModuleInit(): void {
    this.sceneHooks.onMapChanged('dungeon-strip', async (s, from, to) => {
      if (dungeonByMap(to) || dungeonByMap(from)) await this.push(s);
    });
  }

  /** The strip for the session's current map (null off the floors or without a run). */
  async runView(characterId: number, mapId: number): Promise<DungeonRunView | null> {
    const at = dungeonByMap(mapId);
    if (!at) return null;
    const { d, floor } = at;
    const { run, done } = await this.state.view(characterId, d);
    if (!run || run.closed) return null;
    const pending = pendingText(pendingOf(d.floors[floor], run, done), (id) => this.support.npcName(id), (id) => this.support.questName(id));
    return {
      key: d.key, name: d.name, floor, floors: d.floors.length, deadline: runDeadline(run, d.rules),
      difficulty: difficultyOf(d.rules, run.difficulty).name, pending,
    };
  }

  async push(session: Session): Promise<void> {
    if (!session.characterId) return;
    session.callback('onDungeonRun', await this.runView(session.characterId, session.mapId));
  }

  async pushTo(characterId: number): Promise<void> {
    const s = this.support.session(characterId);
    if (s) await this.push(s);
  }

  async fbInfo(characterId: number): Promise<FbInfo[]> {
    const doc = await this.state.load(characterId);
    const now = this.state.now();
    const out: FbInfo[] = [];
    for (const d of enabledDungeons()) out.push(await this.row(characterId, d, doc, now));
    return out;
  }

  private async row(characterId: number, d: DungeonDef, doc: Awaited<ReturnType<DungeonStateService['load']>>, now: number): Promise<FbInfo> {
    const run = runOf(doc.runs, d.key, this.state.today());
    const done = await this.state.questsDone(characterId, d, run);
    return {
      key: d.key,
      tickets: await this.support.tickets(characterId, d),
      run: !run ? 'none' : run.closed === 'auto' ? 'auto' : run.closed ? 'closed' : 'open',
      reached: reachable(d, run, done),
      lockedUntil: lockedUntil(doc.done[d.key], now),
      cleared: (doc.cleared[d.key] ?? 0) > 0,
      deadline: run && !run.closed ? runDeadline(run, d.rules) : 0,
      entrance: d.entrances.map((n) => this.support.npcName(n)).join(' / '),
    };
  }
}
