// Skill learning (M9 phase B): skillLearnByClient upgrades (family + 1), addTrainingSkill (Luyện chains), skill books (checked
// here, consumed by inventory) and the skill window rows. Costs are spent with one conditional $inc (exp never below the level
// floor, the whole price from one money field) before the skill row changes. Results are ordered pushes for the RPC layer.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { levelFloor, SKILL_ERR, skillPool, SkillUseEnv, type SkillLearnView } from '@mc/shared';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import type { SkillTemplate } from '../gamedata/skill-data';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { CharacterStatsService } from '../stats/character-stats.service';
import { bookSkillKey, chargePlan, familyEntry, pickBookSkill, upgradeError, validateSkill, type LearnChar } from './skill-learn.rules';
import { buildLearnList } from './skill-learn.view';
import { CharacterSkill } from './skill.schema';
import { SkillService } from './skill.service';

export const ITEM_TYPE_SKILL_BOOK = 505;
const PASSIVE = 11;

export type LearnResult = { ok: true; pushes: Push[] } | { ok: false; err: string };

type CharFacts = LearnChar & { exp: number; money: number; moneyBind: number };

@Injectable()
export class SkillLearnService {
  private books: Map<string, { tid: number; name: string }> | null = null;

  constructor(
    @InjectModel(CharacterSkill.name) private readonly skills: Model<CharacterSkill>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly skillList: SkillService,
    private readonly stats: CharacterStatsService,
  ) {}

  async learnList(characterId: number): Promise<SkillLearnView[]> {
    const c = await this.facts(characterId);
    const learned = await this.skills.find({ characterId }, { skillId: 1 }).sort({ skillId: 1 }).lean();
    return buildLearnList({
      level: c.level, classId: c.classId, learned, lookup: (id) => this.gameData.skill(id), index: this.gameData.skillIndex(),
      books: await this.bookIndex(),
    });
  }

  /** skillLearnByClient(nextSid): exactly the next level of a learned family, paid with exp + silver. */
  upgrade(characterId: number, nextSid: number): Promise<LearnResult> {
    return withCharLock(characterId, async () => {
      const next = this.gameData.skill(nextSid);
      if (!next) return { ok: false, err: SKILL_ERR.NOT_LEARNED };
      const c = await this.facts(characterId);
      const why = validateSkill(next, c);
      if (why) return { ok: false, err: why };
      const learned = await this.skills.find({ characterId }).lean();
      const cur = familyEntry(learned, next, (id) => this.gameData.skill(id));
      const fam = upgradeError(cur?.tpl ?? null, next);
      if (fam || !cur) return { ok: false, err: fam ?? SKILL_ERR.NOT_LEARNED };
      const paid = await this.spend(characterId, c, next);
      if (!paid.ok) return paid;
      await this.skills.updateOne({ _id: cur.row._id }, { $set: { skillId: next.id, level: next.level } });
      return { ok: true, pushes: await this.pushes(characterId, next) };
    });
  }

  /** addTrainingSkill(sid): the family's level-1 Luyện row, refused when any level is owned. */
  learnTraining(characterId: number, sid: number): Promise<LearnResult> {
    return withCharLock(characterId, async () => {
      const asked = this.gameData.skill(sid);
      if (!asked || asked.useEnv !== SkillUseEnv.TRAINING) return { ok: false, err: SKILL_ERR.NOT_TRAINING };
      const first = this.gameData.skillIndex().byCode.get(asked.codeName)?.[0] ?? asked;
      const c = await this.facts(characterId);
      const why = validateSkill(first, c);
      if (why) return { ok: false, err: why };
      if (await this.ownsFamily(characterId, first)) return { ok: false, err: SKILL_ERR.SAME_LEVEL };
      const paid = await this.spend(characterId, c, first);
      if (!paid.ok) return paid;
      await this.skills.create({ characterId, skillId: first.id, level: first.level, position: 0 });
      return { ok: true, pushes: await this.pushes(characterId, first) };
    });
  }

  /** Book check (no cost): the skill the book teaches, validated and not yet owned. Called inside the inventory lock. */
  async bookSkill(characterId: number, bookName: string): Promise<{ ok: true; tpl: SkillTemplate } | { ok: false; err: string }> {
    const c = await this.facts(characterId);
    const tpl = pickBookSkill(this.gameData.skillIndex().level1, bookName, c.classId);
    if (!tpl) return { ok: false, err: SKILL_ERR.NO_BOOK_SKILL };
    const why = validateSkill(tpl, c);
    if (why) return { ok: false, err: why };
    if (await this.ownsFamily(characterId, tpl)) return { ok: false, err: SKILL_ERR.SAME_LEVEL };
    return { ok: true, tpl };
  }

  /** After the book was consumed: creates the row and returns the skill pushes. */
  async grantBookSkill(characterId: number, tpl: SkillTemplate): Promise<Push[]> {
    await this.skills.updateOne({ characterId, skillId: tpl.id }, { $setOnInsert: { level: tpl.level, position: 0 } }, { upsert: true });
    return this.pushes(characterId, tpl, false);
  }

  /** Learned skill ids whose family contains `skillId` at a level >= its own (Go HasSkill family branch). */
  async ownsFamilyAtLeast(characterId: number, skillId: number): Promise<boolean> {
    const tpl = this.gameData.skill(skillId);
    if (!tpl) return false;
    if (await this.skillList.owns(characterId, skillId)) return true;
    const learned = await this.skills.find({ characterId }, { skillId: 1 }).lean();
    const cur = familyEntry(learned, tpl, (id) => this.gameData.skill(id));
    return cur !== null && cur.tpl.level >= tpl.level;
  }

  private async ownsFamily(characterId: number, tpl: SkillTemplate): Promise<boolean> {
    const learned = await this.skills.find({ characterId }, { skillId: 1 }).lean();
    return learned.some((r) => r.skillId === tpl.id) || familyEntry(learned, tpl, (id) => this.gameData.skill(id)) !== null;
  }

  private async facts(characterId: number): Promise<CharFacts> {
    const d = await this.chars.findById(characterId, { level: 1, classId: 1, cl: 1, exp: 1, money: 1, moneyBind: 1 }).lean();
    return {
      level: d?.level ?? 1, classId: d?.classId ?? 0, cl: d?.cl ?? 0, exp: d?.exp ?? 0, money: d?.money ?? 0, moneyBind: d?.moneyBind ?? 0,
    };
  }

  /** One conditional $inc: the level is unchanged, exp stays >= floor + cost, the chosen money field covers the price. */
  private async spend(characterId: number, c: CharFacts, tpl: SkillTemplate): Promise<{ ok: true } | { ok: false; err: string }> {
    const plan = chargePlan(tpl, { pool: skillPool(c.exp, c.level), money: c.money, moneyBind: c.moneyBind });
    if (!plan.ok) return plan;
    if (tpl.expSkill <= 0 && !plan.field) return { ok: true };
    const filter: Record<string, unknown> = { _id: characterId, level: c.level, exp: { $gte: levelFloor(c.level) + tpl.expSkill } };
    const inc: Record<string, number> = { exp: -tpl.expSkill };
    if (plan.field) {
      filter[plan.field] = { $gte: tpl.price };
      inc[plan.field] = -tpl.price;
    }
    const res = await this.chars.updateOne(filter, { $inc: inc });
    return res.modifiedCount === 1 ? { ok: true } : { ok: false, err: SKILL_ERR.NO_EXP };
  }

  /** onUPP {expSkill, exp, money, moneyBind} (wallet only when charged), onSkillUpdate, onMWeaponSkillUpdate, passive stat refresh. */
  private async pushes(characterId: number, tpl: SkillTemplate, wallet = true): Promise<Push[]> {
    const out: Push[] = [];
    if (wallet) {
      const d = await this.facts(characterId);
      out.push(push('onUPP', { expSkill: skillPool(d.exp, d.level), exp: d.exp, money: d.money, moneyBind: d.moneyBind }));
    }
    const list = await this.skillList.list(characterId);
    out.push(push('onSkillUpdate', list), push('onMWeaponSkillUpdate', list, true));
    if (tpl.type === PASSIVE) out.push(push('onUPP', await this.stats.refreshPayload(characterId)));
    return out;
  }

  /** Type-505 book templates keyed by the taught skill-name key (loaded once). */
  private async bookIndex(): Promise<Map<string, { tid: number; name: string }>> {
    if (this.books) return this.books;
    const rows = await this.gameData.rows('data_tbl_item_template', { type: ITEM_TYPE_SKILL_BOOK });
    const out = new Map<string, { tid: number; name: string }>();
    for (const r of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
      const name = String(r.name ?? '');
      const key = bookSkillKey(name);
      if (key && !out.has(key)) out.set(key, { tid: Number(r.id), name });
    }
    this.books = out;
    return out;
  }
}
