// Pet gear Thang cap (petEquLevelUp) and Doi mau (petEquModColor). Validate everything, charge silver, spend the shards, then
// write the piece (refusals charge nothing). Tier-up keeps the item id and swaps the template; recolour rolls MODCOLOR_REQ_NUM[colour]
// and spends the shards either way. Replies follow the Go handlers (legacy pet_equip_upgrade.go); a refusal answers {flag:false, msg}.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  petEquipColorPlan, petEquipLevelUpPlan, petEquipUpgradeSilver, type PetEquLevelUpReply, type PetEquModColorReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { push, type Push } from '../inventory/pushes';
import { PetMaterialService } from '../pet/pet-materials.service';
import { int } from './forge-guard';
import { ForgeMoneyService, type Charge } from './forge-money.service';
import { PET_EQU_TEXT, petEquColorNote, petGearLineSet } from './pet-gear-up-rules';
import { PetGearOpsService } from './pet-gear-ops.service';
import type { Out } from './refine.service';

@Injectable()
export class PetGearUpService {
  private readonly logger = new Logger(PetGearUpService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly ops: PetGearOpsService,
    private readonly money: ForgeMoneyService,
    private readonly mats: PetMaterialService,
  ) {}

  /** Injectable random source (tests replace it); a class field because Nest cannot inject a function parameter. */
  rng: () => number = Math.random;

  levelUp(characterId: number, equipId: number): Promise<Out<PetEquLevelUpReply>> {
    return withCharLock(characterId, async () => {
      const gear = await this.ops.load(characterId, equipId);
      const nextId = int(gear.tpl.next_equ_tid);
      const next = nextId > 0 ? await this.gameData.template(19, nextId) : undefined;
      const plan = petEquipLevelUpPlan(int(gear.tpl.req_level), gear.special);
      if (!next || !plan) throw RpcException.forbidden(PET_EQU_TEXT.invalid);
      const cost = petEquipUpgradeSilver(int(next.req_level));
      const spent = await this.spend(characterId, plan.itemId, plan.num, cost);
      const endure = int(next.endure_max);
      const set: Record<string, unknown> = { templateId: nextId, ...petGearLineSet(next, gear.color) };
      if (endure > 0) Object.assign(set, { durability: endure, maxDurability: endure });
      const done = await this.items.updateOne({ _id: equipId, characterId, templateId: gear.row.templateId }, { $set: set });
      if (done.modifiedCount !== 1) throw RpcException.forbidden(PET_EQU_TEXT.busy); // shards and silver are already spent; the piece changed under us
      const left = await this.mats.countTemplate(characterId, plan.itemId);
      const view = await this.ops.view(characterId, equipId);
      const nextOfNext = int(next.next_equ_tid) > 0 && (await this.gameData.template(19, int(next.next_equ_tid))) ? int(next.next_equ_tid) : -1;
      this.logger.log(`petEquLevelUp char ${characterId} item ${equipId} ${gear.row.templateId} -> ${nextId} shards ${plan.num} silver ${cost}`);
      return {
        reply: { flag: true, i: equipId, tid: nextId, sid: view.sid, next: nextOfNext, num: left },
        pushes: [...spent, ...await this.ops.instancePushes(characterId, gear.row)],
      };
    });
  }

  modColor(characterId: number, equipId: number): Promise<Out<PetEquModColorReply>> {
    return withCharLock(characterId, async () => {
      const gear = await this.ops.load(characterId, equipId);
      const plan = petEquipColorPlan(gear.color, gear.special);
      if (!plan) throw RpcException.forbidden(PET_EQU_TEXT.invalid); // already orange
      const cost = petEquipUpgradeSilver(int(gear.tpl.req_level));
      const spent = await this.spend(characterId, plan.itemId, plan.num, cost);
      const success = Math.floor(this.rng() * 100) < plan.rate;
      if (!success) {
        this.logger.log(`petEquModColor char ${characterId} item ${equipId} colour ${gear.color} failed (rate ${plan.rate}) shards ${plan.num}`);
        return {
          reply: { flag: false, num: plan.num, msg: PET_EQU_TEXT.colorFail },
          pushes: [...spent, push('onSystemMidMsgOrNote', petEquColorNote(false, gear.color))],
        };
      }
      const color = gear.color + 1;
      const done = await this.items.updateOne(
        { _id: equipId, characterId, colorCode: gear.row.colorCode }, { $set: { colorCode: color, ...petGearLineSet(gear.tpl, color) } },
      );
      if (done.modifiedCount !== 1) throw RpcException.forbidden(PET_EQU_TEXT.busy);
      const view = await this.ops.view(characterId, equipId);
      if (color === 4) this.announce(characterId, String(gear.tpl.name ?? ''));
      this.logger.log(`petEquModColor char ${characterId} item ${equipId} colour ${gear.color} -> ${color} shards ${plan.num}`);
      return {
        reply: { flag: true, i: equipId, c: color, sid: view.sid, num: plan.num },
        pushes: [...spent, ...await this.ops.instancePushes(characterId, gear.row, gear.color), push('onSystemMidMsgOrNote', petEquColorNote(true, color))],
      };
    });
  }

  /** Checks shards and silver, then charges silver and consumes the shards (silver is refunded when the shard take fails). */
  private async spend(characterId: number, itemId: number, count: number, cost: number): Promise<Push[]> {
    if ((await this.mats.countTemplate(characterId, itemId)) < count) throw RpcException.forbidden(PET_EQU_TEXT.noShard);
    const charge: Charge | null = await this.money.spend(characterId, cost);
    if (!charge) throw RpcException.forbidden(PET_EQU_TEXT.noMoney);
    try {
      return [...await this.mats.consumeTemplate(characterId, itemId, count), ...this.money.pushes(charge)];
    } catch (e) {
      await this.money.refund(characterId, charge);
      throw e;
    }
  }

  /** CALLBACK_S[26] for a piece that turned orange (plain text; the H5 chat has no item link token yet). */
  private announce(characterId: number, itemName: string): void {
    this.mats.announce(characterId, (player) => `Chúc mừng ${player} đã nhận được ${itemName}`)
      .catch((e: unknown) => this.logger.warn(`pet gear colour announce failed: ${(e as Error).message}`));
  }
}
