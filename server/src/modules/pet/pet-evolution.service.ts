// M12 Phase B: handbook activation (natural energy or VIP gold), pet evolution and feather progression (with Bua Cau Nguyen
// protection). Contract training is PetContractService. evolve / feather / featherJump return the legacy reply plus the ordered
// pushes (onRefreshPetProp: the aptitudes changed).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FEATHER_PROTECT_ITEM, FEATHER_SUCCESS, featherAtCap, featherAttempt, featherNextStep, featherNpCost, featherProtectNeed, hasFeatherTable,
  normalizeFeather, PET_ENVOLUTION_FEATHER_COST_GOLD, petHandbookGoldCost, type ActivePetObject, type PetEvolutionInfo, type PetEvolveReply,
  type PetFeatherReply, type PetHandbookEntry,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import type { HandbookRow } from '../gamedata/pet-depth-data';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetBonusService } from './pet-bonus.service';
import { PmStateService } from '../vip/pm-state.service';
import { PetFollowService } from './pet-follow.service';
import { PetMaterialService } from './pet-materials.service';
import { creatureClassIds } from './pet-owned';
import { Pet } from './pet.schema';

export type FeatherReply = Omit<PetFeatherReply, 'num'>;
export type EvolveReply = PetEvolveReply;
export interface PetEvoResult<T> { reply: T; pushes: Push[]; }
export interface ActivateResult { reply: PetHandbookEntry; all: ActivePetObject; pushes: Push[]; }

@Injectable()
export class PetEvolutionService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly data: GameDataService,
    private readonly follow: PetFollowService,
    private readonly bonuses: PetBonusService,
    private readonly mats: PetMaterialService,
    private readonly vip: PmStateService,
  ) {}

  async login(characterId: number): Promise<{ activePetObject: ActivePetObject; contractPet: Record<string, number> }> {
    const row = await this.chars.findById(characterId, { activePetObject: 1, contractPet: 1 }).lean();
    return { activePetObject: row?.activePetObject ?? {}, contractPet: row?.contractPet ?? {} };
  }

  /** activePet({num, pid}): spends up to `num` natural energy (capped at the remainder) toward active_num1. */
  activate(characterId: number, pid: number, amount: number): Promise<ActivateResult> {
    if (!Number.isInteger(amount) || amount <= 0) throw RpcException.invalidArgs('num');
    return withCharLock(characterId, async () => {
      const { handbook, all, previous } = await this.handbookState(characterId, pid);
      const use = Math.min(amount, handbook.activeNum - previous.activedNum);
      return this.saveActivation(characterId, handbook, all, previous, use, { $inc: { 'currencies.npPnt': -use } }, { 'currencies.npPnt': { $gte: use } },
        'Không đủ Năng Lượng Tự Nhiên');
    });
  }

  /** activePetGold({num, pid, moneyType}): VIP only; pays ceil(remaining / 5) gold for the whole remainder (Go ActivateWithGold). */
  activateGold(characterId: number, pid: number, moneyType: unknown): Promise<ActivateResult> {
    if (moneyType !== undefined && moneyType !== null && moneyType !== '' && moneyType !== 'gold') throw RpcException.invalidArgs('moneyType');
    return withCharLock(characterId, async () => {
      const { handbook, all, previous } = await this.handbookState(characterId, pid);
      if ((await this.vip.levelOf(characterId)) <= 0) throw RpcException.forbidden('Chức năng dành cho VIP');
      const remaining = handbook.activeNum - previous.activedNum;
      const cost = petHandbookGoldCost(remaining);
      return this.saveActivation(characterId, handbook, all, previous, remaining, { $inc: { gold: -cost } }, { gold: { $gte: cost } }, 'Vàng không đủ');
    });
  }

  /** The handbook row and the character's activation state; refuses unknown and already activated entries. */
  private async handbookState(characterId: number, pid: number): Promise<{ handbook: HandbookRow; all: ActivePetObject; previous: PetHandbookEntry }> {
    const handbook = this.data.creatureHandbooks().find((h) => h.id === pid && h.activeNum > 0);
    if (!handbook) throw RpcException.notFound('Không tìm thấy Sách Tiến Hóa');
    const char = await this.chars.findById(characterId, { activePetObject: 1 }).lean();
    if (!char) throw RpcException.notFound('character not found');
    const all = { ...(char.activePetObject ?? {}) };
    const previous = all[String(pid)] ?? { pid, actived: false, activedNum: 0 };
    if (previous.actived || previous.activedNum >= handbook.activeNum) throw RpcException.forbidden('Mục Sách Tiến Hóa này đã kích hoạt');
    return { handbook, all, previous };
  }

  /** Conditional spend + state write in one update (a short balance changes nothing), then the currency / state / sheet pushes. */
  private async saveActivation(
    characterId: number, handbook: HandbookRow, all: ActivePetObject, previous: PetHandbookEntry, add: number,
    spend: Record<string, unknown>, guard: Record<string, unknown>, shortText: string,
  ): Promise<ActivateResult> {
    const activedNum = Math.min(previous.activedNum + add, handbook.activeNum);
    const next: PetHandbookEntry = { pid: handbook.id, activedNum, actived: activedNum >= handbook.activeNum };
    all[String(handbook.id)] = next;
    const char = await this.chars.findOneAndUpdate(
      { _id: characterId, ...guard }, { ...spend, $set: { activePetObject: all } }, { new: true, projection: { currencies: 1, gold: 1 } },
    ).lean();
    if (!char) throw RpcException.forbidden(shortText);
    const pushes = [push('onUPP', { currencies: char.currencies ?? {}, gold: char.gold ?? 0 }), push('updateActivatePetObj', all)];
    if (next.actived) pushes.push(...await this.bonuses.battlePetPushes(characterId));
    return { reply: next, all, pushes };
  }

  /** toPetEnvolution: tid becomes the handbook evolution id, envoInfo {envo, 0, 0}; a following pet is re-created on the map. */
  evolve(characterId: number, petId: number): Promise<PetEvoResult<EvolveReply>> {
    return withCharLock(characterId, async () => {
      const pet = await this.pets.findOne({ _id: petId, characterId }).lean();
      if (!pet) throw RpcException.notFound('Không tìm thấy pet');
      if (!pet.binded) throw RpcException.forbidden('Pet chưa khóa không thể Tiến Hóa, vui lòng chọn lại!');
      if (pet.envoInfo?.envo) throw RpcException.forbidden('Pet này đã tiến hóa');
      const current = this.data.petTemplate(pet.tid);
      if (!current || !creatureClassIds(current).includes(10)) throw RpcException.forbidden('Chỉ thần thú mới có thể tiến hóa');
      const handbook = (await this.data.rows('data_tbl_creature_handbook', { relate_id: pet.tid })).find((r) => Number(r.evolution_id) > 0);
      if (!handbook) throw RpcException.forbidden('Pet này không thể tiến hóa');
      const char = await this.chars.findById(characterId, { activePetObject: 1 }).lean();
      if (!char?.activePetObject?.[String(handbook.id)]?.actived) throw RpcException.forbidden('Cần kích hoạt pet này trong Sách Tiến Hóa trước');
      const tid = Number(handbook.evolution_id);
      const tpl = this.data.petTemplate(tid);
      if (!tpl) throw RpcException.notFound('Không tìm thấy dữ liệu tiến hóa');
      const envo = { envo: true, round: 0, stage: 0 };
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { tid, envoInfo: envo } });
      const pushes = [await this.bonuses.refreshPush(characterId, { ...pet, tid, envoInfo: envo }, tpl)];
      // broadcast() re-reads the row: onCancelPet(owner) then onCreatePet with the evolved form, to the whole map.
      if (pet.following) await this.follow.broadcast(characterId);
      return { reply: { pid: petId, tid, envo }, pushes };
    });
  }

  /**
   * toPetFeather: costs 5 x PET_ENVOLUTION_FEATHER_COST natural energy, succeeds with FEATHER_SUCCESS percent. With useProtect on a
   * non-milestone stage the Bua Cau Nguyen charms (3911) are required and consumed too; a protected failure keeps the stage.
   * Everything is validated and spent before the roll (refusals charge nothing; a charm take that fails refunds the energy).
   */
  feather(characterId: number, petId: number, useProtect: boolean): Promise<PetEvoResult<FeatherReply>> {
    return withCharLock(characterId, async () => {
      const { pet, info } = await this.featherState(characterId, petId);
      const cost = featherNpCost(info);
      const charms = useProtect ? featherProtectNeed(info) : 0;
      if (charms > 0 && (await this.mats.countTemplate(characterId, FEATHER_PROTECT_ITEM)) < charms) throw RpcException.forbidden('Bùa Cầu Nguyện không đủ!');
      const char = await this.chars.findOneAndUpdate(
        { _id: characterId, 'currencies.npPnt': { $gte: cost } }, { $inc: { 'currencies.npPnt': -cost } }, { new: true, projection: { currencies: 1 } },
      ).lean();
      if (!char) throw RpcException.forbidden('Không đủ Năng Lượng Tự Nhiên');
      const pushes: Push[] = [];
      if (charms > 0) {
        try {
          pushes.push(...await this.mats.consumeTemplate(characterId, FEATHER_PROTECT_ITEM, charms));
        } catch (e) {
          await this.chars.updateOne({ _id: characterId }, { $inc: { 'currencies.npPnt': cost } });
          throw e;
        }
      }
      pushes.push(push('onUPP', { currencies: char.currencies ?? {} }));
      const success = Math.floor(Math.random() * 100) < (FEATHER_SUCCESS[info.round]?.[info.stage] ?? 0);
      const saved = await this.saveFeather(characterId, pet, petId, featherAttempt(info, success, charms > 0));
      saved.pushes.unshift(...pushes);
      return saved;
    });
  }

  /** toPetFeatherNextStep ("Tang 1 diem"): pays PET_ENVOLUTION_FEATHER_COST_GOLD gold to jump to the next milestone stage. */
  featherJump(characterId: number, petId: number): Promise<PetEvoResult<FeatherReply>> {
    return withCharLock(characterId, async () => {
      const { pet, info } = await this.featherState(characterId, petId);
      const cost = PET_ENVOLUTION_FEATHER_COST_GOLD[info.round]?.[info.stage] ?? 0;
      const char = await this.chars.findOneAndUpdate({ _id: characterId, gold: { $gte: cost } }, { $inc: { gold: -cost } }, { new: true, projection: { gold: 1 } }).lean();
      if (!char) throw RpcException.forbidden('Vàng không đủ');
      const saved = await this.saveFeather(characterId, pet, petId, featherNextStep(info));
      saved.pushes.unshift(push('onUPP', { gold: char.gold ?? 0 }));
      return saved;
    });
  }

  /** The evolved pet and its normalised feather state (Go featherPet); refuses unevolved, table-less and capped pets. */
  private async featherState(characterId: number, petId: number): Promise<{ pet: Pet; info: PetEvolutionInfo }> {
    const pet = await this.pets.findOne({ _id: petId, characterId }).lean();
    if (!pet) throw RpcException.notFound('Không tìm thấy pet');
    if (!pet.envoInfo?.envo) throw RpcException.forbidden('Không có Pet Tiến Hóa!');
    if (!hasFeatherTable(pet.tid)) throw RpcException.forbidden('Pet này chưa thể Vũ Hóa');
    const info = normalizeFeather(pet.envoInfo);
    if (featherAtCap(info)) throw RpcException.forbidden('Thần thú này đã Vũ Hóa đến cấp cao nhất!');
    return { pet, info };
  }

  /** Persists the new feather state (the aptitudes follow from the table) and builds the reply + the sheet refresh. */
  private async saveFeather(
    characterId: number, pet: Pet, petId: number, result: { success: boolean; round: number; stage: number; protect: boolean },
  ): Promise<PetEvoResult<FeatherReply>> {
    const envoInfo = { envo: true, round: result.round, stage: result.stage };
    await this.pets.updateOne({ _id: petId, characterId }, { $set: { envoInfo } });
    const tpl = this.data.petTemplate(pet.tid);
    const pushes = tpl ? [await this.bonuses.refreshPush(characterId, { ...pet, envoInfo }, tpl)] : [];
    return { reply: { pid: petId, ...result }, pushes };
  }
}
