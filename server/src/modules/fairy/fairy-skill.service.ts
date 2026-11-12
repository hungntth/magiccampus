// Tiểu Tinh Linh skills (Go application/fairy/skill.go + battle_skills.go): onSkill (learn a Bí Kíp from the bag, once per family, grow level >=
// the book's req_level), upFairySkill (1 / 3 Sách Huấn Luyện Truyền Nhân 3583), fairySkillConfigChange (rotation lists, stored as sent after
// normalising) and the battle accessor for combat (phase G2): the guarding fairy's rotation of learned active (type 6) skills.

import { Injectable } from '@nestjs/common';
import { FAIRY, SlotType, type FairySkillReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { activeRotation, bestPerFamily, planLearn, planUpSkill, type FairySkillTpl, type FamilyOf, type SkillOf } from './fairy-skills';
import { guardFairy, parseSkillConfig } from './fairy-state';
import { FairyService } from './fairy.service';

/** What combat needs to cast the guarding fairy's active skills (phase G2). */
export interface FairyBattleKit {
  fairyId: number;
  tid: number;
  /** Five TBL_SKILL ids of the selected list, each at the learned level; 0 = empty slot. Slot i casts on rounds where (round - 1) % 5 === i. */
  rotation: number[];
  /** Every learned active skill, one per family at its highest level. */
  learned: number[];
}

@Injectable()
export class FairySkillService {
  constructor(
    private readonly fairies: FairyService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
  ) {}

  readonly skillOf: SkillOf = (id) => this.gameData.skill(id);
  private readonly familyRows: FamilyOf = (code) => this.gameData.skillIndex().byCode.get(code) ?? [];

  /** onSkill(id, bookItemId): the book is spent first, then the skill stored in the first free slot. */
  learn(session: Session, id: number, bookItemId: number): Promise<FairySkillReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cur = await this.fairies.fairy(cid, id);
      const book = (await this.inventory.byIds(cid, [bookItemId])).find((b) => b.slotType === SlotType.BAG);
      if (!cur || !book || book.tplType !== FAIRY.BOOK_TYPE) return { flag: false, sindex: 1 };
      const plan = planLearn(cur.f, book.tid, book.reqLevel, this.skillOf);
      if ('error' in plan) return { flag: false, sindex: plan.error };
      const left = await this.inventory.consumeStack(cid, bookItemId, 1);
      if (!left) return { flag: false, sindex: 1 };
      cur.f.skillFlag[plan.sindex] = plan.skill;
      await this.fairies.save(cid, cur.state);
      await this.fairies.slotPush(session, bookItemId, left);
      await this.fairies.refreshIfGuard(session, cur.f);
      return { flag: true, id, sindex: plan.sindex, skill: plan.skill };
    });
  }

  /** upFairySkill(id, skillIndex 1..20): books spent first (sindex 2 when short), then the slot moves to the next level. */
  upgrade(session: Session, id: number, index: number): Promise<FairySkillReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cur = await this.fairies.fairy(cid, id);
      if (!cur) return { flag: false, sindex: 2 };
      const plan = planUpSkill(cur.f, index, this.skillOf, this.familyRows);
      if ('error' in plan) return { flag: false, sindex: plan.error };
      const have = (await this.inventory.countByTemplate(cid, [FAIRY.SKILL_UP_ITEM])).get(FAIRY.SKILL_UP_ITEM) ?? 0;
      if (have < plan.books) return { flag: false, sindex: 2 };
      let spent: Awaited<ReturnType<InventoryService['removeByTemplate']>>;
      try {
        spent = await this.inventory.removeByTemplate(cid, FAIRY.SKILL_UP_ITEM, plan.books);
      } catch (e) {
        if (e instanceof RpcException) return { flag: false, sindex: 2 };
        throw e;
      }
      cur.f.skillFlag[plan.sindex] = plan.skill;
      await this.fairies.save(cid, cur.state);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      await this.fairies.refreshIfGuard(session, cur.f);
      return { flag: true, id, sindex: plan.sindex, skill: plan.skill };
    });
  }

  /** fairySkillConfigChange(id, config): normalised and stored (no push, like Go). */
  setConfig(session: Session, id: number, raw: unknown): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.fairies.load(cid);
      const f = state.fairies.get(id);
      if (!f) throw RpcException.notFound('fairy');
      f.skillConfig = parseSkillConfig(raw);
      await this.fairies.save(cid, state);
      return null;
    });
  }

  /** Battle accessor (phase G2): the guarding fairy's rotation, null when no fairy guards or nothing would cast. Read at battle start. */
  async battleSkills(cid: number): Promise<FairyBattleKit | null> {
    const f = guardFairy(await this.fairies.load(cid));
    if (!f) return null;
    const rotation = activeRotation(f, this.skillOf);
    if (!rotation) return null;
    const learned = [...bestPerFamily(f, this.skillOf, FAIRY.SKILL_ACTIVE).values()].map((t: FairySkillTpl) => t.id).sort((a, b) => a - b);
    return { fairyId: f.id, tid: f.tid, rotation, learned };
  }
}
