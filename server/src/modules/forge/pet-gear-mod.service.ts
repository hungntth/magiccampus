// Pet gear Doi khoa (petEquModBind / surepetEquModBind) and Tai thiet lap (petEquModPre / surePetEquModPre). Both need bound gear
// and 30000 silver; the material stack the client placed and the silver are spent at the PREVIEW (no refund on a rejected roll, like
// Go). The roll is the two bind percentages 1..min(30, round(bindPropNum x colour multiplier)); the sure call writes them.
// Pre keeps the main / extra lines (pet gear lines are already the colour maximum) and only re-rolls the bind values.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PET_EQUIP_MOD_MONEY, PET_EQUIP_PRE_MIN_COLOR, isPipedReqClassId, petEquipBindMax, petEquipBindPlan, petEquipPrePlan, rollPetEquipBind,
  type BagItem, type PetEquBindPreview, type PetEquPrePreview, type SurePetEquBindReply, type SurePetEquPreReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { int, refuseIf } from './forge-guard';
import { ForgeItemsService, type Consumed } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import { PET_EQU_TEXT, petEquCurrentBind } from './pet-gear-up-rules';
import { PetGearOpsService, type PetGear } from './pet-gear-ops.service';
import { RefinePending } from './refine-pending';
import type { Out } from './refine.service';

export type PetModKind = 'bind' | 'pre';

@Injectable()
export class PetGearModService {
  private readonly logger = new Logger(PetGearModService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly ops: PetGearOpsService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
    private readonly pending: RefinePending,
  ) {}

  /** Random source (tests replace it); a field because Nest cannot inject a function parameter. */
  rng: () => number = Math.random;

  bindPreview(characterId: number, equipId: number, materialId: number): Promise<Out<PetEquBindPreview>> {
    return withCharLock(characterId, async () => {
      const run = await this.preview(characterId, equipId, materialId, 'bind');
      const [b1, b2] = petEquCurrentBind(run.gear.tpl, run.gear.row.properties ?? {});
      this.pending.set(characterId, { kind: 'petBind', equipId, b1: run.n1, b2: run.n2 });
      return { reply: { f: true, ii: materialId, n: run.left, b1, b2, b11: run.n1, b12: run.n2 }, pushes: run.pushes };
    });
  }

  prePreview(characterId: number, equipId: number, materialId: number): Promise<Out<PetEquPrePreview>> {
    return withCharLock(characterId, async () => {
      const run = await this.preview(characterId, equipId, materialId, 'pre');
      this.pending.set(characterId, { kind: 'petPre', equipId, b1: run.n1, b2: run.n2 });
      const oldIns = await this.ops.view(characterId, equipId);
      const newIns: BagItem = { ...oldIns, lines: { ...oldIns.lines, bindMainPropNum1: run.n1, bindMainPropNum2: run.n2 } };
      return { reply: { f: true, i: equipId, ii: materialId, n: run.left, oldIns, newIns }, pushes: run.pushes };
    });
  }

  sureBind(characterId: number, decision: number): Promise<Out<SurePetEquBindReply>> {
    return this.sure<SurePetEquBindReply>(characterId, decision, 'petBind', { f: 'false' }, (applied) => ({ f: 'sure', b1: applied.b1, b2: applied.b2 }));
  }

  surePre(characterId: number, decision: number): Promise<Out<SurePetEquPreReply>> {
    return this.sure<SurePetEquPreReply>(characterId, decision, 'petPre', { f: 'false' }, (_applied, view) => ({ f: 'sure', n: view }));
  }

  /** Validates, then charges the silver and the material stack; returns the roll. Throws the refusal (nothing charged). */
  private async preview(characterId: number, equipId: number, materialId: number, kind: PetModKind) {
    const gear = await this.ops.load(characterId, equipId, PET_EQU_TEXT.badMaterial);
    refuseIf(!gear.row.isBound && PET_EQU_TEXT.notBound);
    refuseIf(kind === 'pre' && gear.color < PET_EQUIP_PRE_MIN_COLOR && PET_EQU_TEXT.needColor);
    const bindMax = petEquipBindMax(Number(gear.tpl.bind_prop_num ?? 0), gear.color);
    const piped = isPipedReqClassId(gear.tpl.req_class_id);
    const plan = kind === 'bind'
      ? petEquipBindPlan(int(gear.tpl.req_level), gear.special, piped)
      : petEquipPrePlan(gear.color, gear.special, piped);
    if (bindMax <= 0 || !plan) throw RpcException.forbidden(PET_EQU_TEXT.invalid);
    const stack = await this.forgeItems.stack(characterId, materialId, plan.itemId, plan.num);
    if (!stack) throw RpcException.forbidden(PET_EQU_TEXT.noShard);
    const charge = await this.money.spend(characterId, PET_EQUIP_MOD_MONEY);
    if (!charge) throw RpcException.forbidden(PET_EQU_TEXT.noMoney);
    let spent: Consumed;
    try {
      spent = await this.forgeItems.consume(characterId, [{ id: materialId, count: plan.num }]);
    } catch (e) {
      await this.money.refund(characterId, charge);
      throw e;
    }
    const [n1, n2] = rollPetEquipBind(bindMax, int(gear.tpl.main_prop1), int(gear.tpl.main_prop2), this.rng);
    this.logger.log(`petEqu ${kind} preview char ${characterId} item ${equipId} colour ${gear.color} max ${bindMax} -> ${n1}/${n2}`);
    return { gear, n1, n2, left: spent.left.get(materialId) ?? 0, pushes: [...spent.pushes, ...this.money.pushes(charge)] };
  }

  /** Applies (decision > 0) or drops the pending roll of `kind`; any miss answers the "false" shape and applies nothing. */
  private sure<R>(
    characterId: number, decision: number, kind: 'petBind' | 'petPre', failReply: R,
    reply: (applied: { b1: number; b2: number }, view: BagItem) => R,
  ): Promise<Out<R>> {
    return withCharLock(characterId, async (): Promise<Out<R>> => {
      const pending = this.pending.take(characterId, kind);
      const failed: Out<R> = { reply: failReply, pushes: [] };
      if (!pending || decision <= 0) return failed;
      let gear: PetGear;
      try {
        gear = await this.ops.load(characterId, pending.equipId);
      } catch (e) {
        if (e instanceof RpcException) return failed;
        throw e;
      }
      const b1 = Math.min(30, Math.max(0, pending.b1));
      const b2 = Math.min(30, Math.max(0, pending.b2));
      await this.items.updateOne(
        { _id: pending.equipId, characterId },
        { $set: { 'properties.bindMainPropNum1': b1, 'properties.bindMainPropNum2': b2, 'properties.petGear': 1 } },
      );
      const view = await this.ops.view(characterId, pending.equipId);
      this.logger.log(`petEqu ${kind} applied char ${characterId} item ${pending.equipId} -> ${b1}/${b2}`);
      return { reply: reply({ b1, b2 }, view), pushes: await this.ops.instancePushes(characterId, gear.row) };
    });
  }
}
