// Character CRUD + DTO builders. Starter attributes come from data_tbl_class (att_* columns); max HP/MP from the
// shared stat formula (character-stats.ts); the full final stats come from CharacterStatsService.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CharState, DEFAULT_PAYMENT, EMPTY_PET_CONTRACT, isMazeTemplateMap, applyMoneyType, openBagPages, openBankPages, paymentKeys, skillPool, formatEp, type CharListEntry, type MoneyKey, type PetLoginInfo, type PlayerData,
  type SceneCharacter,
} from '@mc/shared';
import { Character, type CharacterDocument } from './character.schema';
import { Counter } from './counter.schema';
import { classStartAttrs, profileOf } from './character-profile';
import { buildBaseStats } from './character-stats';
import type { CharStats } from '../stats/character-stats.service';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { SkillService } from '../skill/skill.service';
import { titleView } from '../title/title-rules';

const NAME_RE = /^[\p{L}\p{N} _]{2,16}$/u;
const MAX_CHAR_SLOTS = 6;
const START_MAP = 1;
const START_X = 170;
const START_Y = 1230;

@Injectable()
export class CharacterService {
  constructor(
    @InjectModel(Character.name) private readonly characters: Model<Character>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly gameData: GameDataService,
    private readonly skills: SkillService,
  ) {}

  private readonly loginExtras: ((characterId: number) => Promise<Partial<PlayerData>>)[] = [];

  /** Lets a module that imports CharacterModule (guild) add keys to the chooseCharactor payload without a cycle. */
  addLoginExtra(fn: (characterId: number) => Promise<Partial<PlayerData>>): void {
    this.loginExtras.push(fn);
  }

  async loginExtrasOf(characterId: number): Promise<Partial<PlayerData>> {
    return Object.assign({}, ...(await Promise.all(this.loginExtras.map((fn) => fn(characterId)))));
  }

  async listByAccount(accountId: string): Promise<CharacterDocument[]> {
    return this.characters.find({ accountId, deleted: false }).sort({ createdAt: 1 });
  }

  async getById(id: number): Promise<CharacterDocument> {
    const doc = await this.characters.findById(id);
    if (!doc || doc.deleted) throw RpcException.notFound('character not found');
    return doc;
  }

  /** Live character by exact (trimmed) name, or null; used by the friend list (add by name). */
  async findByName(name: string): Promise<CharacterDocument | null> {
    return this.characters.findOne({ name, deleted: false });
  }

  /** Live characters for a set of ids (rows of deleted characters are simply absent). */
  async findByIds(ids: number[]): Promise<CharacterDocument[]> {
    if (ids.length === 0) return [];
    return this.characters.find({ _id: { $in: ids }, deleted: false });
  }

  async getOwned(accountId: string, id: number): Promise<CharacterDocument> {
    const doc = await this.getById(id);
    if (doc.accountId !== accountId) throw RpcException.forbidden('not your character');
    return doc;
  }

  async create(accountId: string, name: string, classId: number, gender: number): Promise<CharacterDocument> {
    const trimmed = name.trim();
    if (!NAME_RE.test(trimmed)) throw RpcException.invalidArgs('name must be 2-16 letters/digits');
    const cls = this.gameData.getClass(classId);
    if (!cls) throw RpcException.invalidArgs('unknown class');
    if (gender !== 0 && gender !== 1) throw RpcException.invalidArgs('gender must be 0 or 1');
    const count = await this.characters.countDocuments({ accountId, deleted: false });
    if (count >= MAX_CHAR_SLOTS) throw RpcException.forbidden('character slots full');
    if (await this.characters.exists({ name: trimmed })) throw RpcException.alreadyExists('name taken');

    const id = await this.nextId('characters');
    const att = classStartAttrs(cls);
    const base = { strength: att.str, agility: att.agi, stamina: att.sta, intelligence: att.int, energy: att.eng };
    const { maxHp, maxMp } = buildBaseStats(profileOf(base, cls));
    const doc = await this.characters.create({
      _id: id,
      accountId,
      name: trimmed,
      classId,
      gender,
      ...base,
      maxHp,
      currentHp: maxHp,
      maxMp,
      currentMp: maxMp,
      mapId: START_MAP,
      posX: START_X,
      posY: START_Y,
    });
    await this.skills.learnStartSkills(id, classId); // class start skills ignore the level gate (Go LearnStarterSkill)
    return doc;
  }

  async updatePosition(id: number, mapId: number, x: number, y: number, dir: number): Promise<void> {
    if (isMazeTemplateMap(mapId)) return; // M10 maze copies are never persisted: a relog lands at the return point
    await this.characters.updateOne({ _id: id }, { $set: { mapId, posX: x, posY: y, dir, lastActive: new Date() } });
  }

  /** True when a character (deleted ones keep their names, as in create) already uses this exact name. */
  async nameTaken(name: string): Promise<boolean> {
    return (await this.characters.exists({ name })) !== null;
  }

  /** Rename card: sets the stored name (callers check uniqueness under their own lock). */
  async rename(id: number, name: string): Promise<void> {
    await this.characters.updateOne({ _id: id }, { $set: { name } });
  }

  /** Same position for several characters (party members following their leader). */
  async updatePositions(ids: number[], mapId: number, x: number, y: number, dir: number): Promise<void> {
    if (ids.length === 0) return;
    await this.characters.updateMany({ _id: { $in: ids } }, { $set: { mapId, posX: x, posY: y, dir, lastActive: new Date() } });
  }

  /** Payment preference of the character: selected money / gold currency keys (defaults moneyBind / goldBind). */
  async paymentPrefs(id: number): Promise<{ money: MoneyKey; gold: MoneyKey }> {
    const doc = await this.characters.findById(id, { selectedMoneyType: 1, selectedGoldType: 1 });
    return paymentKeys({
      selectedMoneyType: doc?.selectedMoneyType ?? DEFAULT_PAYMENT.selectedMoneyType,
      selectedGoldType: doc?.selectedGoldType ?? DEFAULT_PAYMENT.selectedGoldType,
    });
  }

  /** changeMoneyType: persists the payment preference; false for an unknown type. */
  async setPaymentType(id: number, type: number): Promise<boolean> {
    const next = applyMoneyType(DEFAULT_PAYMENT, type);
    if (!next) return false;
    const field = type <= 2 ? 'selectedMoneyType' : 'selectedGoldType';
    await this.characters.updateOne({ _id: id }, { $set: { [field]: type } });
    return true;
  }

  /** Atomic conditional charge: returns the new total, or null when the balance is below `cost`. */
  async spendMoney(id: number, key: MoneyKey, cost: number): Promise<number | null> {
    const doc = await this.characters.findOneAndUpdate(
      { _id: id, [key]: { $gte: cost } },
      { $inc: { [key]: -cost } },
      { new: true, projection: { [key]: 1 } },
    );
    return doc ? (doc[key] ?? 0) : null;
  }

  /** Credits `amount` (also used to refund) and returns the new total. */
  async addMoney(id: number, key: MoneyKey, amount: number): Promise<number> {
    const doc = await this.characters.findByIdAndUpdate(id, { $inc: { [key]: amount } }, { new: true, projection: { [key]: 1 } });
    if (!doc) throw RpcException.notFound('character not found');
    return doc[key] ?? 0;
  }

  iconCode(classId: number, gender: number): string {
    const cls = this.gameData.getClass(classId);
    if (!cls) return '0';
    return String(gender === 1 ? cls.icon_code_female : cls.icon_code_male);
  }

  toListEntry(doc: CharacterDocument): CharListEntry {
    const cls = this.gameData.getClass(doc.classId);
    return {
      id: doc._id,
      name: doc.name,
      level: doc.level,
      classId: doc.classId,
      gender: doc.gender,
      deleted: doc.deleted,
      createTime: (doc as unknown as { createdAt?: Date }).createdAt?.getTime() ?? 0,
      iconCode: this.iconCode(doc.classId, doc.gender),
      portraitCode: String((doc.gender === 1 ? cls?.img_code_female : cls?.img_code_male) ?? 0),
    };
  }

  /** Login payload; `stats` supplies the effective max HP/MP, base+gear attributes and `property`. */
  toPlayerData(
    doc: CharacterDocument, quests: { questLog: string; qn: number }, stats: CharStats, pets: PetLoginInfo,
  ): PlayerData {
    return {
      ...pets,
      id: doc._id,
      name: doc.name,
      classId: doc.classId,
      gender: doc.gender,
      level: doc.level,
      exp: doc.exp,
      posMapId: doc.mapId,
      posX: doc.posX,
      posY: doc.posY,
      dir: doc.dir,
      maxHp: stats.maxHp,
      currentHp: stats.doc.currentHp,
      maxMp: stats.maxMp,
      currentMp: stats.doc.currentMp,
      money: doc.money,
      moneyBind: doc.moneyBind ?? 0,
      gold: doc.gold,
      goldBind: doc.goldBind ?? 0,
      exPoint: doc.exPoint ?? 0,
      expSkill: skillPool(doc.exp, doc.level),
      cl: doc.cl ?? 0,
      ep: formatEp(doc.bloodBag ?? []),
      bagSlotNum: openBagPages(doc.bagSlotNum ?? 1),
      bankSlotNum: openBankPages(doc.bankSlotNum ?? 1),
      selectedMoneyType: doc.selectedMoneyType ?? DEFAULT_PAYMENT.selectedMoneyType,
      selectedGoldType: doc.selectedGoldType ?? DEFAULT_PAYMENT.selectedGoldType,
      iconCode: this.iconCode(doc.classId, doc.gender),
      attrPoints: doc.attrPoints,
      questLog: quests.questLog,
      qn: quests.qn,
      attStrength: stats.att.str,
      attAgility: stats.att.agi,
      attStamina: stats.att.sta,
      attIntelligence: stats.att.int,
      attEnergy: stats.att.eng,
      property: stats.property,
      currencies: { ...(doc.currencies ?? {}) },
      activePetObject: { ...(doc.activePetObject ?? {}) },
      contractPet: { ...EMPTY_PET_CONTRACT, ...(doc.contractPet ?? {}) },
      state: CharState.NORMAL,
    };
  }

  resCode(classId: number, gender: number): string {
    const cls = this.gameData.getClass(classId);
    if (!cls) return '0';
    return String(gender === 1 ? cls.res_code_female : cls.res_code_male);
  }

  /** Active title views for scene payloads (display data only; the buff text stays on the login / gtl views). */
  private titleViews(doc: CharacterDocument): Pick<SceneCharacter, 't' | 'actT' | 'tv' | 'atv'> {
    const t = this.gameData.getTitle(doc.titleId ?? 0);
    const a = this.gameData.getTitle(doc.actTitleId ?? 0);
    return { t: t ? doc.titleId : 0, actT: a ? doc.actTitleId : 0, ...(t ? { tv: titleView(t, undefined) } : {}), ...(a ? { atv: titleView(a, undefined) } : {}) };
  }

  toSceneCharacter(doc: CharacterDocument): SceneCharacter {
    return {
      ...this.titleViews(doc),
      resCode: this.resCode(doc.classId, doc.gender),
      id: doc._id,
      name: doc.name,
      classId: doc.classId,
      gender: doc.gender,
      level: doc.level,
      posX: doc.posX,
      posY: doc.posY,
      posDir: doc.dir,
      iconCode: this.iconCode(doc.classId, doc.gender),
      inGroup: false,
      isLeader: false,
      groupAfk: false,
    };
  }

  private async nextId(key: string): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
