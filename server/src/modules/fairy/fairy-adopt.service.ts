// Tiểu Tinh Linh sources (Go handlers/npc/fairy.go + npc_script.go, application/item/effect_fairy_bag.go): NPC 1726 Sứ Giả Tinh Linh Thủ Hộ
// menu (free Thiên Sứ Poli -> onAddFairy, "Mua Tinh Linh khác" -> onOpenShop 96, the guide sub-menu), the fairy gift bags (type 550 through the
// item-use registry, one fairy per template, an owned one keeps the bag) and the bag note of the skill books (learned inside the fairy
// window; 3583 is use_type 4, refused by useItem before the handlers).
// `adoptLocked` writes the feature store directly: callers hold the character lock (useItem holds it for item handlers).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { FAIRY, FAIRY_BAG_TIDS, FAIRY_SKILL_BOOKS, FAIRY_TEXT, NPC_SCRIPT_CLOSE, type FairyInfo } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { ItemUseRegistry } from '../item-use/item-use.registry';
import { note } from '../item-use/open-helpers';
import { npcMsg, sendList } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { ShopService } from '../shop/shop.service';
import { fairyWire, newFairy, nextFairyId } from './fairy-state';
import { FairyService } from './fairy.service';

/** NPC 1726 menu funcs and texts (Go npc_click.go:372-390, npc_script.go:452-490). */
export const FAIRY_MENU = {
  ADOPT: 'adopt_free_fairy',
  SHOP: 'buy_other_fairy',
  INFO: 'fairy_info',
  INTRO: 'Các Tiểu Tinh Linh khi mang bên mình không những trợ giúp sức mạnh cho các chủ nhân mà còn là 1 người bạn đồng hành lý tưởng.',
  OPTIONS: [
    { label: 'Miễn phí nhận nuôi Tinh Linh ( Thiên sứ )', func: 'adopt_free_fairy' },
    { label: 'Mua Tinh Linh khác', func: 'buy_other_fairy' },
    { label: 'Tìm hiểu thông tin về Tiểu Tinh Linh', func: 'fairy_info' },
  ],
  INFO_TEXT: 'Tìm hiểu các thông tin về Tiểu Tinh Linh:',
  GUIDES: [
    { label: 'Nhận Tiểu Tinh Linh', func: 'adopt_free_fairy', text: '' },
    {
      label: 'Thăng cấp Tiểu Tinh Linh', func: 'fairy_level_up',
      text: '【Thăng Cấp Tinh Linh】 Cấp độ ban đầu của Tiểu Tinh Linh là 1 và có thể tăng đến cấp 20. Thông qua [Quả Tinh Linh] để có thể tăng kinh nghiệm cho các tinh linh, khi điểm kinh nghiệm đạt đến độ nhất định, tinh linh sẽ được thăng cấp. {Quả Tinh Linh} này có thể dùng điểm đấu pet để đổi ở Shop Điểm Thưởng Giác Đấu Đông Huyền.',
    },
    {
      label: 'Nuôi dưỡng Tiểu Tinh Linh', func: 'fairy_feed',
      text: '【Nuôi Dưỡng Tinh Linh】 Khi các tinh linh trong trạng thái thủ hộ, tùy thuộc vào số lần chiến đấu mà giảm Độ no. Thông qua việc Cho Ăn các nguyên liệu chế tạo để tăng Độ no này. Độ no càng cao thì lực thủ hộ của tinh linh sẽ càng mạnh và trợ thủ thuộc tính cho nhân vật càng nhiều.',
    },
    {
      label: 'Cường hóa Tiểu Tinh Linh', func: 'fairy_enhance',
      text: '【Cường Hóa Tinh Linh】 Thông qua các cách nuôi dưỡng Tinh Linh mà tăng thuộc tính trưởng thành cho nó. Mỗi lần nuôi dưỡng tinh linh sẽ tăng được điểm trưởng thành. Khi điểm trưởng thành đầy thì tăng được cấp độ trưởng thành cho tinh linh cũng như có hệ số thuộc tính của tinh linh. Cấp độ trưởng thành được chia thành 5 giai đoạn (trắng -> lục -> lam -> tím -> cam). Mỗi giai đoạn chia từ cấp 1 - 10. Cứ tăng lên được 1 giai đoạn thì Lực thủ hộ cũng tăng theo.',
    },
    {
      label: 'Cách thủ hộ chủ nhân', func: 'fairy_guard_guide',
      text: '【Cách Thủ Hộ Chủ Nhân】 Sau khi tinh linh ở trạng thái {Thủ hộ} thì có thể tăng 5 thuộc tính của bản thân (nhẫn, lực, xảo, thần, trí). Thuộc tính của tinh linh và Lực Thủ Hộ càng cao thì thuộc tính cộng thêm cho nhân vật chủ nhân sẽ càng nhiều.',
    },
  ],
} as const;

@Injectable()
export class FairyAdoptService implements OnModuleInit {
  constructor(
    private readonly fairies: FairyService,
    private readonly gameData: GameDataService,
    private readonly hooks: NpcHookRegistry,
    private readonly items: ItemUseRegistry,
    private readonly shops: ShopService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('fairy-npc', (s, npc) => {
      if (npc.nid !== FAIRY.NPC_ID || npc.instance) return false;
      sendList(s, FAIRY.NPC_ID, this.gameData.getNpc(FAIRY.NPC_ID)?.name?.toString() ?? FAIRY_TEXT.TITLE, FAIRY_MENU.INTRO, [...FAIRY_MENU.OPTIONS]);
      return true;
    }, 60);
    this.hooks.onScript('fairy-npc', (s, func) => this.script(s, func), 60);
    this.items.addTemplate(Object.keys(FAIRY_BAG_TIDS).map(Number), (ctx) => this.openBag(ctx));
    this.items.addTemplate(Object.keys(FAIRY_SKILL_BOOKS).map(Number), async () => [note(FAIRY_TEXT.USE_IN_PANEL)]);
  }

  /**
   * Adds a fairy of template `tid` (one per template, Go Adopt). The caller holds the character lock. `before` runs after validation and before
   * the write (the gift bag is spent there: spend before credit).
   */
  async adoptLocked(cid: number, tid: number, before?: () => Promise<void>): Promise<FairyInfo | { error: string }> {
    const tpl = this.gameData.fairyTemplate(tid);
    if (!tpl) return { error: FAIRY_TEXT.WRONG_ITEM };
    const state = await this.fairies.load(cid);
    if ([...state.fairies.values()].some((f) => f.tid === tid)) return { error: FAIRY_TEXT.ALREADY_OWNED };
    const f = newFairy(nextFairyId(state), tpl, this.fairies.day());
    if (before) await before();
    state.fairies.set(f.id, f);
    await this.fairies.save(cid, state);
    return fairyWire(f);
  }

  /** Adopt with the lock (NPC menu, gmGrant): onAddFairy + a note; refusals answer the note only. */
  async adopt(session: Session, tid: number, say: (text: string) => void): Promise<FairyInfo | null> {
    const res = await withCharLock(session.characterId!, () => this.adoptLocked(session.characterId!, tid));
    if ('error' in res) {
      say(res.error);
      return null;
    }
    session.callback('onAddFairy', res);
    say(FAIRY_TEXT.ADOPTED);
    return res;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    const npcSay = (text: string): void => npcMsg(session, FAIRY.NPC_ID, text);
    const here = Number(this.gameData.getNpc(FAIRY.NPC_ID)?.pos_map_id ?? -1) === session.mapId; // H5: the menu picks need the NPC's map
    if ((func === FAIRY_MENU.ADOPT || func === FAIRY_MENU.SHOP) && !here) return true;
    if (func === FAIRY_MENU.ADOPT) {
      await this.adopt(session, FAIRY.FREE_TID, npcSay);
      return true;
    }
    if (func === FAIRY_MENU.SHOP) {
      const npc = this.gameData.getNpc(FAIRY.NPC_ID);
      const data = await this.shops.buildOpenShop(Number(npc?.shop_id ?? 0) || FAIRY.SHOP_ID, FAIRY.NPC_ID);
      if (!data) throw RpcException.notFound('shop');
      session.callback('onOpenShop', data);
      return true;
    }
    if (func === FAIRY_MENU.INFO) {
      sendList(session, FAIRY.NPC_ID, FAIRY_TEXT.TITLE, FAIRY_MENU.INFO_TEXT, [
        ...FAIRY_MENU.GUIDES.map((g) => ({ label: g.label, func: g.func })), { label: 'Đóng', func: NPC_SCRIPT_CLOSE },
      ]);
      return true;
    }
    const guide = FAIRY_MENU.GUIDES.find((g) => g.func === func && g.text !== '');
    if (!guide) return false;
    npcSay(guide.text);
    return true;
  }

  /** Fairy gift bag (useItem, inside the character lock): validate, spend the bag, add the fairy, onAddFairy. An owned fairy keeps the bag. */
  private async openBag(ctx: ItemConsumeCtx): Promise<Push[]> {
    let slot: Push[] = [];
    const res = await this.adoptLocked(ctx.characterId, FAIRY_BAG_TIDS[ctx.templateId], async () => {
      slot = await ctx.consume();
    });
    if ('error' in res) return [note(res.error)];
    return [...slot, push('onAddFairy', res), note(FAIRY_TEXT.BAG_GOT(res.name))];
  }
}
