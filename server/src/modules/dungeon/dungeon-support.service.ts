// Shared helpers of the phụ bản hooks: NPC / quest / character names, online sessions, ticket count and spend (slot sync;
// Go's loss notice is a no-op), quest-active checks, teleports (Go teleportToMap / teleportToPosition: the leader's party
// followers on the same map come along) and per-viewer NPC payloads for dungeon spawns.

import { Injectable } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { InventoryService } from '../inventory/inventory.service';
import { systemSay } from '../npcscript/menu';
import { QuestService } from '../quest/quest.service';
import { SceneTransportService } from '../scene/scene-transport.service';

@Injectable()
export class DungeonSupport {
  constructor(
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly transport: SceneTransportService,
    private readonly quests: QuestService,
  ) {}

  npcName(id: number, fallback = String(id)): string {
    return String(this.gameData.getNpc(id)?.name ?? '') || fallback;
  }

  questName(id: number): string {
    return this.gameData.getQuest(id)?.name || String(id);
  }

  session(characterId: number): Session | undefined {
    return this.scenes.findByCharacter(characterId);
  }

  say(characterId: number, text: string): void {
    const s = this.session(characterId);
    if (s) systemSay(s, text);
  }

  async character(characterId: number): Promise<{ name: string; level: number } | null> {
    try {
      const doc = await this.characters.getById(characterId);
      return { name: doc.name, level: doc.level };
    } catch {
      return null;
    }
  }

  async tickets(characterId: number, d: DungeonDef): Promise<number> {
    return (await this.inventory.countByTemplate(characterId, [d.ticket])).get(d.ticket) ?? 0;
  }

  /** Spends one carried ticket (slot sync to the owner's client). False when none is carried. */
  async spendTicket(characterId: number, d: DungeonDef): Promise<boolean> {
    if ((await this.tickets(characterId, d)) <= 0) return false;
    try {
      const spent = await this.inventory.removeByTemplate(characterId, d.ticket, 1);
      const s = this.session(characterId);
      for (const item of spent.updated) s?.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) s?.callback('onDelCharactorSlot', gone.id, gone.sid);
      return true;
    } catch {
      return false;
    }
  }

  async questActive(characterId: number, questId: number): Promise<boolean> {
    return (await this.quests.chaQuest(characterId, questId)) !== null;
  }

  /** Re-sends an active quest (onAddChaQuest) so the tracker shows collected items. */
  async pushQuest(session: Session, questId: number): Promise<void> {
    const q = await this.quests.chaQuest(session.characterId!, questId);
    if (q) session.callback('onAddChaQuest', q);
  }

  /** Moves the session (and, when `follow`, its party followers standing with it) to a map point; safe point when x/y omitted. */
  async teleport(session: Session, mapId: number, x?: number, y?: number, follow = true): Promise<void> {
    const map = this.gameData.getMap(mapId);
    if (!map) return;
    const px = x ?? Number(map.safe_x ?? 0);
    const py = y ?? Number(map.safe_y ?? 0);
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, px, py, follow));
  }

  /** onNpcOn payload of a dungeon spawn: art / name / type from the template row. */
  spawnNpc(id: number, nid: number, map: number, x: number, y: number): InstanceNpc | null {
    const row = this.gameData.getNpc(nid);
    if (!row) return null;
    return { ...this.gameData.toSceneNpc(row), id, nid, map, posX: x, posY: y };
  }
}
