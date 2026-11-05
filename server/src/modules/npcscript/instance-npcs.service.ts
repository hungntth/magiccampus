// Per-viewer instance NPCs (M10 decision 8): feature providers list the extra NPCs one character sees on a map (dungeon
// chests, floor spawns, maze doors); createNpcs appends them and clickNpc / hitNpc resolve their ids here. Live changes are
// pushed with onNpcOn(InstanceNpc) / onNpcOff(id) to one session or to every viewer on a map.

import { Injectable } from '@nestjs/common';
import type { BossRow, InstanceNpc } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';

export type InstanceNpcProvider = (session: Session, mapId: number) => Promise<InstanceNpc[]> | InstanceNpc[];
/** Map bosses a feature owns (M10 I schedule bosses): their static NPC rows are hidden and they arrive through createBoss. */
export type MapBossProvider = (mapId: number) => BossRow[];

@Injectable()
export class InstanceNpcService {
  private readonly providers: { name: string; fn: InstanceNpcProvider }[] = [];
  private readonly hiders: ((npcId: number) => boolean)[] = [];
  private readonly bossProviders: MapBossProvider[] = [];

  constructor(private readonly scenes: SceneManager) {}

  register(name: string, fn: InstanceNpcProvider): void {
    this.providers.push({ name, fn });
  }

  /** A feature takes over some static data_tbl_npc rows: createNpcs leaves them out. */
  hideStatic(fn: (npcId: number) => boolean): void {
    this.hiders.push(fn);
  }

  isHiddenStatic(npcId: number): boolean {
    return this.hiders.some((h) => h(npcId));
  }

  registerMapBosses(fn: MapBossProvider): void {
    this.bossProviders.push(fn);
  }

  /** Feature-owned map bosses standing on `mapId` (createBoss). */
  mapBosses(mapId: number): BossRow[] {
    return this.bossProviders.flatMap((p) => p(mapId));
  }

  /** Every instance NPC the session sees on `mapId` (provider order). */
  async npcsFor(session: Session, mapId: number): Promise<InstanceNpc[]> {
    const out: InstanceNpc[] = [];
    for (const p of this.providers) out.push(...(await p.fn(session, mapId)));
    return out;
  }

  /** The instance NPC `id` visible to the session on its current map, if any. */
  async find(session: Session, id: number): Promise<InstanceNpc | undefined> {
    if (!session.mapId) return undefined;
    return (await this.npcsFor(session, session.mapId)).find((n) => n.id === id);
  }

  /** onNpcOn to one session (only while it stands on the NPC's map). */
  npcOn(session: Session, npc: InstanceNpc): void {
    if (session.mapId === npc.map) session.callback('onNpcOn', npc);
  }

  npcOff(session: Session, id: number): void {
    session.callback('onNpcOff', id);
  }

  /** onNpcOn / onNpcOff to every session on a map, optionally filtered (per-viewer content). */
  npcOnMap(mapId: number, npc: InstanceNpc, filter: (s: Session) => boolean = () => true): void {
    for (const s of this.scenes.members(mapId)) if (filter(s)) s.callback('onNpcOn', npc);
  }

  npcOffMap(mapId: number, id: number, filter: (s: Session) => boolean = () => true): void {
    for (const s of this.scenes.members(mapId)) if (filter(s)) s.callback('onNpcOff', id);
  }
}
