// Friends / blacklist persistence + pushes: snapshot for initViewImC, add by name (immediate, one-directional, friend <-> black
// swap) and delete. Online marker = the other character has a bound session now (snapshot only, no live presence push).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RelationType, type InitViewImC, type RelationEntry, type RelationTypeId } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { Counter } from '../character/counter.schema';
import { canDelete, planAdd, type RelationRow } from './relationship-rules';
import { Relationship, type RelationshipDocument } from './relationship.schema';

const REFUSALS = {
  self: 'Không thể thêm chính mình',
  duplicate: 'Người chơi này đã có trong danh sách',
  full: 'Danh sách đã đầy',
  'invalid-type': 'Loại quan hệ không hợp lệ',
} as const;

@Injectable()
export class RelationshipService {
  constructor(
    @InjectModel(Relationship.name) private readonly rels: Model<Relationship>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  /** Both lists, newest first; rows of deleted characters are skipped. */
  async snapshot(characterId: number): Promise<InitViewImC> {
    const rows = await this.rels.find({ characterId }).sort({ _id: -1 });
    const entries = await this.entries(rows);
    return {
      friend: entries.filter((e) => e.type === RelationType.FRIEND),
      black: entries.filter((e) => e.type === RelationType.BLACK),
    };
  }

  /** `initViewImC`: fire-and-forget on the wire; the answer is the `onInitViewImC` push. */
  async sendSnapshot(session: Session): Promise<void> {
    session.callback('onInitViewImC', await this.snapshot(session.characterId!));
  }

  /** `addRelationByName`: unknown name -> `onAddRelationByName(-1, type)`; other refusals throw (toast on the client). */
  async addByName(session: Session, name: string, type: RelationTypeId): Promise<void> {
    const selfId = session.characterId!;
    const target = await this.characters.findByName(name);
    if (!target) {
      session.callback('onAddRelationByName', -1, type);
      return;
    }
    const rows = await this.rels.find({ characterId: selfId });
    const plan = planAdd(rows.map(toRow), selfId, target._id, type);
    if (!plan.ok) throw RpcException.forbidden(REFUSALS[plan.reason]);
    if (plan.replaceId !== null) {
      await this.rels.deleteOne({ _id: plan.replaceId, characterId: selfId });
      session.callback('onDelRelationship', plan.replaceId);
    }
    let row: RelationshipDocument;
    try {
      row = await this.rels.create({ _id: await this.nextId(), characterId: selfId, targetId: target._id, type });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw RpcException.forbidden(REFUSALS.duplicate); // lost a race
      throw e;
    }
    const [entry] = await this.entries([row]);
    session.callback('onAddRelationship', entry);
  }

  /** `delRelationship(id)`: only the caller's own rows; pushes `onDelRelationship(id)`. */
  async remove(session: Session, id: number): Promise<void> {
    const selfId = session.characterId!;
    const rows = await this.rels.find({ characterId: selfId });
    if (!canDelete(rows.map(toRow), id)) throw RpcException.notFound('Quan hệ không tồn tại');
    await this.rels.deleteOne({ _id: id, characterId: selfId });
    session.callback('onDelRelationship', id);
  }

  private async entries(rows: RelationshipDocument[]): Promise<RelationEntry[]> {
    const chars = new Map((await this.characters.findByIds(rows.map((r) => r.targetId))).map((c) => [c._id, c]));
    const out: RelationEntry[] = [];
    for (const r of rows) {
      const c = chars.get(r.targetId);
      if (!c) continue;
      const entry: RelationEntry = {
        id: r._id, cid: c._id, name: c.name, level: c.level, classId: c.classId,
        iconCode: this.characters.iconCode(c.classId, c.gender), type: r.type as RelationTypeId,
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
  return { id: r._id, targetId: r.targetId, type: r.type };
}
