// Quiz settlement per participant (Go rewards.go): counters + achievements, exp granted at once to an online player (an offline one
// keeps it in the persisted "owed" exp until the next login), the Túi Quà Đố Vui bags (item 4875, bound) ALWAYS delivered by system
// mail as in Go (M11: replaces the old owedBags workaround) and the rank buff of ranks 1-3 until the next start.
// `claimOwed` is the login hook: it pays owed exp and converts any legacy owedBags row into a mail (idempotent: the owed amounts are
// taken atomically before the mail is sent).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { QUIZ, QUIZ_END_NOTE, quizRankBuffMs } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { BuffService } from '../buff/buff.service';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { MailSystemService } from '../mail/mail-system.service';
import { systemSay } from '../npcscript/menu';
import { GrantService } from '../rewards/grant.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import type { SettleRow } from './quiz-contest';
import { QUIZ_MAIL, quizMailText, settleNote, settlePlan, totalBags, type SettlePlan } from './quiz-rewards';
import { CharacterQuizStats } from './quiz-stats.schema';

@Injectable()
export class QuizSettleService {
  private readonly logger = new Logger(QuizSettleService.name);
  /** characters with owed rewards (loaded at boot, kept in step) so the login hook is a set lookup */
  private readonly owed = new Set<number>();

  constructor(
    @InjectModel(CharacterQuizStats.name) private readonly stats: Model<CharacterQuizStats>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly scenes: SceneManager,
    private readonly grants: GrantService,
    private readonly buffs: BuffService,
    private readonly charStats: CharacterStatsService,
    private readonly achievements: AchievementEvents,
    private readonly gameData: GameDataService,
    private readonly mail: MailSystemService,
  ) {}

  async loadOwed(): Promise<void> {
    const rows = await this.stats.find({ $or: [{ owedExp: { $gt: 0 } }, { owedBags: { $gt: 0 } }] }, { characterId: 1 }).lean();
    for (const r of rows) this.owed.add(r.characterId);
  }

  hasOwed(cid: number): boolean {
    return this.owed.has(cid);
  }

  /** Name of the bag item for the notes (template name, falling back to the H5 label). */
  private async bagName(): Promise<string> {
    const tpl = await this.gameData.template(29, QUIZ.GIFT_BAG);
    return tpl?.name ? String(tpl.name) : 'Túi Quà Đố Vui';
  }

  /** Settles one participant and returns the onQuestionNote text. */
  async settle(row: SettleRow, now: number): Promise<string> {
    const doc = await this.chars.findById(row.cid, { level: 1 }).lean();
    const plan = doc ? settlePlan(row.points, row.rank, doc.level) : null;
    if (!plan) return QUIZ_END_NOTE;
    await this.stats.updateOne({ characterId: row.cid }, { $inc: { joined: 1, first: row.rank === 0 ? 1 : 0 } }, { upsert: true });
    this.achievements.record(row.cid, 'quizJoined', { amount: 1 });
    if (row.rank === 0) this.achievements.record(row.cid, 'quizFirst', { amount: 1 });
    await this.payExp(row.cid, plan);
    await this.mailBags(row.cid, totalBags(plan), row.points, row.rank, `quiz:${row.cid}:${Math.floor(now / 1000)}`);
    const buffName = await this.grantRankBuff(row.cid, plan, now);
    return settleNote({ points: row.points, plan, rank: row.rank, buffName, bagName: await this.bagName() });
  }

  /** Exp goes straight to an online player; an offline one keeps it owed until the next login. */
  private async payExp(cid: number, plan: SettlePlan): Promise<void> {
    const session = this.scenes.findByCharacter(cid);
    if (session) {
      await this.grants.grant(session, [{ kind: 'exp', amount: plan.exp }]);
      return;
    }
    await this.stats.updateOne({ characterId: cid }, { $inc: { owedExp: plan.exp } }, { upsert: true });
    this.owed.add(cid);
  }

  /** Go rewards.go:105-130: one system mail with the bound bag item (count = tier bags + rank bags). */
  private async mailBags(cid: number, bags: number, points: number, rank: number, source: string): Promise<void> {
    if (bags <= 0) return;
    const sent = await this.mail.sendSystemMail({
      receiverId: cid, senderName: QUIZ_MAIL.SENDER, title: QUIZ_MAIL.TITLE, text: quizMailText(points, rank),
      item: { templateId: QUIZ.GIFT_BAG, table: 29, count: bags, bound: true }, source,
    });
    if (!sent) this.logger.warn(`character ${cid}: quiz bag mail x${bags} was not sent`);
  }

  /** Buff 2098 / 2097 / 2096 until the next scheduled start (at least a day); pushes upLongBuff + the stat refresh when online. */
  private async grantRankBuff(cid: number, plan: SettlePlan, now: number): Promise<string | null> {
    if (plan.buffId === null) return null;
    try {
      const buff = await this.buffs.grant(cid, plan.buffId, Math.ceil(quizRankBuffMs(now) / 1000));
      const session = this.scenes.findByCharacter(cid);
      if (session) {
        session.callback('upLongBuff', buff);
        await this.charStats.refreshPush(session);
      }
      return String(this.gameData.getBuff(plan.buffId)?.name ?? `#${plan.buffId}`);
    } catch (e) {
      this.logger.warn(`character ${cid}: rank buff ${plan.buffId} failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Login / claim: pays the owed exp and mails the bags of a legacy owedBags row (from before M11). The owed amounts are taken
   * atomically (only what was read) before they are credited.
   */
  claimOwed(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (!this.owed.has(cid)) return Promise.resolve();
    return withCharLock(cid, async () => {
      const row = await this.stats.findOne({ characterId: cid }, { owedExp: 1, owedBags: 1 }).lean();
      const exp = row?.owedExp ?? 0;
      const bags = row?.owedBags ?? 0;
      if (exp <= 0 && bags <= 0) {
        this.owed.delete(cid);
        return;
      }
      const taken = await this.stats.updateOne(
        { characterId: cid, owedExp: exp, owedBags: bags }, { $inc: { owedExp: -exp, owedBags: -bags } },
      );
      if (taken.modifiedCount !== 1) return;
      this.owed.delete(cid);
      if (exp > 0) await this.grants.grant(session, [{ kind: 'exp', amount: exp }]);
      if (bags > 0) {
        const sent = await this.mail.sendSystemMail({
          receiverId: cid, senderName: QUIZ_MAIL.SENDER, title: QUIZ_MAIL.TITLE,
          text: 'Phần thưởng Đố Vui Có Thưởng chưa nhận được gửi kèm thư.',
          item: { templateId: QUIZ.GIFT_BAG, table: 29, count: bags, bound: true },
        });
        if (!sent) this.logger.error(`character ${cid}: owed quiz bag mail x${bags} failed after the row was cleared`);
      }
      systemSay(session, `Đã nhận phần thưởng Đố Vui Có Thưởng: ${exp} kinh nghiệm${bags > 0 ? `, Túi Quà Đố Vui x${bags} (gửi qua thư)` : ''}.`);
    });
  }
}
