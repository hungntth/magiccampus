// Award bags (legacy awardEffectHandler, application/item/effect_award*.go): a template with data_tbl_item_award rows opens into a
// pick of those rows. Order: filter rows (married, class) -> gold check (largest payload.costGold, non-bound gold) -> pick (guaranteed
// rows + weighted draws) -> room check for every picked item and pet -> spend gold -> consume one bag unit -> grant. Items and
// equipment inherit the bag's bind. Row types: 12 pet (quality = grow rate), 19 equipment, 29 item, 30 basic currency, 31 exp,
// 33 title, 35 game currency; 32 buff / 34 skill / 36 medal / 37 dress material do not occur in the imported data and are skipped.
// Not ported: equipment prefix attributes (pre_name_type, quality > 0 stat rolls) and payload.mwVong (magic weapon vong).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ITEM_USE_TEXT, itemUseText } from '@mc/shared';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { PetService } from '../pet/pet.service';
import { GrantService } from '../rewards/grant.service';
import { awardGoldCost, filterClassRows, filterMarriedRows, pickItemAwards, randIntOf } from '../rewards/item-award';
import { resolveMedalGrant } from '../title/title-medal';
import { TitleService } from '../title/title.service';
import { buildAwardPlan, type AwardPlan } from './award-plan';
import { nameOf, note } from './open-helpers';
import { PushCollector } from './push-collector';

@Injectable()
export class AwardBagService {
  private readonly logger = new Logger(AwardBagService.name);

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly grants: GrantService,
    private readonly pets: PetService,
    private readonly titles: TitleService,
  ) {}

  /** Legacy CanHandle: the template has at least one award row (overlays included). */
  canHandle(templateId: number): boolean {
    return this.instanceData.itemAwardRows(templateId).length > 0;
  }

  async open(ctx: ItemConsumeCtx): Promise<Push[]> {
    const cid = ctx.characterId;
    const married = filterMarriedRows(this.instanceData.itemAwardRows(ctx.templateId), false); // no marriage system: single
    const rows = filterClassRows(married, ctx.classId);
    if (!rows || rows.length === 0) return [note(ITEM_USE_TEXT.CANNOT_USE)];
    const cost = awardGoldCost(rows);
    if (cost > 0 && ((await this.chars.findById(cid, { gold: 1 }).lean())?.gold ?? 0) < cost) return [note(ITEM_USE_TEXT.NEED_GOLD)];

    const rng = Math.random;
    const plan = buildAwardPlan(pickItemAwards(rows, randIntOf(rng)), (r) => this.grants.fromAwardRow(r, rng, { bound: ctx.bound, nested: false }));
    for (const r of plan.skipped) this.logger.log(`award row ${r.id}: type ${r.type} (${r.awardId}) has no H5 grant, skipped`);
    const petCount = plan.pets.reduce((s, p) => s + p.count, 0);
    if (plan.grants.length === 0 && petCount === 0 && plan.titles.length === 0) return [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
    const expired = plan.titles.some((id) => this.titleGrant(ctx, id).expired);
    if (expired) return [note(ITEM_USE_TEXT.CANNOT_USE)]; // an expired event medal grants nothing and is kept
    if (!(await this.grants.fits(cid, plan.grants)) || (petCount > 0 && !(await this.pets.hasRoom(cid, petCount)))) {
      return [note(ITEM_USE_TEXT.NO_ROOM)];
    }

    let gold: number | null = null;
    if (cost > 0) {
      const spent = await this.chars.findOneAndUpdate({ _id: cid, gold: { $gte: cost } }, { $inc: { gold: -cost } }, { new: true, projection: { gold: 1 } }).lean();
      if (!spent) return [note(ITEM_USE_TEXT.NEED_GOLD)];
      gold = spent.gold;
    }
    let slot: Push[];
    try {
      slot = await ctx.consume(); // spend before credit: the bag unit goes first, the contents follow
    } catch (e) {
      if (cost > 0) await this.chars.updateOne({ _id: cid }, { $inc: { gold: cost } });
      throw e;
    }
    return [...slot, ...(await this.deliver(ctx, plan, cost, gold))];
  }

  private titleGrant(ctx: ItemConsumeCtx, titleId: number): { seconds: number; expired: boolean } {
    const kind = Number(this.gameData.getTitle(titleId)?.k ?? 0);
    return resolveMedalGrant(String(ctx.tpl.name ?? ''), String(ctx.tpl.description ?? ''), Number(ctx.tpl.t ?? 0), kind, Date.now());
  }

  /** Grants the plan after the bag unit was consumed: note, items / money / exp / currencies, pets, titles, the gold charge. */
  private async deliver(ctx: ItemConsumeCtx, plan: AwardPlan, cost: number, gold: number | null): Promise<Push[]> {
    const cid = ctx.characterId;
    const out = new PushCollector(cid);
    const granted = await this.grants.grant(out, plan.grants);
    if (!granted) this.logger.warn(`char ${cid}: bag ${ctx.templateId} granted only part of its contents (the bag is consumed)`);
    const petPushes: Push[] = [];
    let petsGiven = 0;
    for (const p of plan.pets) {
      for (let i = 0; i < p.count; i++) {
        const wrapper = await this.pets.award(cid, p.templateId, { ...(p.growRate > 0 ? { growRate: p.growRate } : {}), bind: ctx.bound });
        if (wrapper) {
          petPushes.push(push('onAddPet', wrapper));
          petsGiven++;
        } else this.logger.warn(`char ${cid}: pet ${p.templateId} from bag ${ctx.templateId} was not created`);
      }
    }
    let titleMessage = '';
    for (const id of plan.titles) {
      const grant = this.titleGrant(ctx, id);
      const result = await this.titles.grantFor(cid, id, grant.seconds);
      if (result.changed && !titleMessage) {
        const who = (await this.chars.findById(cid, { name: 1 }).lean())?.name ?? 'Bạn';
        titleMessage = itemUseText(ITEM_USE_TEXT.GOT_TITLE, who, String(this.gameData.getTitle(id)?.n ?? id));
      }
    }
    const message = plan.expMessage > 0
      ? itemUseText(ITEM_USE_TEXT.GOT_EXP, plan.expMessage)
      : titleMessage || (plan.grants.some((g) => g.kind === 'item') || petsGiven > 0 ? itemUseText(ITEM_USE_TEXT.OPENED, nameOf(ctx)) : '');
    const pushes: Push[] = [...(message ? [note(message)] : []), ...out.pushes, ...petPushes];
    if (cost > 0 && gold !== null) pushes.push(push('onAddMoney', cid, 'gold', -cost, gold), push('onUPP', { gold }));
    this.logger.log(`char ${cid} opened bag ${ctx.templateId}: ${plan.grants.length} grants, ${petsGiven} pets, ${plan.titles.length} titles, gold ${cost}`);
    return pushes;
  }
}
