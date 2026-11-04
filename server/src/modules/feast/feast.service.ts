// Festivals: the active feast (data_tbl_feast `at` window in UTC+7) and the once-per-feast gift. The gift bag templates have no content
// table, so a bag pays level-scaled exp + bound silver (decision 2) and any other gift item is granted itself as well. The claim marker
// (`claim_<id>` = day key) is persisted BEFORE anything is credited; a full bag refuses before the marker.

import { Injectable } from '@nestjs/common';
import {
  ActivityId, currentFeast, dayKey, feastGiftIsBag, scaledReward,
  type ActivityStripEntry, type CurrentFeast, type FeastRow,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { ItemGrantService, type GrantItem } from '../activity-rewards/item-grant.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { FeatureStoreService } from '../progression/feature-store.service';

const KEY = 'feast'; // character_features key

// one flat field per feast: claim_<id> = UTC+7 day key of the claim
type FeastState = Record<string, unknown>;

@Injectable()
export class FeastService {
  now = (): number => Date.now();
  private rows: FeastRow[] | null = null;

  constructor(
    private readonly gameData: GameDataService,
    private readonly features: FeatureStoreService,
    private readonly rewards: RewardGrantService,
    private readonly items: ItemGrantService,
  ) {}

  private async table(): Promise<FeastRow[]> {
    this.rows ??= (await this.gameData.rows('data_tbl_feast')).map((r) => ({
      id: Number(r.id), na: String(r.na ?? ''), inf: String(r.inf ?? ''), aw: Number(r.aw ?? 0), at: String(r.at ?? ''),
    }));
    return this.rows;
  }

  async active(): Promise<FeastRow | undefined> {
    return currentFeast(await this.table(), this.now());
  }

  /** Strip entry of "Lễ hội sôi động" (type 3, state 2 = running) while a feast is active; null otherwise. */
  async stripEntry(sortType: number): Promise<ActivityStripEntry | null> {
    return (await this.active()) ? { id: ActivityId.FEAST, type: 3, flag: 2, sortType } : null;
  }

  private async claimed(characterId: number, feast: FeastRow): Promise<boolean> {
    const s = await this.features.get<FeastState>(characterId, KEY, {});
    return s[`claim_${feast.id}`] === dayKey(this.now());
  }

  private async gift(feast: FeastRow): Promise<{ name: string; bag: boolean; item: GrantItem | null }> {
    const tpl = await this.gameData.template(29, feast.aw);
    const name = String(tpl?.name ?? `#${feast.aw}`);
    const bag = feastGiftIsBag(name);
    const item = tpl && !bag ? { name, qty: 1, templateId: feast.aw, maxStack: maxStack(tpl) } : null;
    return { name, bag, item };
  }

  async current(characterId: number): Promise<CurrentFeast> {
    const feast = await this.active();
    if (!feast) return { id: 0, enable: 0 };
    const g = await this.gift(feast);
    const note = g.item ? `${g.name} + kinh nghiệm, bạc` : 'Kinh nghiệm và bạc (theo cấp)';
    return {
      id: feast.id, enable: (await this.claimed(characterId, feast)) ? 0 : 1,
      data: { aw: feast.aw, inf: feast.inf, na: feast.na, awName: g.name, gift: note },
    };
  }

  take(session: Session): Promise<boolean> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const feast = await this.active();
      if (!feast) throw RpcException.forbidden('Hôm nay không có lễ hội');
      if (await this.claimed(cid, feast)) throw RpcException.forbidden('Bạn đã nhận quà lễ hội này rồi');
      const g = await this.gift(feast);
      if (g.item && !(await this.items.fits(cid, [g.item]))) throw RpcException.forbidden('Túi đồ đã đầy, hãy dọn chỗ trống rồi nhận lại');
      await this.features.patch(cid, KEY, { [`claim_${feast.id}`]: dayKey(this.now()) }); // marked before the credit
      const r = scaledReward('feast', await this.rewards.levelOf(cid));
      await this.rewards.grantExpSilver(session, r.exp, r.silver);
      if (g.item) await this.items.grant(session, [g.item]);
      session.callback('onBlueMsg', `Nhận quà ${feast.na} thành công!`);
      return true;
    });
  }
}
