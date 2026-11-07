// useItem for title medals (type 550 "Huy Chương …"): registered as a UseItemService hook. The title comes from the
// medal's data_tbl_item_award type 33 row, else from its description ("… danh hiệu X"); the grant length from the medal
// (resolveMedalGrant). Legacy: item/effect_award_title.go + effect_desc_title.go.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import { pickItemAwards, randIntOf } from '../rewards/item-award';
import { push, type Push } from '../inventory/pushes';
import { UseItemService, type ItemUseCtx } from '../inventory/use-item.service';
import { descTitleKey, ITEM_AWARD_TITLE, resolveMedalGrant, TEACHER_MEDAL_TITLES, titleKey } from './title-medal';
import { TitleService } from './title.service';

const ITEM_TYPE_OTHER = 550;
const note = (msg: string): Push => push('onSystemMidMsgOrNote', msg);

@Injectable()
export class TitleMedalService implements OnModuleInit {
  private readonly logger = new Logger(TitleMedalService.name);
  private byKey: Map<string, number[]> | null = null;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly useItem: UseItemService,
    private readonly titles: TitleService,
  ) {}

  onModuleInit(): void {
    this.useItem.addUseHook((ctx) => this.use(ctx));
  }

  /** Title id a medal grants, or null when the item is not a title medal. */
  titleOf(tpl: Record<string, unknown>): number | null {
    if (Number(tpl.type) !== ITEM_TYPE_OTHER) return null;
    const teacher = TEACHER_MEDAL_TITLES[Number(tpl.id)];
    if (teacher !== undefined) return this.gameData.getTitle(teacher) ? teacher : null;
    const rows = this.instanceData.itemAwardRows(Number(tpl.id));
    if (rows.length > 0) {
      // Award-row medals: every shipped type 33 bag is title-only; a mixed bag is not a medal.
      if (!rows.every((r) => r.type === ITEM_AWARD_TITLE)) return null;
      const pick = pickItemAwards(rows, randIntOf(Math.random))[0];
      return pick && this.gameData.getTitle(pick.awardId) ? pick.awardId : null;
    }
    const key = descTitleKey(String(tpl.description ?? ''));
    const ids = key ? this.titleIndex().get(key) : undefined;
    return ids && ids.length === 1 ? ids[0] : null; // an ambiguous name grants nothing (legacy)
  }

  private titleIndex(): Map<string, number[]> {
    if (this.byKey) return this.byKey;
    const out = new Map<string, number[]>();
    for (const t of this.gameData.allTitles()) {
      const key = titleKey(String(t.n ?? ''));
      if (!key) continue;
      out.set(key, [...(out.get(key) ?? []), Number(t.id)]);
    }
    this.byKey = out;
    return out;
  }

  private async use(ctx: ItemUseCtx): Promise<Push[] | null> {
    const tpl = await this.gameData.template(29, ctx.templateId);
    const titleId = tpl ? this.titleOf(tpl) : null;
    if (!tpl || titleId === null) return null;
    if (ctx.level < ctx.reqLevel) return [note('Cấp độ bạn chưa đủ!')];
    const title = this.gameData.getTitle(titleId);
    const titleName = String(title?.n ?? titleId);
    const grant = resolveMedalGrant(
      String(tpl.name ?? ''), String(tpl.description ?? ''), Number(tpl.t ?? 0), Number(title?.k ?? 0), Date.now(),
    );
    if (grant.expired) return [note('Vật phẩm này đã hết hạn sử dụng!')]; // legacy: nothing granted, medal kept
    // H5: an owned permanent title is not re-granted and the medal is kept (legacy consumed it for nothing).
    if (!(await this.titles.wouldChange(ctx.characterId, titleId, grant.seconds))) {
      return [note(`Bạn đã có danh hiệu ${titleName}.`)];
    }
    const slot = await ctx.consume(); // spend before credit
    await this.titles.grantFor(ctx.characterId, titleId, grant.seconds);
    this.logger.log(`char ${ctx.characterId} used medal ${ctx.templateId} -> title ${titleId} (${grant.seconds}s)`);
    const name = (await this.chars.findById(ctx.characterId, { name: 1 }).lean())?.name ?? 'Bạn';
    return [...slot, note(`${name} nhận được danh hiệu ${titleName}!`)];
  }
}
