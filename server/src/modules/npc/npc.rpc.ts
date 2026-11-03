// NPC RPCs: clickNpc. Push: npcFuncInit (to the caller only; clickNpc itself returns null).

import { Injectable } from '@nestjs/common';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { QuestService } from '../quest/quest.service';
import { NpcService } from './npc.service';

@Injectable()
export class NpcRpc {
  constructor(
    private readonly gameData: GameDataService,
    private readonly npcs: NpcService,
    private readonly quests: QuestService,
  ) {}

  @Rpc('clickNpc', { requireCharacter: true })
  async clickNpc(session: Session, args: unknown[]): Promise<null> {
    const npcId = Number(args[0]);
    if (!Number.isInteger(npcId)) throw RpcException.invalidArgs('npcId');
    const npc = this.gameData.getNpc(npcId);
    if (!npc || Number(npc.pos_map_id) !== session.mapId) throw RpcException.notFound('npc');
    const quests = await this.quests.listForNpc(session.characterId!, npcId);
    session.callback('npcFuncInit', this.npcs.buildFuncInit(npc, quests));
    return null;
  }
}
