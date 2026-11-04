// NPC RPCs: clickNpc, npcFuncClick(npcId[, md5]). Pushes (to the caller only; both RPCs return null): npcFuncInit, onOpenShop,
// initViewBankPanel (bank NPC, type 7), onSceneEnter (transport NPCs that teleport on click); quest-battle NPCs (type 10/19/20) start a battle instead.

import { Injectable } from '@nestjs/common';
import { NpcType } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { QuestBattleService } from '../combat/quest-battle.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { LoopService } from '../loop/loop.service';
import { QuestService } from '../quest/quest.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { ShopService } from '../shop/shop.service';
import { NpcService } from './npc.service';

// NPCs that teleport on click instead of talking: npc id -> destination map, arrival at its safe point.
// Legacy npc_click.go:199-237 (1287 "Vân Đài" on Xuất Vân Thôn, drawn like a gate).
const CLICK_TELEPORT_NPCS: Readonly<Record<number, number>> = { 1287: 3 };

@Injectable()
export class NpcRpc {
  constructor(
    private readonly gameData: GameDataService,
    private readonly npcs: NpcService,
    private readonly quests: QuestService,
    private readonly loops: LoopService,
    private readonly shops: ShopService,
    private readonly transport: SceneTransportService,
    private readonly questBattle: QuestBattleService,
  ) {}

  @Rpc('clickNpc', { requireCharacter: true, forbidInBattle: true })
  async clickNpc(session: Session, args: unknown[]): Promise<null> {
    const npc = this.npcOnMap(session, args);
    const teleportMap = CLICK_TELEPORT_NPCS[Number(npc.id)];
    if (teleportMap !== undefined) {
      await this.teleport(session, teleportMap);
      return null;
    }
    if (await this.questBattle.tryStart(session, npc)) return null; // onBattleStart replaces the dialog
    const quests = await this.quests.listForNpc(session.characterId!, Number(npc.id));
    // Legacy npc_click.go: a shop NPC without quests (or takeable loops) opens the shop directly, no npcFuncInit.
    const loopInfo = await this.loops.infoForNpc(session.characterId!, Number(npc.id));
    if (this.shopIdOf(npc) > 0 && Object.keys(quests.list).length === 0 && !Object.values(loopInfo.d ?? {}).some((l) => l.canTake)) {
      await this.openShop(session, npc);
      return null;
    }
    session.callback('npcFuncInit', this.npcs.buildFuncInit(npc, quests, loopInfo));
    return null;
  }

  /** Function button of the NPC dialog (Flash NpcFuncPanel): opens the NPC's shop. */
  @Rpc('npcFuncClick', { requireCharacter: true, forbidInBattle: true })
  async npcFuncClick(session: Session, args: unknown[]): Promise<null> {
    const npc = this.npcOnMap(session, args);
    if (this.shopIdOf(npc) > 0) {
      await this.openShop(session, npc);
    } else if (Number(npc.type) === NpcType.BANK) {
      // Legacy npc_click.go:65-86: the password argument is ignored (H5 has no secondary password); the bank-open flag
      // gates moves to and from bank sids until closeBank, a map change or a disconnect.
      session.bankOpen = true;
      session.callback('initViewBankPanel');
    } else {
      throw RpcException.notFound('shop');
    }
    return null;
  }

  private npcOnMap(session: Session, args: unknown[]): Row {
    const npcId = Number(args[0]);
    if (!Number.isInteger(npcId)) throw RpcException.invalidArgs('npcId');
    const npc = this.gameData.getNpc(npcId);
    if (!npc || Number(npc.pos_map_id) !== session.mapId) throw RpcException.notFound('npc');
    return npc;
  }

  private async teleport(session: Session, mapId: number): Promise<void> {
    const mapRow = this.gameData.getMap(mapId);
    if (!mapRow) throw RpcException.notFound(`map ${mapId}`);
    if (session.mapId === mapId) return;
    const x = Number(mapRow.safe_x ?? 0);
    const y = Number(mapRow.safe_y ?? 0);
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, x, y));
  }

  private shopIdOf(npc: Row): number {
    return Number(npc.shop_id ?? 0) || 0;
  }

  private async openShop(session: Session, npc: Row): Promise<void> {
    const data = await this.shops.buildOpenShop(this.shopIdOf(npc), Number(npc.id));
    if (!data) throw RpcException.notFound('shop');
    session.callback('onOpenShop', data);
  }
}
