// Buff persistence: grant / refresh (unique per character + buffId, type 10 unique per code_name), lazy-expiring
// list, removal, battle-count charges and the LongBuff payloads for initLongBuff / upLongBuff.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BuffType, type InitLongBuff, type LongBuff } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { Counter } from '../character/counter.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { isActive, toLongBuff } from './buff-mapping';
import { grantBuffType, planBattleCharges, stackGrant, type GrantOptions } from './buff-stack';
import { CharacterBuff } from './buff.schema';

export type BuffRemovedHook = (session: Session, buffId: number | null) => Promise<void>;

@Injectable()
export class BuffService {
  private readonly removedHooks: BuffRemovedHook[] = [];

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

  /**
   * Grants or refreshes a buff. `seconds > 0` makes it timed, `opts.battles > 0` a battle-count buff; type 10 templates replace others
   * with the same code_name. `opts.addRemaining` adds the existing row's remaining time / battles (foods, books) instead of overwriting.
   */
  async grant(characterId: number, buffId: number, seconds: number, opts: GrantOptions = {}): Promise<LongBuff> {
    const tpl = this.gameData.getBuff(buffId);
    if (!tpl) throw RpcException.notFound(`buff ${buffId} not found`);
    const tplType = Number(tpl.type ?? 0);
    const now = new Date();
    const existing = opts.addRemaining ? await this.buffs.findOne({ characterId, buffId }).lean() : null;
    const stacked = stackGrant(existing, seconds, opts, now.getTime());
    const buffType = grantBuffType(stacked, tplType);
    const expiresAt = stacked.seconds > 0 ? new Date(now.getTime() + stacked.seconds * 1000) : null;
    if (buffType === BuffType.UNIQUE) await this.dropSameCodeName(characterId, buffId, String(tpl.code_name ?? ''));
    const set = { buffType, durationTotal: Math.max(0, stacked.seconds), expiresAt, battlesLeft: stacked.battles, createdAt: now };
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

  /**
   * One finished battle (legacy ConsumeBattleCharges, called at battlePlayEnd): every battle-count buff loses a charge, a buff at its
   * last charge is deleted. Returns the updated rows (upLongBuff) and the removed row ids (delBuff).
   */
  async consumeBattleCharges(characterId: number): Promise<{ updated: LongBuff[]; removed: number[] }> {
    const plan = planBattleCharges(await this.listActive(characterId));
    const updated: LongBuff[] = [];
    for (const u of plan.update) {
      const row = await this.buffs.findOneAndUpdate({ _id: u.id, characterId }, { $set: { battlesLeft: u.left } }, { new: true, lean: true });
      if (row) updated.push(this.toWire(row));
    }
    if (plan.remove.length > 0) await this.buffs.deleteMany({ _id: { $in: plan.remove }, characterId });
    return { updated, removed: plan.remove };
  }

  /** Row of this character, active or not; null when missing or owned by someone else. */
  async findOwned(characterId: number, rowId: number): Promise<CharacterBuff | null> {
    return this.buffs.findOne({ _id: rowId, characterId }).lean();
  }

  async remove(characterId: number, rowId: number): Promise<void> {
    await this.buffs.deleteOne({ _id: rowId, characterId });
  }

  /**
   * Called by delBuffClient after a row is removed (buffId) or when the client names a row that is already gone (null: lazily
   * expired). Lets modules that cannot be imported here (VIP transform) undo a buff's side effect.
   */
  onRemoved(hook: BuffRemovedHook): void {
    this.removedHooks.push(hook);
  }

  async runRemovedHooks(session: Session, buffId: number | null): Promise<void> {
    for (const hook of this.removedHooks) await hook(session, buffId);
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
