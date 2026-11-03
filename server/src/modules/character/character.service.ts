// Character CRUD + DTO builders. Starter stats come from data_tbl_class (att_* columns), the
// derived HP/MP formulas here are simple placeholders until the unified stat formula is ported.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { CharListEntry, MoneyKey, PlayerData, SceneCharacter } from '@mc/shared';
import { Character, type CharacterDocument } from './character.schema';
import { Counter } from './counter.schema';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';

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
  ) {}

  async listByAccount(accountId: string): Promise<CharacterDocument[]> {
    return this.characters.find({ accountId, deleted: false }).sort({ createdAt: 1 });
  }

  async getById(id: number): Promise<CharacterDocument> {
    const doc = await this.characters.findById(id);
    if (!doc || doc.deleted) throw RpcException.notFound('character not found');
    return doc;
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
    const strength = num(cls.att_strength, 10);
    const agility = num(cls.att_agility, 10);
    const stamina = num(cls.att_stamina, 10);
    const intelligence = num(cls.att_intelligence, 10);
    const energy = num(cls.att_energy, 10);
    const maxHp = 100 + stamina * 10;
    const maxMp = 50 + intelligence * 5;
    return this.characters.create({
      _id: id,
      accountId,
      name: trimmed,
      classId,
      gender,
      strength,
      agility,
      stamina,
      intelligence,
      energy,
      maxHp,
      currentHp: maxHp,
      maxMp,
      currentMp: maxMp,
      mapId: START_MAP,
      posX: START_X,
      posY: START_Y,
    });
  }

  async updatePosition(id: number, mapId: number, x: number, y: number, dir: number): Promise<void> {
    await this.characters.updateOne({ _id: id }, { $set: { mapId, posX: x, posY: y, dir, lastActive: new Date() } });
  }

  /** Payment preference of the character: selected money / gold currency keys (defaults moneyBind / goldBind). */
  async paymentPrefs(id: number): Promise<{ money: MoneyKey; gold: MoneyKey }> {
    const doc = await this.characters.findById(id, { selectedMoneyType: 1, selectedGoldType: 1 });
    return {
      money: doc?.selectedMoneyType === 2 ? 'money' : 'moneyBind',
      gold: doc?.selectedGoldType === 4 ? 'gold' : 'goldBind',
    };
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

  toPlayerData(doc: CharacterDocument, quests: { questLog: string; qn: number } = { questLog: '|', qn: 0 }): PlayerData {
    return {
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
      maxHp: doc.maxHp,
      currentHp: doc.currentHp,
      maxMp: doc.maxMp,
      currentMp: doc.currentMp,
      money: doc.money,
      moneyBind: doc.moneyBind ?? 0,
      gold: doc.gold,
      goldBind: doc.goldBind ?? 0,
      iconCode: this.iconCode(doc.classId, doc.gender),
      attrPoints: doc.attrPoints,
      questLog: quests.questLog,
      qn: quests.qn,
      attStrength: doc.strength,
      attAgility: doc.agility,
      attStamina: doc.stamina,
      attIntelligence: doc.intelligence,
      attEnergy: doc.energy,
    };
  }

  resCode(classId: number, gender: number): string {
    const cls = this.gameData.getClass(classId);
    if (!cls) return '0';
    return String(gender === 1 ? cls.res_code_female : cls.res_code_male);
  }

  toSceneCharacter(doc: CharacterDocument): SceneCharacter {
    return {
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
    };
  }

  private async nextId(key: string): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
