// NPC interaction logic: builds the npcFuncInit payload for a clicked NPC row.
// The quest part ({state, list}) comes from QuestService; default is no quests (state -1).

import { Injectable } from '@nestjs/common';
import { NpcType } from '@mc/shared';
import type { NpcFuncInit, QuestView } from '@mc/shared';
import type { Row } from '../gamedata/gamedata.service';

// NPC row types that expose a function button (legacy npc_interaction.go).
export const NPC_FUNC_TYPES: ReadonlySet<number> = new Set([
  NpcType.SHOP,
  NpcType.AUCTION,
  NpcType.BANK,
  NpcType.HEAL,
  NpcType.TRANSPORT,
  NpcType.CALLBOARD,
  NpcType.TUTOR,
]);

@Injectable()
export class NpcService {
  buildFuncInit(npc: Row, quests: { state: number; list: Record<string, QuestView> } = { state: -1, list: {} }): NpcFuncInit {
    const id = Number(npc.id);
    const type = Number(npc.type ?? 0);
    return {
      npcId: id,
      npcName: String(npc.name ?? ''),
      npcType: NPC_FUNC_TYPES.has(type) ? type : 0,
      npcQuest: { npcId: id, state: quests.state, list: quests.list },
      loopInfo: { d: null, flag: false },
      onServiceText: String(npc.on_service_text ?? ''),
    };
  }
}
