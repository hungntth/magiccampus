// Pet persistence and management (phase A): creation / quest award, login snapshot, state, rename, release, bind,
// attribute points and life restore. Mutating calls are serialized per character with withCharLock; award() and the
// PetItemHook methods are called by code that already holds the lock (quest finish / item use) and never lock.
// Every method returns the ordered pushes; the RPC layer sends them.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PetLimits, PetState, type PetLoginInfo, type PetView, type PetWrapper } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Character } from '../character/character.schema';
import { Counter } from '../character/counter.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import type { PetTemplate } from '../gamedata/pet-data';
import type { QuestAwardRow } from '../gamedata/quest-data';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { UseItemService, type PetItemHook } from '../inventory/use-item.service';
import { PetBonusService } from './pet-bonus.service';
import { PetEquipService } from './pet-equip.service';
import { PET_GUARDED_TEXT, PET_LINEUP_TEXT } from './pet-transfer';
import { PetFollowService } from './pet-follow.service';
import { PetMaterialService } from './pet-materials.service';
import { Pet } from './pet.schema';
import {
  battleStateBlocker, emptyEquipment, hasPetRoom, initialSkills, isSettableState, parsePetName, parsePetProperty,
} from './pet-rules';
import { petView, petWrapper, propertyOfPet } from './pet-view';

/** A pet id or 'battle' (the battle pet) for refreshPets. */
export type RefreshTarget = number | 'battle';

export const NO_PET_ROOM = 'Bạn không có đủ chỗ trống trong túi pet!';
export interface AwardOptions {
  growRate?: number; // overrides the creature grow_base
  bind?: boolean;
}

@Injectable()
export class PetService implements PetItemHook, OnModuleInit {
  private readonly logger = new Logger(PetService.name);

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly useItem: UseItemService,
    private readonly follow: PetFollowService,
    private readonly bonus: PetBonusService,
    private readonly gear: PetEquipService,
    private readonly achievements: AchievementEvents,
    private readonly mats: PetMaterialService,
  ) {}

  onModuleInit(): void {
    this.useItem.setPetHook(this);
  }

  // --- reads ---

  /** Every pet of the character as wrappers keyed by pet id (initViewPetMngP reply). */
  async listWrapped(characterId: number): Promise<Record<number, PetWrapper>> {
    const out: Record<number, PetWrapper> = {};
    const rows = await this.pets.find({ characterId }).sort({ _id: 1 }).lean();
    const extras = await this.bonus.extrasFor(characterId, rows);
    for (const row of rows) {
      const tpl = this.gameData.petTemplate(row.tid);
      if (!tpl) {
        this.logger.warn(`pet ${row._id}: unknown creature ${row.tid}, skipped`);
        continue;
      }
      out[row._id] = petWrapper(row, tpl, extras.get(row._id));
    }
    return out;
  }

  /** One pet of the character as a wrapper (onAddPet after a mail / trade delivery); null when it is not theirs. */
  async wrapOne(characterId: number, petId: number): Promise<PetWrapper | null> {
    const row = await this.pets.findOne({ _id: petId, characterId }).lean();
    const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
    return row && tpl ? petWrapper(row, tpl, await this.bonus.extrasOf(characterId, row)) : null;
  }

  /**
   * onRefreshPetProp pushes for the given pets (owned ones only) with their current bonuses. 'battle' stands for the battle pet
   * (state 1). Character-wide changes (talent, guard) refresh just those pets: the Flash panel rebuilds fully per push (pet-talent.md).
   */
  async refreshPets(characterId: number, targets: RefreshTarget | readonly RefreshTarget[]): Promise<Push[]> {
    const list = typeof targets === 'object' ? targets : [targets];
    const ids = [...new Set(list.filter((t): t is number => typeof t === 'number' && t > 0))];
    const or: Record<string, unknown>[] = [];
    if (ids.length > 0) or.push({ _id: { $in: ids } });
    if (list.includes('battle')) or.push({ state: PetState.BATTLE });
    if (or.length === 0) return [];
    const rows = await this.pets.find({ characterId, $or: or }).sort({ _id: 1 }).lean();
    const out: Push[] = [];
    for (const row of rows) {
      const tpl = this.gameData.petTemplate(row.tid);
      if (tpl) out.push(await this.bonus.refreshPush(characterId, row, tpl));
    }
    return out;
  }

  /** petMaxNum / showPetId / petList for the login payload (petList holds the unwrapped data blocks). */
  async loginInfo(characterId: number): Promise<PetLoginInfo> {
    const wrapped = await this.listWrapped(characterId);
    const petList: Record<number, PetView> = {};
    let showPetId = -1;
    for (const w of Object.values(wrapped)) {
      petList[w.id] = w.data;
      if (w.data.following) showPetId = w.id;
    }
    const info: PetLoginInfo = { petMaxNum: await this.petMaxNum(characterId), showPetId, petList };
    const showPetObj = showPetId > 0 ? await this.follow.sceneViewOf(characterId) : null;
    return showPetObj ? { ...info, showPetObj } : info;
  }

  async petMaxNum(characterId: number): Promise<number> {
    const doc = await this.chars.findById(characterId, { petMaxNum: 1 }).lean();
    return doc?.petMaxNum ?? PetLimits.defaultSlots;
  }

  // --- acquisition ---

  /** Whether `incoming` more pets fit the pet bag (Go HasPetCapacity; item-use award bags check it before anything is spent). */
  async hasRoom(characterId: number, incoming: number): Promise<boolean> {
    const count = await this.pets.countDocuments({ characterId });
    return hasPetRoom(count, await this.petMaxNum(characterId), incoming);
  }

  /** Creates a pet (no lock: the caller holds it). Null when the pet bag is full or the creature is unknown. */
  async award(characterId: number, creatureId: number, opts: AwardOptions = {}): Promise<PetWrapper | null> {
    const tpl = this.gameData.petTemplate(creatureId);
    if (!tpl) {
      this.logger.warn(`pet award: unknown creature ${creatureId}`);
      return null;
    }
    const count = await this.pets.countDocuments({ characterId });
    if (!hasPetRoom(count, await this.petMaxNum(characterId))) return null;
    const _id = await this.nextPetId();
    const growRate = opts.growRate !== undefined && opts.growRate > 0 ? opts.growRate : tpl.growBase;
    const row = await this.pets.create({
      _id, characterId, tid: creatureId, petName: tpl.name, level: 1, exp: 1, growRate, growRateAdd: 0, life: PetLimits.maxLife,
      state: PetState.REST, binded: opts.bind ? 1 : 0, following: false,
      skills: initialSkills(this.gameData.creatureSkillIds(creatureId)), equ: emptyEquipment(), element: tpl.element,
    });
    const obj = row.toObject();
    void this.pets.distinct('tid', { characterId }).then((kinds) => this.achievements.record(characterId, 'petsOwned', { value: kinds.length }));
    return petWrapper(obj, tpl, await this.bonus.extrasOf(characterId, obj)); // default skills may be passive
  }

  /**
   * Quest award rows of kind 2 / type 12 (Go: growRate = q / 10, bound). Pushes onAddPet per pet; a full pet bag skips
   * the pet (the quest still completes) and shows a red note.
   */
  async awardFromQuest(characterId: number, rows: readonly QuestAwardRow[]): Promise<Push[]> {
    const pushes: Push[] = [];
    for (const r of rows) {
      for (let i = 0; i < Math.max(1, r.num); i++) {
        const wrapper = await this.award(characterId, r.itemId, { growRate: r.q > 0 ? r.q / 10 : undefined, bind: true });
        if (wrapper) pushes.push(push('onAddPet', wrapper));
        else pushes.push(push('onRedMsg', NO_PET_ROOM));
      }
    }
    return pushes;
  }

  // --- management ---

  /** changePetState(petId, 1|3). State 1 demotes the other battle pet and binds this one. */
  setState(characterId: number, petId: number, state: number): Promise<Push[]> {
    if (!isSettableState(state)) throw RpcException.invalidArgs('state');
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.owned(characterId, petId);
      const pushes: Push[] = [];
      let binded = row.binded;
      if (state === PetState.BATTLE) {
        const owner = await this.chars.findById(characterId, { level: 1 }).lean();
        const why = battleStateBlocker({ petLevel: row.level, ownerLevel: owner?.level ?? 1, useLv: tpl.useLevel, life: row.life });
        if (why) throw RpcException.forbidden(why);
        const others = await this.pets.find({ characterId, state: PetState.BATTLE, _id: { $ne: petId } }, { _id: 1 }).lean();
        if (others.length > 0) {
          await this.pets.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { state: PetState.REST } });
          for (const o of others) pushes.push(push('onUpdatePet', o._id, 'state', PetState.REST));
        }
        binded = 1;
      }
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { state, binded } });
      if (row.state !== state) pushes.push(push('onUpdatePet', petId, 'state', state));
      if (binded !== row.binded) pushes.push(push('onUpdatePet', petId, 'binded', 1));
      pushes.push(push('onRefreshPetProp', petId, propertyOfPet({ ...row, state, binded }, tpl, (await this.bonus.extrasOf(characterId, row)).bonuses)));
      return pushes;
    });
  }

  /** changePetName(petId, name): "" resets to the creature name. */
  rename(characterId: number, petId: number, raw: unknown): Promise<Push[]> {
    const parsed = parsePetName(raw);
    if (!parsed.ok) throw RpcException.invalidArgs('name');
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.owned(characterId, petId);
      const name = parsed.name ?? tpl.name;
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { petName: name } });
      if (row.following) await this.follow.broadcast(characterId); // the map label shows the pet name
      return [push('onUpdatePet', petId, 'petName', name)];
    });
  }

  /** delPetByClient(petId[, pw]): the battle pet cannot be released (H5). The password is ignored. */
  release(characterId: number, petId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { row } = await this.owned(characterId, petId);
      if (row.state === PetState.BATTLE) throw RpcException.forbidden('Pet đang xuất chiến, hãy cho nghỉ trước khi phóng sinh!');
      if ((await this.mats.guardedPetIds(characterId)).has(petId)) throw RpcException.forbidden(PET_GUARDED_TEXT);
      if ((await this.mats.lineupPetIds(characterId)).has(petId)) throw RpcException.forbidden(PET_LINEUP_TEXT);
      const returned = await this.gear.returnAll(characterId, petId); // worn pet items go back to the bag first
      const del = await this.pets.deleteOne({ _id: petId, characterId, state: { $ne: PetState.BATTLE } });
      if (del.deletedCount !== 1) throw RpcException.forbidden('Pet vừa thay đổi, hãy thử lại');
      if (row.following) this.follow.cancelBroadcast(characterId); // map-wide, owner included
      return [...returned, push('onDelPet', petId)];
    });
  }

  /** bindedPetByPlayer(petId). */
  bind(characterId: number, petId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      await this.owned(characterId, petId);
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { binded: 1 } });
      return [push('onUpdatePet', petId, 'binded', 1)];
    });
  }

  /** changePetProperty(petId, {addX: string}): all or nothing against the free points; points go to apt*Ex. */
  changeProperty(characterId: number, petId: number, arg: unknown): Promise<Push[]> {
    const parsed = parsePetProperty(arg);
    if (!parsed) throw RpcException.invalidArgs('arg');
    return withCharLock(characterId, async () => {
      const { tpl } = await this.owned(characterId, petId);
      if (parsed.total <= 0) return [];
      const { add, total } = parsed;
      const row = await this.pets.findOneAndUpdate(
        { _id: petId, characterId, attrPoints: { $gte: total } },
        {
          $inc: {
            attrPoints: -total, 'aptEx.strength': add.str, 'aptEx.agility': add.agi, 'aptEx.stamina': add.sta,
            'aptEx.intelligence': add.int, 'aptEx.energy': add.eng,
          },
        },
        { new: true },
      ).lean();
      if (!row) return [push('onSystemMidMsgOrNote', 'Không đủ điểm thuộc tính!')];
      const v = petView(row, tpl, { bonuses: (await this.bonus.extrasOf(characterId, row)).bonuses });
      return [
        push('onUpdatePet', petId, 'attLastPoint', v.attLastPoint),
        push('onUpdatePet', petId, 'aptStrengthEx', v.aptStrengthEx),
        push('onUpdatePet', petId, 'aptAgilityEx', v.aptAgilityEx),
        push('onUpdatePet', petId, 'aptStaminaEx', v.aptStaminaEx),
        push('onUpdatePet', petId, 'aptIntelligenceEx', v.aptIntelligenceEx),
        push('onUpdatePet', petId, 'aptEnergyEx', v.aptEnergyEx),
        push('onRefreshPetProp', petId, v.property),
      ];
    });
  }

  // --- PetItemHook: life restore items (type 507), called under the character lock by UseItemService ---

  async restoreBlocker(characterId: number, petId: number, reqLevel: number): Promise<string | null> {
    const row = await this.pets.findOne({ _id: petId, characterId }, { life: 1, level: 1 }).lean();
    if (!row) return 'Không tìm thấy pet';
    if (row.level < reqLevel) return 'Cấp độ pet chưa đủ!';
    if (row.life >= PetLimits.maxLife) return 'Thọ mệnh của pet đã đầy!';
    return null;
  }

  async restoreLife(characterId: number, petId: number): Promise<Push[]> {
    const r = await this.pets.updateOne({ _id: petId, characterId }, { $set: { life: PetLimits.maxLife } });
    if (r.matchedCount !== 1) {
      this.logger.warn(`character ${characterId}: pet ${petId} vanished after the life item was spent`);
      return [];
    }
    return [push('onUpdatePet', petId, 'life', PetLimits.maxLife)];
  }

  // --- helpers ---

  private async owned(characterId: number, petId: number): Promise<{ row: Pet; tpl: PetTemplate }> {
    const row = await this.pets.findOne({ _id: petId, characterId }).lean();
    if (!row) throw RpcException.notFound('Không tìm thấy pet');
    const tpl = this.gameData.petTemplate(row.tid);
    if (!tpl) throw RpcException.notFound('Không tìm thấy dữ liệu pet');
    return { row, tpl };
  }

  private async nextPetId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('pets', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
