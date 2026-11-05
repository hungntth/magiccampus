// Thám Hiểm Di Tích helpers shared by the step services (Go dungeon_thamhiem_floors.go groupOnMap / markGroup / heldRelics /
// spendRelic, ForgetBeaten): the open run, the clicker's online non-AFK group members on one floor map, step marking for that
// group, the held relics, item names and the explorer-points log line (the medal is not granted in H5, M10 decision 12).

import { Injectable, Logger } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { GameDataService } from '../../gamedata/gamedata.service';
import { PartyManager } from '../../party/party.manager';
import { dungeonByKey, runOf } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import type { DungeonRun } from '../dungeon.schema';
import { LucTienItems } from '../luctien/luctien-items.service';
import { isThRelic, TH, TH_FLOOR_ONE_RESET, thObjectSpots, type ThSceneNpc } from './thamhiem-layout';

export const TH_TEXT = {
  NO_RUN: 'Hãy vào Thám Hiểm Di Tích hôm nay trước đã.',
} as const;

@Injectable()
export class ThamHiemSupport {
  private readonly logger = new Logger('ThamHiem');
  readonly d: DungeonDef = dungeonByKey(TH.KEY)!;

  constructor(
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly items: LucTienItems,
    private readonly parties: PartyManager,
    private readonly gameData: GameDataService,
  ) {}

  /** Today's open (not closed) run, null otherwise (Go RunView.Open). */
  async run(characterId: number): Promise<DungeonRun | null> {
    const r = await this.state.run(characterId, this.d);
    return r && !r.closed ? r : null;
  }

  async beaten(characterId: number): Promise<readonly number[]> {
    return (await this.run(characterId))?.beaten ?? [];
  }

  /** Highest reachable floor index of the character (-1 without a run). */
  reach(characterId: number): Promise<number> {
    return this.state.reachable(characterId, this.d);
  }

  /** onNpcOn payload of a scene NPC (template art / name; the day shuffle places the floor-2 objects). */
  npcOf(n: ThSceneNpc): InstanceNpc | null {
    const p = n.map === TH.OBJECT_MAP ? thObjectSpots(this.state.today()).get(n.npc) : undefined;
    return this.support.spawnNpc(n.npc, n.nid, n.map, p ? p[0] : n.x, p ? p[1] : n.y);
  }

  npcName(id: number, fallback: string): string {
    return this.support.npcName(id, fallback);
  }

  onMap(session: Session, mapId: number): boolean {
    return session.mapId === mapId;
  }

  /** The clicker plus its online, non-AFK party members standing on `mapId` (Go groupOnMap). */
  groupOnMap(session: Session, mapId: number): Session[] {
    const out = [session];
    const party = this.parties.partyOf(session.characterId!);
    for (const m of party?.members ?? []) {
      if (m === session.characterId || party!.afk.has(m)) continue;
      const s = this.support.session(m);
      if (s && s.mapId === mapId) out.push(s);
    }
    return out;
  }

  /** Marks a step in each member's run (members need an open run); the sessions it was newly marked for. */
  async markGroup(members: readonly Session[], marker: number): Promise<Session[]> {
    const marked: Session[] = [];
    for (const [i, s] of members.entries()) {
      if (i > 0 && !(await this.run(s.characterId!))) continue;
      if (await this.state.markStep(s.characterId!, this.d, marker)) marked.push(s);
    }
    return marked;
  }

  /** Go ForgetBeaten: drops ids from today's run (floor-1 reset); true when something changed. */
  forget(characterId: number, ids: readonly number[] = TH_FLOOR_ONE_RESET): Promise<boolean> {
    return this.state.mutate(characterId, (st) => {
      const r = runOf(st.runs, TH.KEY, this.state.today());
      if (!r || !r.beaten.some((id) => ids.includes(id))) return false;
      r.beaten = r.beaten.filter((id) => !ids.includes(id));
      return true;
    });
  }

  /** Go isGroupHead: a solo player or the party leader. */
  isGroupHead(characterId: number): boolean {
    const party = this.parties.partyOf(characterId);
    return !party || party.leaderId === characterId;
  }

  held(characterId: number, item: number): Promise<number> {
    return this.items.held(characterId, item);
  }

  /** Carried relic ids, relic id order. */
  async heldRelics(characterId: number): Promise<number[]> {
    const out: number[] = [];
    for (let id = TH.RELIC_FIRST; id <= TH.RELIC_LAST; id++) if (isThRelic(id) && (await this.held(characterId, id)) > 0) out.push(id);
    return out;
  }

  give(session: Session, item: number): Promise<boolean> {
    return this.items.give(session, item);
  }

  spend(session: Session, item: number): Promise<boolean> {
    return this.items.spend(session, item);
  }

  itemName(item: number): Promise<string> {
    return this.gameData.templateName(29, item);
  }

  /** Explorer points are not granted (no medal system in H5, M10 decision 12): only logged. */
  skipPoints(characterId: number, points: number): void {
    if (points > 0) this.logger.log(`character ${characterId}: ${points} Điểm Mạo Hiểm not granted (no explorer medal, M10 decision 12)`);
  }
}
