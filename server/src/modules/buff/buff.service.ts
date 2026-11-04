// Buff persistence: grant / refresh (unique per character + buffId, type 10 unique per code_name), lazy-expiring
// list, removal and the LongBuff payloads for initLongBuff / upLongBuff.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BuffType, type InitLongBuff, type LongBuff } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Counter } from '../character/counter.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { isActive, toLongBuff } from './buff-mapping';
import { CharacterBuff } from './buff.schema';

@Injectable()
export class BuffService {
  constructor(
    @InjectModel(CharacterBuff.name) private readonly buffs: Model<CharacterBuff>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly gameData: GameDataService,
  ) {}

  /** Active buffs of a character; expired rows are deleted here (the only expiry mechanism, like the legacy server). */
  async listActive(characterId: number): Promise<CharacterBuff[]> {
    const rows = await this.buffs.find({ characterId }).sort({ _id: 1 }).lean();
    const now = Date.now();
    const expired = rows.filter((r) => !isActive(r, now));
    if (expired.length > 0) await this.buffs.deleteMany({ _id: { $in: expired.map((r) => r._id) } });
    return rows.filter((r) => isActive(r, now));
  }

  /** initLongBuff payload: `{rowId: LongBuff}`, `{}` when empty. */
  async initPayload(characterId: number): Promise<InitLongBuff> {
    const out: InitLongBuff = {};
    for (const row of await this.listActive(characterId)) out[String(row._id)] = this.toWire(row);
    return out;
  }

  /** Grants or refreshes a buff. `seconds > 0` makes it timed; type 10 templates replace others with the same code_name. */
  async grant(characterId: number, buffId: number, seconds: number): Promise<LongBuff> {
    const tpl = this.gameData.getBuff(buffId);
    if (!tpl) throw RpcException.notFound(`buff ${buffId} not found`);
    const tplType = Number(tpl.type ?? 0);
    const buffType = seconds > 0 ? BuffType.TIMED : tplType === BuffType.UNIQUE ? BuffType.UNIQUE : BuffType.PERMANENT;
    const now = new Date();
    const expiresAt = seconds > 0 ? new Date(now.getTime() + seconds * 1000) : null;
    if (buffType === BuffType.UNIQUE) await this.dropSameCodeName(characterId, buffId, String(tpl.code_name ?? ''));
    const set = { buffType, durationTotal: Math.max(0, seconds), expiresAt, battlesLeft: 0, createdAt: now };
    let row = await this.buffs.findOneAndUpdate({ characterId, buffId }, { $set: set }, { new: true, lean: true });
    if (!row) {
      try {
        row = (await this.buffs.create({ _id: await this.nextId(), characterId, buffId, ...set })).toObject();
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        row = await this.buffs.findOneAndUpdate({ characterId, buffId }, { $set: set }, { new: true, lean: true });
      }
    }
    if (!row) throw RpcException.notFound('buff not saved');
    return this.toWire(row);
  }

  /** Row of this character, active or not; null when missing or owned by someone else. */
  async findOwned(characterId: number, rowId: number): Promise<CharacterBuff | null> {
    return this.buffs.findOne({ _id: rowId, characterId }).lean();
  }

  async remove(characterId: number, rowId: number): Promise<void> {
    await this.buffs.deleteOne({ _id: rowId, characterId });
  }

  /** Template `buff` flag: 1 = the player may remove it. */
  removable(row: CharacterBuff): boolean {
    return Number(this.gameData.getBuff(row.buffId)?.buff ?? 0) === 1;
  }

  private toWire(row: CharacterBuff): LongBuff {
    return toLongBuff(row, this.gameData.getBuff(row.buffId));
  }

  private async dropSameCodeName(characterId: number, buffId: number, codeName: string): Promise<void> {
    if (!codeName) return;
    const rows = await this.buffs.find({ characterId, buffId: { $ne: buffId } }).lean();
    const ids = rows.filter((r) => String(this.gameData.getBuff(r.buffId)?.code_name ?? '') === codeName).map((r) => r._id);
    if (ids.length > 0) await this.buffs.deleteMany({ _id: { $in: ids } });
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('buffs', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
