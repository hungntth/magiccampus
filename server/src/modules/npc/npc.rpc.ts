// NPC RPCs: clickNpc, npcFuncClick(npcId[, md5]). Pushes (to the caller only; both RPCs return null): npcFuncInit, onOpenShop (shop 83 gated
// by guild membership / level), openShopById (credit point shop NPCs, M11 phase E),
// initViewBankPanel (bank NPC, type 7), initViewMailMngP (mail NPC, type 3), onInitViewAuctionP (auction NPC, type 5), onSceneEnter (transport NPCs that teleport on click); quest-battle NPCs (type 10/19/20) start a battle instead.
// Loop bosses (M9) count as on the map while the character sees them (LoopBossService). M10: registered click hooks (NpcHookRegistry)
// run first; per-viewer instance NPCs (InstanceNpcService) are only reachable through them.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { CREDIT_SHOP_NPCS, GUILD_SHOP_ID, NpcType, type InitViewAuction } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { AuctionViewService } from '../auction/auction-view.service';
import { QuestBattleService } from '../combat/quest-battle.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { GuildShopService } from '../guild/guild-shop.service';
import { LoopBossService } from '../loop/loop-boss.service';
import { LoopService } from '../loop/loop.service';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { NpcHookRegistry, type NpcRef } from '../npcscript/npc-hooks.registry';
import { QuestService } from '../quest/quest.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { CreditShopService } from '../shop/credit-shop.service';
import { ShopService } from '../shop/shop.service';
import { NpcService } from './npc.service';

// NPCs that teleport on click instead of talking: npc id -> destination map, arrival at its safe point.
// Legacy npc_click.go:199-237 (1287 "Vân Đài" on Xuất Vân Thôn, drawn like a gate).
const CLICK_TELEPORT_NPCS: Readonly<Record<number, number>> = { 1287: 3 };

@Injectable()
export class NpcRpc implements OnModuleInit {
  constructor(
    private readonly gameData: GameDataService,
    private readonly npcs: NpcService,
    private readonly quests: QuestService,
    private readonly loops: LoopService,
    private readonly shops: ShopService,
    private readonly transport: SceneTransportService,
    private readonly questBattle: QuestBattleService,
    private readonly bosses: LoopBossService,
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly auctions: AuctionViewService,
    private readonly credit: CreditShopService,
    private readonly guildShop: GuildShopService,
  ) {}

  onModuleInit(): void {
    // Go open_npc_interaction_<npc>: the "Nhiệm vụ" entry of a scripted menu opens the ordinary NPC dialog.
    this.hooks.onScript('npc-interaction', async (session, func) => {
      const m = /^open_npc_interaction_(\d+)$/.exec(func);
      const npc = m ? this.gameData.getNpc(Number(m[1])) : undefined;
      if (!m) return false;
      if (npc && Number(npc.pos_map_id) === session.mapId) await this.openDialog(session, npc);
      return true;
    }, 10);
  }

  @Rpc('clickNpc', { requireCharacter: true, forbidInBattle: true })
  async clickNpc(session: Session, args: unknown[]): Promise<null> {
    const inst = await this.instanceOf(session, args);
    if (inst) {
      await this.hooks.runClick(session, inst); // an unclaimed instance NPC has nothing to say
      return null;
    }
    const npc = await this.npcOnMap(session, args);
    if (await this.hooks.runClick(session, npcRefOf(npc))) return null;
    const teleportMap = CLICK_TELEPORT_NPCS[Number(npc.id)];
    if (teleportMap !== undefined) {
      await this.teleport(session, teleportMap);
      return null;
    }
    if (Number(npc.type) === NpcType.MAIL) {
      session.callback('initViewMailMngP'); // Go mail_npc.go: the Thùng Thư NPC opens the mailbox directly
      return null;
    }
    if (Number(npc.type) === NpcType.AUCTION) {
      await this.openAuction(session, Number(npc.id)); // Go auction_npc.go: onInitViewAuctionP with the seller's own listings
      return null;
    }
    if (await this.openCreditShop(session, npc)) return null; // Go credit_shop_npc.go: openShopById replaces the dialog
    if (await this.questBattle.tryStart(session, npc)) return null; // onBattleStart replaces the dialog
    await this.openDialog(session, npc);
    return null;
  }

  /** NPCs of the credit point shops (CREDIT_SHOP_NPCS): pushes openShopById(OpenCreditShop); false for any other NPC. */
  private async openCreditShop(session: Session, npc: Row): Promise<boolean> {
    const shopId = CREDIT_SHOP_NPCS[Number(npc.id)];
    if (shopId === undefined) return false;
    const data = await this.credit.buildOpen(session.characterId!, shopId);
    if (!data) throw RpcException.notFound('shop');
    session.callback('openShopById', data);
    return true;
  }

  private async openAuction(session: Session, npcId: number): Promise<void> {
    const view: InitViewAuction = { flag: true, npcId, myAuctionList: await this.auctions.mine(session.characterId!) };
    session.callback('onInitViewAuctionP', view);
  }

  /** Quest list + function dialog (npcFuncInit), or the shop directly for a shop NPC without quests / takeable loops. */
  private async openDialog(session: Session, npc: Row): Promise<void> {
    const quests = await this.quests.listForNpc(session.characterId!, Number(npc.id));
    // Legacy npc_click.go: a shop NPC without quests (or takeable loops) opens the shop directly, no npcFuncInit.
    const loopInfo = await this.loops.infoForNpc(session.characterId!, Number(npc.id));
    if (this.shopIdOf(npc) > 0 && Object.keys(quests.list).length === 0 && !Object.values(loopInfo.d ?? {}).some((l) => l.canTake)) {
      await this.openShop(session, npc);
      return;
    }
    session.callback('npcFuncInit', this.npcs.buildFuncInit(npc, quests, loopInfo));
  }

  /** Function button of the NPC dialog (Flash NpcFuncPanel): opens the NPC's shop. */
  @Rpc('npcFuncClick', { requireCharacter: true, forbidInBattle: true })
  async npcFuncClick(session: Session, args: unknown[]): Promise<null> {
    const npc = await this.npcOnMap(session, args);
    if (await this.openCreditShop(session, npc)) return null;
    if (this.shopIdOf(npc) > 0) {
      await this.openShop(session, npc);
    } else if (Number(npc.type) === NpcType.MAIL) {
      session.callback('initViewMailMngP');
    } else if (Number(npc.type) === NpcType.AUCTION) {
      await this.openAuction(session, Number(npc.id));
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

  /**
   * A per-viewer instance NPC with this id on the caller's map, as a hook target. Ids of data_tbl_npc rows standing on the map
   * are ordinary NPCs; dungeon spawns reuse their template id on another map (Go: map-200 spawn templates).
   */
  private async instanceOf(session: Session, args: unknown[]): Promise<NpcRef | null> {
    const id = Number(args[0]);
    if (!Number.isInteger(id) || Number(this.gameData.getNpc(id)?.pos_map_id ?? -1) === session.mapId) return null;
    const n = await this.instances.find(session, id);
    return n ? { id: n.id, nid: n.nid, mapId: n.map, x: n.posX, y: n.posY, type: n.type, instance: n } : null;
  }

  private async npcOnMap(session: Session, args: unknown[]): Promise<Row> {
    const npcId = Number(args[0]);
    if (!Number.isInteger(npcId)) throw RpcException.invalidArgs('npcId');
    const npc = this.gameData.getNpc(npcId);
    if (!npc) throw RpcException.notFound('npc');
    if (Number(npc.pos_map_id) === session.mapId) return npc;
    if (!(await this.bosses.present(session.characterId!, session.mapId, npcId))) throw RpcException.notFound('npc');
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
    if (this.shopIdOf(npc) === GUILD_SHOP_ID) {
      // Go guild_shop_gate.go: members of a level >= 3 guild only, otherwise a note and no shop
      const note = await this.guildShop.gate(session.characterId!);
      if (note) {
        session.callback('onSystemMidMsgOrNote', note);
        return;
      }
    }
    const data = await this.shops.buildOpenShop(this.shopIdOf(npc), Number(npc.id));
    if (!data) throw RpcException.notFound('shop');
    session.callback('onOpenShop', data);
  }
}

export function npcRefOf(npc: Row): NpcRef {
  const id = Number(npc.id);
  return { id, nid: id, mapId: Number(npc.pos_map_id ?? 0), x: Number(npc.pos_x ?? 0), y: Number(npc.pos_y ?? 0), type: Number(npc.type ?? 0) };
}
