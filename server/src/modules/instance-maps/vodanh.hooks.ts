// Vô Danh Động NPC menus (Go handlers/npc vo_danh_cave.go + dungeon_portals.go): 1172 Lão Ông Điêu Linh (map 55: "Nhiệm vụ" when
// it has quests, vo_danh_enter_1172, vo_danh_floor2_1172, vo_danh_guide_1172) and the crack NPC 2200 on floor 2 (dg_portal_2200_0
// back to 516). The book 2352 is only checked, never consumed. The group follows the leader through the teleport.

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { NpcMenuOption } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { QUEST_ENTRY_LABEL, questEntryFunc } from '../dungeon/dungeon-entry.hooks';
import { GameDataService } from '../gamedata/gamedata.service';
import { InventoryService } from '../inventory/inventory.service';
import { npcMsg, sendList } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { QuestService } from '../quest/quest.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { CharacterService } from '../character/character.service';
import { caveRefusal, VO_DANH, VO_DANH_TEXT } from './vodanh-rules';

@Injectable()
export class VoDanhHooks implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly quests: QuestService,
    private readonly characters: CharacterService,
    private readonly transport: SceneTransportService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('vodanh', (s, npc) => this.click(s, npc.id), 50);
    this.hooks.onScript('vodanh', (s, func) => this.script(s, func), 50);
  }

  private name(npc: number, fallback: string): string {
    return String(this.gameData.getNpc(npc)?.name ?? '') || fallback;
  }

  private async click(session: Session, npc: number): Promise<boolean> {
    if (npc === VO_DANH.CRACK_NPC) {
      sendList(session, npc, this.name(npc, 'Vết Nứt Không Gian'), VO_DANH_TEXT.CRACK_INFO, [{ label: 'Chuyển lên tầng 1', func: VO_DANH.FUNC_CRACK }]);
      return true;
    }
    if (npc !== VO_DANH.NPC) return false;
    const options: NpcMenuOption[] = [];
    const q = await this.quests.listForNpc(session.characterId!, npc);
    if (Object.keys(q.list).length > 0) options.push({ label: QUEST_ENTRY_LABEL, func: questEntryFunc(npc) });
    options.push(
      { label: 'Vào Vô Danh Động', func: `${VO_DANH.FUNC_ENTER}${npc}` },
      { label: 'Vào Tầng 2 Vô Danh Động (cấp 95)', func: `${VO_DANH.FUNC_FLOOR2}${npc}` },
      { label: 'Hướng dẫn', func: `${VO_DANH.FUNC_GUIDE}${npc}` },
    );
    sendList(session, npc, this.name(npc, 'Lão Ông Điêu Linh'), VO_DANH_TEXT.INTRO, options);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (func === VO_DANH.FUNC_CRACK) {
      if (session.mapId !== this.mapOfNpc(VO_DANH.CRACK_NPC)) return true;
      const level = (await this.characters.getById(session.characterId!)).level;
      if (level < VO_DANH.MIN_LEVEL_1) npcMsg(session, VO_DANH.CRACK_NPC, VO_DANH_TEXT.CRACK_LEVEL);
      else await this.teleport(session, VO_DANH.MAP_1);
      return true;
    }
    if (func.startsWith(VO_DANH.FUNC_GUIDE)) {
      if (session.mapId === this.mapOfNpc(VO_DANH.NPC)) npcMsg(session, VO_DANH.NPC, VO_DANH_TEXT.GUIDE);
      return true;
    }
    const floor2 = func.startsWith(VO_DANH.FUNC_FLOOR2);
    if (!floor2 && !func.startsWith(VO_DANH.FUNC_ENTER)) return false;
    if (session.mapId !== this.mapOfNpc(VO_DANH.NPC)) return true; // the menu belongs to the NPC on Điêu Linh Thôn
    await this.enterCave(session, floor2 ? VO_DANH.MAP_2 : VO_DANH.MAP_1, floor2 ? VO_DANH.MIN_LEVEL_2 : VO_DANH.MIN_LEVEL_1);
    return true;
  }

  private mapOfNpc(npc: number): number {
    return Number(this.gameData.getNpc(npc)?.pos_map_id ?? -1);
  }

  private async enterCave(session: Session, mapId: number, minLevel: number): Promise<void> {
    const cid = session.characterId!;
    const level = (await this.characters.getById(cid)).level;
    const books = (await this.inventory.countByTemplate(cid, [VO_DANH.BOOK])).get(VO_DANH.BOOK) ?? 0;
    const why = caveRefusal(level, minLevel, books);
    if (why) return npcMsg(session, VO_DANH.NPC, why);
    await this.teleport(session, mapId);
  }

  private async teleport(session: Session, mapId: number): Promise<void> {
    const map = this.gameData.getMap(mapId);
    if (!map) return;
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, Number(map.safe_x ?? 0), Number(map.safe_y ?? 0)));
  }
}
