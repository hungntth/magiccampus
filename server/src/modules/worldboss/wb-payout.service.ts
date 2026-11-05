// World boss money side: the per-battle and settlement exp / bound silver / Chiến tích (persisted straight away, offline too; the
// pushes wait for battlePlayEnd), gold spending, vitals, and the gift bags: bags are unpacked at grant (decision 11); what cannot be
// handed over (offline, full bag, left unclaimed) is mailed as in Go exit.go mailPendingAward (M11, one mail per bag item). A failed
// mail falls back to character_wb_owed, which login / claim converts to mail again (legacy rows from before M11 included).
// Chiến tích (Go Character.Honor, client key expBattle) is stored in the special currency `honor` (decision 13: no honor field exists).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { WbAwardItem } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { systemSay } from '../npcscript/menu';
import { MailSystemService } from '../mail/mail-system.service';
import { CurrencyService } from '../progression/currency.service';
import { applyExp } from '../quest/quest.rules';
import { GrantService, type Grant } from '../rewards/grant.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { WB_TEXT_SERVER as T } from './wb-config';
import { CharacterWbOwed } from './wb-owed.schema';
import { battleHonor, battleReward, settlementBonus } from './wb-rules';

export interface Gain {
  exp: number;
  money: number;
  honor: number;
  leveled: boolean;
  level: number;
}

@Injectable()
export class WbPayoutService {
  private readonly logger = new Logger(WbPayoutService.name);
  /** characters with owed bags (loaded at boot, kept in step) so the login hook is a set lookup */
  private readonly owed = new Set<number>();
  rng: () => number = Math.random;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterWbOwed.name) private readonly owedDocs: Model<CharacterWbOwed>,
    private readonly characters: CharacterService,
    private readonly stats: CharacterStatsService,
    private readonly currencies: CurrencyService,
    private readonly achievements: AchievementEvents,
    private readonly grants: GrantService,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly mail: MailSystemService,
  ) {}

  async loadOwed(): Promise<void> {
    for (const r of await this.owedDocs.find({ 'items.0': { $exists: true } }, { characterId: 1 }).lean()) this.owed.add(r.characterId);
  }

  // ---- exp / silver / honor ---------------------------------------------------------------------------------------------

  /** Exp (with level-ups), bound silver and Chiến tích in one persisted credit; works for offline characters. */
  private async credit(cid: number, exp: number, money: number, honor: number): Promise<Gain> {
    const doc = await this.chars.findById(cid, { level: 1, exp: 1, attrPoints: 1 }).lean();
    if (!doc) return { exp: 0, money: 0, honor: 0, leveled: false, level: 0 };
    const gained = applyExp(doc, exp);
    const $set = { level: gained.level, exp: gained.exp, attrPoints: gained.attrPoints };
    const $inc: Record<string, number> = {};
    if (gained.statGain > 0) for (const k of ['strength', 'agility', 'stamina', 'intelligence', 'energy']) $inc[k] = gained.statGain;
    if (money > 0) $inc.moneyBind = money;
    const saved = await this.chars.findByIdAndUpdate(cid, Object.keys($inc).length > 0 ? { $set, $inc } : { $set }, { new: true, projection: { moneyBind: 1, money: 1 } });
    if (honor > 0) await this.currencies.credit(cid, 'honor', honor);
    if (gained.leveled) this.achievements.record(cid, 'level', { value: gained.level });
    if (saved && money > 0) this.achievements.record(cid, 'silver', { value: saved.moneyBind + (saved.money ?? 0) });
    return { exp, money, honor, leveled: gained.leveled, level: gained.level };
  }

  creditBattle(cid: number, level: number, damage: number): Promise<Gain> {
    const r = battleReward(level, damage);
    return this.credit(cid, r.exp, r.money, battleHonor(damage));
  }

  creditSettlement(cid: number, level: number, damage: number, total: number): Promise<Gain> {
    const r = settlementBonus(level, damage, total);
    return this.credit(cid, r.exp, r.money, 0);
  }

  /** Stats push for an online character after earning (the exp / silver / level / currency refresh, onPlayerLevelUp on a level gain). */
  async pushGain(session: Session, leveled: boolean): Promise<void> {
    const cid = session.characterId!;
    const update = await this.stats.refreshPayload(cid);
    session.callback('onUPP', update);
    if (leveled) session.callback('onPlayerLevelUp', { id: cid, level: update.level ?? 0, exp: update.exp ?? 0, lp: update.attrPoints ?? 0 });
    await this.currencies.push(session);
  }

  // ---- vitals / gold ----------------------------------------------------------------------------------------------------

  /** Full HP / MP of the effective (gear and buff aware) maximum, death marker cleared. */
  async restoreVitals(cid: number): Promise<void> {
    const st = await this.stats.compute(cid);
    await this.chars.updateOne({ _id: cid }, { $set: { currentHp: st.maxHp, currentMp: st.maxMp, deathAt: null } });
  }

  /** Real gold only (Go SpendGold, never Kim phiếu); null when short. */
  spendGold(cid: number, cost: number): Promise<number | null> {
    return this.characters.spendMoney(cid, 'gold', cost);
  }

  // ---- gift bags --------------------------------------------------------------------------------------------------------

  /** Bag items with name and icon for the award strip / result window. */
  async awardDtos(items: readonly WbAwardItem[]): Promise<WbAwardItem[]> {
    const out: WbAwardItem[] = [];
    for (const it of items) {
      const tpl = await this.gameData.template(29, it.itemId);
      out.push({ itemId: it.itemId, num: it.num, name: String(tpl?.name ?? `#${it.itemId}`), iconCode: String(tpl?.icon_code ?? 0) });
    }
    return out;
  }

  /** The contents of every bag (one award-picker draw per bag); a bag without rows is granted as the bag item itself. */
  bagGrants(items: readonly WbAwardItem[]): Grant[] {
    const out: Grant[] = [];
    for (const it of items) {
      for (let i = 0; i < it.num; i++) {
        const contents = this.grants.unpack(it.itemId, this.rng);
        const bag: Grant = { kind: 'item', table: 29, templateId: it.itemId, qty: 1, bound: true };
        out.push(...(contents.length > 0 ? contents : [bag]));
      }
    }
    return out;
  }

  /** Grants the bags to an online character; false (nothing granted) when the bag cannot hold the contents. */
  async deliver(session: Session, items: readonly WbAwardItem[]): Promise<boolean> {
    if (items.length === 0) return true;
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const grants = this.bagGrants(items);
      if (!(await this.grants.fits(cid, grants))) return false;
      await this.grants.grant(session, grants);
      return true;
    });
  }

  /** Go mailPendingAward: one system mail per bag item (bound), ranks in the text; returns the items whose mail failed. */
  private async mailAll(
    cid: number, items: readonly WbAwardItem[], ranks: { classRank: number; worldRank: number }, key: string,
  ): Promise<WbAwardItem[]> {
    const label = (r: number): string => (r > 0 ? String(r) : '-');
    const failed: WbAwardItem[] = [];
    for (const [i, it] of items.entries()) {
      const sent = await this.mail.sendSystemMail({
        receiverId: cid, senderName: T.MAIL_SENDER, title: T.MAIL_TITLE, text: T.MAIL_BODY(label(ranks.classRank), label(ranks.worldRank)),
        item: { templateId: it.itemId, table: 29, count: it.num, bound: true }, source: `wb:${key}:${cid}:${i}:${it.itemId}`,
      });
      if (!sent) failed.push(it);
    }
    return failed;
  }

  /** Persists items as owed (no lock: callers hold it or take it). */
  private async keepOwed(cid: number, items: readonly WbAwardItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.owedDocs.updateOne({ characterId: cid }, { $push: { items: { $each: items.map((i) => ({ ...i })) } } }, { upsert: true });
    this.owed.add(cid);
    this.logger.warn(`character ${cid}: ${items.length} world boss gift bag(s) kept as owed (mail failed)`);
  }

  /** Unclaimed bags of a finished run become system mails (offline, full bag, left without claiming); `runSeq` keys the idempotency. */
  async owe(cid: number, items: readonly WbAwardItem[], ranks: { classRank: number; worldRank: number }, runSeq: number): Promise<void> {
    if (items.length === 0) return;
    const failed = await this.mailAll(cid, items, ranks, `${runSeq}`);
    if (failed.length < items.length) {
      this.logger.log(`character ${cid}: ${items.length - failed.length} world boss gift bag(s) mailed`);
      if (this.isOnline(cid)) this.scenes.findByCharacter(cid)?.callback('onSystemMidMsgOrNote', T.MAILED);
    }
    if (failed.length > 0) await withCharLock(cid, () => this.keepOwed(cid, failed));
  }

  /** Login hook: converts what was owed (mail failures, rows from before M11) into mails; failures stay owed. */
  claimOwed(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (!this.owed.has(cid)) return Promise.resolve();
    return withCharLock(cid, async () => {
      const doc = await this.owedDocs.findOne({ characterId: cid }, { items: 1 }).lean();
      const items = doc?.items ?? [];
      if (items.length === 0) {
        this.owed.delete(cid);
        return;
      }
      // the list is emptied (atomic) before it is mailed
      const taken = await this.owedDocs.updateOne({ characterId: cid, items: { $size: items.length } }, { $set: { items: [] } });
      if (taken.modifiedCount !== 1) return;
      this.owed.delete(cid);
      const failed = await this.mailAll(cid, items, { classRank: 0, worldRank: 0 }, `owed:${Date.now()}`);
      await this.keepOwed(cid, failed);
      if (failed.length < items.length) systemSay(session, T.OWED_CLAIMED);
    });
  }

  isOnline(cid: number): boolean {
    return this.scenes.findByCharacter(cid) !== undefined;
  }

}
