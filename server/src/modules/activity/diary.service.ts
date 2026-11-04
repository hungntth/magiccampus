// Diary panel backend: getCharDiaryData (today's counts, points, chest flag) and getDailyActAward (the day's single chest).
// Chest contents: the items 3255..3259 only carry a description, so it is parsed (pool + guaranteed names), two pool items are
// picked at random, names without a template are skipped, and level-scaled exp + bound silver is added (M8 decision 2).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { chestClaimable, dayKey, scaledReward, type DailyActAwardReply, type DiaryData, type ScaledRewardId } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { parseChestDesc, pickFrom } from '../activity-rewards/chest-rules';
import { ItemGrantService, type GrantItem } from '../activity-rewards/item-grant.service';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterDaily } from './daily.schema';
import { toDiaryData } from './diary-rules';
import { DiaryEvents } from './diary-events.service';

const CHEST_ITEM_BASE = 3255; // Bảo Rương Năng Nổ Trắng..Cam = tiers 0..4 (icon_giid; Go's item_id 2003..2007 were wrong)
const CHEST_PICKS = 2;

@Injectable()
export class DiaryService {
  now = (): number => Date.now();
  rng: () => number = Math.random;

  constructor(
    @InjectModel(CharacterDaily.name) private readonly days: Model<CharacterDaily>,
    private readonly events: DiaryEvents,
    private readonly gameData: GameDataService,
    private readonly items: ItemGrantService,
    private readonly rewards: RewardGrantService,
  ) {}

  async data(characterId: number): Promise<DiaryData> {
    await this.events.whenIdle(characterId);
    const doc = await this.days.findOne({ characterId, day: dayKey(this.now()) }).lean();
    return toDiaryData(doc?.tasks ?? {}, doc?.vitality ?? 0, doc?.claimed === true);
  }

  claim(session: Session, tier: number): Promise<DailyActAwardReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.events.whenIdle(cid);
      const day = dayKey(this.now());
      const doc = await this.days.findOne({ characterId: cid, day }, { vitality: 1, claimed: 1 }).lean();
      if (doc?.claimed) return { f: true };
      if (!chestClaimable(tier, doc?.vitality ?? 0, false)) throw RpcException.forbidden('Điểm năng nổ chưa đủ để nhận rương');
      const picked = await this.pickItems(tier);
      if (!(await this.items.fits(cid, picked))) throw RpcException.forbidden('Túi đồ đã đầy, hãy dọn chỗ trống rồi nhận lại');
      // The one-per-day mark is persisted before anything is credited.
      const marked = await this.days.updateOne({ characterId: cid, day, claimed: { $ne: true } }, { $set: { claimed: true, claimedTier: tier } });
      if (marked.modifiedCount !== 1) return { f: true };
      const r = scaledReward(`chest${tier}` as ScaledRewardId, await this.rewards.levelOf(cid));
      await this.rewards.grantExpSilver(session, r.exp, r.silver);
      await this.items.grant(session, picked);
      session.callback('onBlueMsg', 'Nhận Bảo Rương Năng Nổ thành công!');
      return { f: true };
    });
  }

  /** Two random pool items plus the guaranteed names that exist as templates (qty 1 each). */
  private async pickItems(tier: number): Promise<GrantItem[]> {
    const tpl = await this.gameData.template(29, CHEST_ITEM_BASE + tier);
    const plan = parseChestDesc(String(tpl?.description ?? ''));
    const pool = (await this.items.resolve(plan.pool.map((name) => ({ name, qty: 1 })))).items;
    const chosen = new Set(pickFrom(pool.map((i) => i.name), CHEST_PICKS, this.rng));
    const sure = (await this.items.resolve(plan.sure.map((name) => ({ name, qty: 1 })))).items;
    return [...pool.filter((i) => chosen.has(i.name)), ...sure];
  }
}
