// AchievementService (M7 phase B): login snapshot with the absolute-value backfill, the reward claim and the panel catalog.
// Claim order (spend before credit): gate -> resolve reward -> bag room -> conditional claim mark -> grant (mark undone if the grant fails).
// Pushes: onAddItem / onAddCharactorSlot, onAddTitle (+ onAchieveTitle), then updateAchieveAwardLog {aid, num} (Go sends it first); onRedMsg on refusal.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { RelationType, type AchieveAwardLog, type AchieveCatalog, type PlayerData } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GuildMemberRow } from '../guild/guild.schema';
import { withCharLock } from '../inventory/char-lock';
import { Pet } from '../pet/pet.schema';
import { Relationship } from '../social/relationship.schema';
import { CharacterTitle } from '../title/title.schema';
import { AchievementEvents } from './achievement-events.service';
import { AchievementRewardService } from './achievement-reward.service';
import { buildCatalog, claimGate, snapshotOf, type ClaimGate } from './achievement-rules';
import { AchievementState } from './achievement.schema';

const REFUSALS: Record<Exclude<ClaimGate, 'ok'>, string> = {
  'no-reward': 'Thành tựu này không có phần thưởng.',
  'not-done': 'Chưa đạt thành tựu này.',
  claimed: 'Đã nhận phần thưởng thành tựu này.',
};
const NO_DATA = 'Phần thưởng thành tựu chưa có dữ liệu.';
const NO_ROOM = 'Túi không đủ chỗ trống!';

/** Local calendar day, YYYY-MM-DD. */
export const dayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Injectable()
export class AchievementService {
  private readonly logger = new Logger(AchievementService.name);
  private catalogCache: AchieveCatalog | null = null;

  constructor(
    @InjectModel(AchievementState.name) private readonly states: Model<AchievementState>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(CharacterTitle.name) private readonly titles: Model<CharacterTitle>,
    @InjectModel(GuildMemberRow.name) private readonly members: Model<GuildMemberRow>,
    @InjectModel(Relationship.name) private readonly rels: Model<Relationship>,
    private readonly events: AchievementEvents,
    private readonly rewards: AchievementRewardService,
  ) {}

  catalog(): AchieveCatalog {
    this.catalogCache ??= buildCatalog(this.events.getIndex());
    return this.catalogCache;
  }

  /** chooseCharactor payload fields: counts the login day, backfills absolute values, then returns the snapshot. */
  async loginFields(characterId: number): Promise<Partial<PlayerData>> {
    try {
      await this.events.recordLogin(characterId, dayKey());
      await this.backfill(characterId);
    } catch (e) {
      this.logger.warn(`achievement login for ${characterId}: ${(e as Error).message}`);
    }
    return snapshotOf(await this.events.stateOf(characterId));
  }

  /** Current absolute values (level, money held, pets owned, titles owned, guild, friends) so existing characters get credit. */
  async backfill(characterId: number): Promise<void> {
    const doc = await this.chars.findById(characterId, { level: 1, money: 1, moneyBind: 1, gold: 1, goldBind: 1 }).lean();
    if (!doc) return;
    const now = new Date();
    const [petKinds, titleCount, inGuild, friends] = await Promise.all([
      this.pets.distinct('tid', { characterId }),
      this.titles.countDocuments({ characterId, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }),
      this.members.exists({ cid: characterId }),
      this.rels.countDocuments({ characterId, type: RelationType.FRIEND }),
    ]);
    const ev = this.events;
    await Promise.all([
      ev.recordAsync(characterId, 'level', { value: doc.level ?? 1 }),
      ev.recordAsync(characterId, 'silver', { value: (doc.money ?? 0) + (doc.moneyBind ?? 0) }),
      ev.recordAsync(characterId, 'gold', { value: (doc.gold ?? 0) + (doc.goldBind ?? 0) }),
      ev.recordAsync(characterId, 'petsOwned', { value: petKinds.length }),
      ev.recordAsync(characterId, 'titlesOwned', { value: titleCount }),
      ev.recordAsync(characterId, 'guildJoined', { value: inGuild ? 1 : 0 }),
      ev.recordAsync(characterId, 'friends', { value: friends }),
    ]);
  }

  /** getAchieveAward(aid): fire-and-forget on the wire, every outcome is a push. */
  claim(session: Session, aid: number): Promise<void> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.events.whenIdle(cid);
      const row = this.events.getIndex().rows.find((r) => r.id === aid);
      const gate = claimGate(row, await this.events.stateOf(cid), aid);
      if (gate !== 'ok' || !row) return this.refuse(session, REFUSALS[gate === 'ok' ? 'no-reward' : gate]);
      const reward = await this.rewards.resolve(row.desc);
      if (reward.titleId === null && reward.items.length === 0) return this.refuse(session, NO_DATA);
      if (!(await this.rewards.fits(cid, reward))) return this.refuse(session, NO_ROOM);
      const key = `takeLog.${aid}`;
      const marked = await this.states.updateOne({ _id: cid, [key]: { $exists: false } }, { $set: { [key]: 1 } });
      if (marked.modifiedCount !== 1) return this.refuse(session, REFUSALS.claimed);
      try {
        await this.rewards.grant(session, reward);
        session.callback('updateAchieveAwardLog', { aid, num: 1 } satisfies AchieveAwardLog);
        if (reward.skipped.length > 0) session.callback('onSystemMidMsgOrNote', `Không có dữ liệu vật phẩm: ${reward.skipped.join(', ')}`);
      } catch (e) {
        await this.states.updateOne({ _id: cid }, { $unset: { [key]: '' } }); // undo the mark so the claim can be retried
        this.logger.warn(`achievement ${aid} grant for ${cid} failed: ${(e as Error).message}`);
        this.refuse(session, 'Không thể nhận phần thưởng thành tựu.');
      }
    });
  }

  private refuse(session: Session, text: string): void {
    session.callback('onRedMsg', text);
  }
}
