// Mê Trận room NPCs: the per-viewer instance NPC provider (one gate per in-grid neighbour 900001-900004 labelled "Lên (ô N): <content>",
// the pending event NPC 900010 at 600,610) and the click hook (a gate click is one move, the event NPC reopens its popup or
// removes itself once resolved). Only inside the character's own copy room on a template map.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MAZE_DOOR_BASE, MAZE_EVENT_NPC_ID, isMazeTemplateMap, type InstanceNpc } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { NpcHookRegistry, type NpcRef } from '../npcscript/npc-hooks.registry';
import { isDoorId, roomDoors, type DoorSpec } from './maze-board';
import { MazeDataService } from './maze-data.service';
import { copyIdOf } from './maze-outcome';
import { MazeStateService } from './maze-state.service';
import { MazeService } from './maze.service';

@Injectable()
export class MazeDoorsProvider implements OnModuleInit {
  constructor(
    private readonly instances: InstanceNpcService,
    private readonly hooks: NpcHookRegistry,
    private readonly state: MazeStateService,
    private readonly data: MazeDataService,
    private readonly gameData: GameDataService,
    private readonly maze: MazeService,
  ) {}

  onModuleInit(): void {
    this.instances.register('maze', (session, mapId) => this.npcsFor(session, mapId));
    this.hooks.onClick('maze', (session, npc) => this.click(session, npc), 20);
  }

  private inOwnCopy(session: Session): boolean {
    return session.hasCharacter && session.copyId > 0 && session.copyId === copyIdOf(session.characterId!) && isMazeTemplateMap(session.mapId);
  }

  private toNpc(d: DoorSpec, mapId: number): InstanceNpc | null {
    const row = this.gameData.getNpc(d.nid);
    if (!row) return null;
    return { ...this.gameData.toSceneNpc(row), id: d.id, nid: d.nid, map: mapId, posX: d.x, posY: d.y, name: d.name, type: 1 };
  }

  async npcsFor(session: Session, mapId: number): Promise<InstanceNpc[]> {
    if (!this.inOwnCopy(session) || session.mapId !== mapId) return [];
    const run = (await this.state.read(session.characterId!)).run;
    if (!run) return [];
    const out: InstanceNpc[] = [];
    for (const d of roomDoors(run, (e) => this.data.eventName(e))) {
      const npc = this.toNpc(d, mapId);
      if (npc) out.push(npc);
    }
    return out;
  }

  private async click(session: Session, npc: NpcRef): Promise<boolean> {
    const isEvent = npc.id === MAZE_EVENT_NPC_ID;
    if (!isEvent && !isDoorId(npc.id)) return false;
    if (!this.inOwnCopy(session)) return false;
    if (!isEvent) {
      await this.maze.move(session, npc.id - MAZE_DOOR_BASE);
      return true;
    }
    const pending = (await this.state.read(session.characterId!)).run?.pending ?? 0;
    if (pending > 0) session.callback('showMazeDiscPanel', { type: pending });
    else session.callback('onNpcOff', MAZE_EVENT_NPC_ID);
    return true;
  }
}
