// Relationship persistence + pushes: snapshot for initViewImC, add by name (friend / black / enemy, immediate and one-directional,
// friend <-> black swap), delete, and the internal API later features use (link / unlink / convert couple, tutor and brother rows
// in both directions keeping intimacy, addIntimacy / resetIntimacy + onSetClose, pushSnapshot). Online marker = the other
// character has a bound session now (snapshot only, no live presence push).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BOND_RELATION_TYPES, RELATION_LIST_KEY, RelationType, type InitViewImC, type RelationEntry, type RelationTypeId,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Counter } from '../character/counter.schema';
import { withKeyLock } from '../inventory/char-lock';
import {
  MANAGED_DELETE_TEXT, applyIntimacy, planAdd, planDelete, refusalText, setCloseNum, type RelationRow,
} from './relationship-rules';
import { Relationship, type RelationshipDocument } from './relationship.schema';

/** One direction's intimacy change; `announce` turns it into an `onSetClose` for `characterId`. */
export interface IntimacyChange {
  characterId: number;
  otherId: number;
  otherName: string;
  total: number;
  applied: number;
  reset?: boolean;
}

const relLock = <T>(id: number, fn: () => Promise<T>): Promise<T> => withKeyLock(`rel:${id}`, fn);
const relLocks = <T>(a: number, b: number, fn: () => Promise<T>): Promise<T> => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return relLock(lo, () => relLock(hi, fn));
};

@Injectable()
export class RelationshipService {
  private readonly snapshotListeners: ((session: Session) => Promise<void> | void)[] = [];

  constructor(
    @InjectModel(Relationship.name) private readonly rels: Model<Relationship>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
    private readonly achievements: AchievementEvents,
  ) {}

  // ---- reads ----

  /** Every list, newest first; rows of deleted characters are skipped. */
  async snapshot(characterId: number): Promise<InitViewImC> {
    const entries = await this.entries(await this.rels.find({ characterId }).sort({ _id: -1 }));
    const out: InitViewImC = { friend: [], black: [], enemy: [], couple: [], tutor: [], brother: [] };
    for (const e of entries) out[RELATION_LIST_KEY[e.type]].push(e);
    return out;
  }

  /** Rows of the given wire types (getFriendList / getBlackList). */
  async list(characterId: number, types: readonly number[]): Promise<RelationEntry[]> {
    return this.entries(await this.rels.find({ characterId, type: { $in: [...types] } }).sort({ _id: -1 }));
  }

  /** `initViewImC`: fire-and-forget on the wire; the answer is the `onInitViewImC` push. */
  async sendSnapshot(session: Session): Promise<void> {
    session.callback('onInitViewImC', await this.snapshot(session.characterId!));
    for (const l of this.snapshotListeners) await l(session); // marriage: onInitCouple follows the list (Flash IMPanel.initCP)
  }

  /** Runs after every `initViewImC` answer (feature hooks that must follow the IM list, e.g. onInitCouple). */
  addSnapshotListener(fn: (session: Session) => Promise<void> | void): void {
    this.snapshotListeners.push(fn);
  }

  /** Pushes a fresh `onInitViewImC` to a character when it is online (feature code after link / unlink / convert). */
  async pushSnapshot(characterId: number): Promise<void> {
    const session = this.scenes.findByCharacter(characterId);
    if (session) session.callback('onInitViewImC', await this.snapshot(characterId));
  }

  /** The owner's row toward `targetId` (any type), or null. */
  async get(characterId: number, targetId: number): Promise<RelationRow | null> {
    const row = await this.rels.findOne({ characterId, targetId }).lean();
    return row ? { id: row._id, targetId: row.targetId, type: row.type, intimacy: row.intimacy ?? 0 } : null;
  }

  /** Friend / couple / tutor / brother row from `characterId` toward `targetId`. */
  async hasBond(characterId: number, targetId: number): Promise<boolean> {
    return (await this.rels.exists({ characterId, targetId, type: { $in: [...BOND_RELATION_TYPES] } })) !== null;
  }

  // ---- RPC operations ----

  /**
   * `addRelationByName`: unknown name -> `onAddRelationByName(-1, type)` (null); other refusals throw (toast). Returns the new
   * row's target and type so the RPC layer can start the friend-request prompt.
   */
  async addByName(session: Session, name: string, type: RelationTypeId): Promise<{ targetId: number; type: RelationTypeId } | null> {
    const selfId = session.characterId!;
    const target = await this.characters.findByName(name);
    if (!target) {
      session.callback('onAddRelationByName', -1, type);
      return null;
    }
    const row = await relLock(selfId, async () => {
      const rows = await this.rels.find({ characterId: selfId });
      const plan = planAdd(rows.map(toRow), selfId, target._id, type);
      if (!plan.ok) throw RpcException.forbidden(refusalText(plan.reason, plan.type));
      if (plan.replaceId !== null) {
        await this.rels.deleteOne({ _id: plan.replaceId, characterId: selfId });
        session.callback('onDelRelationship', plan.replaceId);
      }
      return this.insert(selfId, target._id, type);
    });
    const [entry] = await this.entries([row]);
    session.callback('onAddRelationship', entry);
    if (type === RelationType.FRIEND) {
      void this.rels.countDocuments({ characterId: selfId, type: RelationType.FRIEND }).then((n) => this.achievements.record(selfId, 'friends', { value: n }));
    }
    return { targetId: target._id, type };
  }

  /** `delRelationship(id)`: only the caller's own rows, never couple / tutor / brother; pushes `onDelRelationship(id)`. */
  async remove(session: Session, id: number): Promise<void> {
    const selfId = session.characterId!;
    await relLock(selfId, async () => {
      const plan = planDelete((await this.rels.find({ characterId: selfId })).map(toRow), id);
      if (!plan.ok) {
        throw plan.reason === 'managed' ? RpcException.forbidden(MANAGED_DELETE_TEXT) : RpcException.notFound('Quan hệ không tồn tại');
      }
      await this.rels.deleteOne({ _id: id, characterId: selfId });
    });
    session.callback('onDelRelationship', id);
  }

  // ---- internal API for mentor / brotherhood / marriage ----

  /**
   * Writes `type` rows in both directions (creating or converting; each direction keeps its own intimacy). Refuses a pair where
   * either side blacklists the other. Callers push `pushSnapshot` / `onSetClose` themselves.
   */
  async link(a: number, b: number, type: RelationTypeId): Promise<void> {
    await relLocks(a, b, async () => {
      const [ab, ba] = await Promise.all([this.rels.findOne({ characterId: a, targetId: b }), this.rels.findOne({ characterId: b, targetId: a })]);
      if (ab?.type === RelationType.BLACK || ba?.type === RelationType.BLACK) {
        throw RpcException.forbidden('Không thể kết quan hệ với người trong danh sách đen');
      }
      await this.setType(a, b, type, ab);
      await this.setType(b, a, type, ba);
    });
  }

  /** Changes the type of the existing non-black rows of the pair (both directions), keeping intimacy; returns how many changed. */
  async convert(a: number, b: number, type: RelationTypeId): Promise<number> {
    return relLocks(a, b, async () => {
      const r = await this.rels.updateMany(
        { $or: [{ characterId: a, targetId: b }, { characterId: b, targetId: a }], type: { $ne: RelationType.BLACK } },
        { $set: { type } },
      );
      return r.modifiedCount;
    });
  }

  /** Deletes the non-black rows of the pair (both directions); returns how many were removed. */
  async unlink(a: number, b: number): Promise<number> {
    return relLocks(a, b, async () => {
      const r = await this.rels.deleteMany({
        $or: [{ characterId: a, targetId: b }, { characterId: b, targetId: a }], type: { $ne: RelationType.BLACK },
      });
      return r.deletedCount;
    });
  }

  /** Adds `delta` (floor 0) to the owner's friend / couple / tutor / brother row toward `other`; null when there is none. */
  async addIntimacy(owner: number, other: number, delta: number, otherName?: string): Promise<IntimacyChange | null> {
    if (!Number.isFinite(delta) || Math.trunc(delta) === 0) return null;
    const d = Math.trunc(delta);
    const filter = { characterId: owner, targetId: other, type: { $in: [...BOND_RELATION_TYPES] } };
    const before = await this.rels.findOneAndUpdate(
      filter,
      [{ $set: { intimacy: { $max: [0, { $add: [{ $ifNull: ['$intimacy', 0] }, d] }] } } }],
      { returnDocument: 'before', updatePipeline: true },
    ).lean();
    if (!before) return null;
    const { value, applied } = applyIntimacy(before.intimacy ?? 0, d);
    return { characterId: owner, otherId: other, otherName: otherName ?? (await this.nameOf(other)), total: value, applied };
  }

  /** Sets both directions to 0 (divorce): the changes carry `reset` so `announce` sends num 0. */
  async resetIntimacy(a: number, b: number): Promise<IntimacyChange[]> {
    const out: IntimacyChange[] = [];
    for (const [owner, other] of [[a, b], [b, a]]) {
      const before = await this.rels.findOneAndUpdate(
        { characterId: owner, targetId: other, type: { $in: [...BOND_RELATION_TYPES] } },
        { $set: { intimacy: 0 } },
        { returnDocument: 'before' },
      ).lean();
      if (before) out.push({ characterId: owner, otherId: other, otherName: await this.nameOf(other), total: 0, applied: -(before.intimacy ?? 0), reset: true });
    }
    return out;
  }

  /** `onSetClose(otherId, otherName, num)` to every online owner of a change. */
  announce(changes: readonly IntimacyChange[]): void {
    for (const c of changes) {
      this.scenes.findByCharacter(c.characterId)?.callback('onSetClose', c.otherId, c.otherName, c.reset ? 0 : setCloseNum(c.applied, c.total));
    }
  }

  // ---- internals ----

  private async setType(owner: number, target: number, type: RelationTypeId, existing: RelationshipDocument | null): Promise<void> {
    if (existing) {
      if (existing.type !== type) await this.rels.updateOne({ _id: existing._id }, { $set: { type } });
      return;
    }
    await this.insert(owner, target, type);
  }

  private async insert(characterId: number, targetId: number, type: RelationTypeId): Promise<RelationshipDocument> {
    try {
      return await this.rels.create({ _id: await this.nextId(), characterId, targetId, type, intimacy: 0 });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw RpcException.forbidden(refusalText('duplicate', type)); // lost a race
      throw e;
    }
  }

  private async nameOf(characterId: number): Promise<string> {
    return (await this.characters.findByIds([characterId]))[0]?.name ?? '';
  }

  private async entries(rows: RelationshipDocument[]): Promise<RelationEntry[]> {
    const chars = new Map((await this.characters.findByIds(rows.map((r) => r.targetId))).map((c) => [c._id, c]));
    const out: RelationEntry[] = [];
    for (const r of rows) {
      const c = chars.get(r.targetId);
      if (!c) continue;
      const entry: RelationEntry = {
        id: r._id, cid: c._id, name: c.name, level: c.level, classId: c.classId,
        iconCode: this.characters.iconCode(c.classId, c.gender), type: r.type as RelationTypeId, intimacy: r.intimacy ?? 0,
      };
      if (this.scenes.findByCharacter(c._id)) entry.data = { online: true };
      out.push(entry);
    }
    return out;
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('relationships', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}

function toRow(r: RelationshipDocument): RelationRow {
  return { id: r._id, targetId: r.targetId, type: r.type, intimacy: r.intimacy ?? 0 };
}
