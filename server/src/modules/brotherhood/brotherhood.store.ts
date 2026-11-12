// Brotherhood persistence + the scene suffix lookup (M14 C). Lives in the core module (models + CharacterService only) so the
// scene transport can decorate payloads with `broT` without importing the feature module (cycle through combat). Group lookups,
// the 30 s title cache (Go titleCacheTTL) and the writes the ceremony service composes: create / add / remove / dissolve / title.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { SceneCharacter } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { Counter } from '../character/counter.schema';
import { Brotherhood, BrotherhoodMember } from './brotherhood.schema';

export interface GroupMember {
  id: number;
  name: string;
  level: number;
}

export interface GroupView {
  id: number;
  title: string;
  members: GroupMember[];
}

const TITLE_TTL_MS = 30_000;

/** Raised when a member insert hits the unique index (somebody joined another group meanwhile). */
export class MemberTakenError extends Error {}

@Injectable()
export class BrotherhoodStore {
  private readonly titles = new Map<number, { title: string; at: number }>();
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    @InjectModel(Brotherhood.name) private readonly groups: Model<Brotherhood>,
    @InjectModel(BrotherhoodMember.name) private readonly members: Model<BrotherhoodMember>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly characters: CharacterService,
  ) {}

  /** The character's group with its members (join order), or null. */
  async groupOf(characterId: number): Promise<GroupView | null> {
    const own = await this.members.findOne({ characterId }).lean();
    return own ? this.view(own.brotherhoodId) : null;
  }

  async view(groupId: number): Promise<GroupView | null> {
    const [group, rows] = await Promise.all([
      this.groups.findById(groupId).lean(),
      this.members.find({ brotherhoodId: groupId }).sort({ joinedAt: 1, _id: 1 }).lean(),
    ]);
    if (!group || rows.length === 0) return null;
    const docs = new Map((await this.characters.findByIds(rows.map((r) => r.characterId))).map((c) => [c._id, c]));
    const members = rows.flatMap((r) => {
      const c = docs.get(r.characterId);
      return c ? [{ id: c._id, name: c.name, level: c.level }] : [];
    });
    return { id: groupId, title: group.title ?? '', members };
  }

  /** Group id of every given character that has one (characters without a group are absent). */
  async groupIds(characterIds: readonly number[]): Promise<Map<number, number>> {
    const rows = await this.members.find({ characterId: { $in: [...characterIds] } }).lean();
    return new Map(rows.map((r) => [r.characterId, r.brotherhoodId]));
  }

  /** Group title suffix of a character, "" when it has none (cached 30 s; every write forgets its members). */
  async titleOf(characterId: number): Promise<string> {
    const hit = this.titles.get(characterId);
    if (hit && this.now() - hit.at < TITLE_TTL_MS) return hit.title;
    const own = await this.members.findOne({ characterId }, { brotherhoodId: 1 }).lean();
    const group = own ? await this.groups.findById(own.brotherhoodId, { title: 1 }).lean() : null;
    const title = group?.title ?? '';
    this.titles.set(characterId, { title, at: this.now() });
    return title;
  }

  forget(...ids: number[]): void {
    for (const id of ids) this.titles.delete(id);
  }

  /** Scene payload decoration: `broT` when the character's group has a title. */
  async decorate<T extends SceneCharacter>(sc: T): Promise<T> {
    const title = await this.titleOf(sc.id);
    return title ? { ...sc, broT: title } : sc;
  }

  // ---- writes (callers hold the brother locks) ----

  /** New group of `ids`; throws MemberTakenError (nothing left behind) when one of them is already in a group. */
  async createGroup(ids: readonly number[]): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('brotherhoods', { $inc: { seq: 1 } }, { new: true, upsert: true });
    const id = doc.seq;
    await this.groups.create({ _id: id, title: '' });
    try {
      await this.insertMembers(id, ids);
    } catch (e) {
      await this.groups.deleteOne({ _id: id });
      throw e;
    }
    return id;
  }

  /** Adds newcomers to a group; throws MemberTakenError (newcomers removed again) when one is taken. */
  async addMembers(groupId: number, ids: readonly number[]): Promise<void> {
    await this.insertMembers(groupId, ids);
  }

  /** Removes a member row; true when it existed. */
  async removeMember(characterId: number): Promise<boolean> {
    const r = await this.members.deleteOne({ characterId });
    this.forget(characterId);
    return r.deletedCount > 0;
  }

  /** Deletes the group and every member row; returns the former member ids. */
  async dissolve(groupId: number): Promise<number[]> {
    const rows = await this.members.find({ brotherhoodId: groupId }).lean();
    await this.members.deleteMany({ brotherhoodId: groupId });
    await this.groups.deleteOne({ _id: groupId });
    const ids = rows.map((r) => r.characterId);
    this.forget(...ids);
    return ids;
  }

  async setTitle(groupId: number, title: string): Promise<void> {
    await this.groups.updateOne({ _id: groupId }, { $set: { title } });
    const rows = await this.members.find({ brotherhoodId: groupId }).lean();
    this.forget(...rows.map((r) => r.characterId));
  }

  private async insertMembers(groupId: number, ids: readonly number[]): Promise<void> {
    try {
      await this.members.insertMany(ids.map((characterId) => ({ characterId, brotherhoodId: groupId })), { ordered: true });
    } catch (e) {
      await this.members.deleteMany({ brotherhoodId: groupId, characterId: { $in: [...ids] } });
      this.forget(...ids);
      if ((e as { code?: number }).code === 11000) throw new MemberTakenError('member already in a group');
      throw e;
    }
    this.forget(...ids);
  }
}
