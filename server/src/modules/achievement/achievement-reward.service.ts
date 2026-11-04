// Achievement rewards (M7 phase B): the reward lives only in the template text `desc` (reward_* columns are all NULL), so it is parsed
// (achievement-parse parseReward) and resolved by exact name against titles (data_tbl_title.n) and items (data_tbl_item_template).
// Items go through InventoryService (onAddItem + onAddCharactorSlot as quest / gmGrant rewards), titles through TitleService.grant.

import { Injectable, Logger } from '@nestjs/common';
import { ItemKind } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { TitleService } from '../title/title.service';
import { parseReward } from './achievement-parse';

export interface ResolvedItem {
  templateId: number;
  name: string;
  qty: number;
  maxStack: number;
}

export interface ResolvedReward {
  titleId: number | null;
  titleName: string | null;
  items: ResolvedItem[];
  /** Names that matched no template (reported to the player, logged). */
  skipped: string[];
}

@Injectable()
export class AchievementRewardService {
  private readonly logger = new Logger(AchievementRewardService.name);

  constructor(
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly titles: TitleService,
  ) {}

  /** Parses `desc` and resolves every named title / item; unresolved names land in `skipped`. */
  async resolve(desc: string): Promise<ResolvedReward> {
    const plan = parseReward(desc);
    const out: ResolvedReward = { titleId: null, titleName: null, items: [], skipped: [] };
    if (plan.titleName) {
      const id = this.gameData.titleIdByName(plan.titleName);
      if (id !== undefined) { out.titleId = id; out.titleName = plan.titleName; } else out.skipped.push(plan.titleName);
    }
    for (const it of plan.items) {
      const id = await this.gameData.itemIdByName(it.name);
      const tpl = id !== undefined ? await this.gameData.template(29, id) : undefined;
      if (id === undefined || !tpl) { out.skipped.push(it.name); continue; }
      out.items.push({ templateId: id, name: it.name, qty: it.qty, maxStack: maxStack(tpl) });
    }
    if (out.skipped.length > 0) this.logger.warn(`achievement reward without template: ${out.skipped.join(', ')}`);
    return out;
  }

  private specs(r: ResolvedReward) {
    return r.items.map((i) => ({ templateId: i.templateId, itemType: ItemKind.ITEM, bound: false, color: 0, amount: i.qty, maxStack: i.maxStack }));
  }

  fits(characterId: number, r: ResolvedReward): Promise<boolean> {
    return this.inventory.canFitAll(characterId, this.specs(r));
  }

  /** Credits items then the title (the caller holds the character lock and already marked the claim). */
  async grant(session: Session, r: ResolvedReward): Promise<void> {
    const cid = session.characterId!;
    for (const [i, spec] of this.specs(r).entries()) {
      const changed = await this.inventory.add(cid, spec);
      session.callback('onAddItem', { i: spec.templateId, q: spec.amount, t: ItemKind.ITEM, n: r.items[i].name });
      for (const slot of changed) session.callback('onAddCharactorSlot', slot);
    }
    if (r.titleId !== null) {
      await this.titles.grant(cid, r.titleId);
      session.callback('onAchieveTitle', r.titleName);
    }
  }
}
