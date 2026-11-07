// Applies the reward of a VIP right (see pm-rules.ts rewardOf) after the claim was marked: exp through RewardGrantService, bound gold
// coupons (onAddMoney + onUPP), the daily buff (upLongBuff + stat refresh), bound bag items (onAddItem + onAddCharactorSlot) and the
// transform push (onSetRes + buff 2730 via upLongBuff, the persisted res code is written with the claim mark). `precheck` refuses a full bag before marking.

import { Injectable } from '@nestjs/common';
import { ItemKind, PM_TRANSFORM_BUFF_ID } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { BuffService } from '../buff/buff.service';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { secondsLeftToday, type PmReward } from './pm-rules';

@Injectable()
export class PmRewardService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly characters: CharacterService,
    private readonly buffs: BuffService,
    private readonly stats: CharacterStatsService,
    private readonly exp: RewardGrantService,
  ) {}

  levelOf(characterId: number): Promise<number> {
    return this.exp.levelOf(characterId);
  }

  private async specOf(reward: Extract<PmReward, { kind: 'item' }>): Promise<{ spec: AddSpec; name: string }> {
    const tpl = await this.gameData.template(29, reward.itemId);
    if (!tpl) throw RpcException.notFound(`item ${reward.itemId} not found`);
    const spec: AddSpec = { templateId: reward.itemId, itemType: ItemKind.ITEM, bound: true, color: 0, amount: reward.qty, maxStack: maxStack(tpl) };
    return { spec, name: String(tpl.name ?? `#${reward.itemId}`) };
  }

  /** Throws when the reward cannot be delivered (full bag), so the claim is not marked. */
  async precheck(characterId: number, rewards: readonly PmReward[]): Promise<void> {
    const specs: AddSpec[] = [];
    for (const r of rewards) if (r.kind === 'item') specs.push((await this.specOf(r)).spec);
    if (specs.length > 0 && !(await this.inventory.canFitAll(characterId, specs))) throw RpcException.invalidArgs('Túi đồ đã đầy');
  }

  async apply(session: Session, reward: PmReward): Promise<void> {
    const cid = session.characterId!;
    switch (reward.kind) {
      case 'exp':
        await this.exp.grantExpSilver(session, reward.amount, 0);
        session.callback('onBlueMsg', `Nhận ${reward.amount} kinh nghiệm VIP`);
        return;
      case 'goldBind': {
        const total = await this.characters.addMoney(cid, 'goldBind', reward.amount);
        session.callback('onAddMoney', cid, 'goldBind', reward.amount, total);
        session.callback('onUPP', { goldBind: total });
        session.callback('onBlueMsg', `Nhận ${reward.amount} Vàng khóa VIP`);
        return;
      }
      case 'buff': {
        session.callback('upLongBuff', await this.buffs.grant(cid, reward.buffId, reward.seconds));
        await this.stats.refreshPush(session);
        return;
      }
      case 'item': {
        const { spec, name } = await this.specOf(reward);
        const changed = await this.inventory.add(cid, spec);
        session.callback('onAddItem', { i: spec.templateId, q: spec.amount, t: ItemKind.ITEM, n: name });
        for (const slot of changed) session.callback('onAddCharactorSlot', slot);
        return;
      }
      case 'transform': {
        session.callback('onSetRes', { id: cid, res: reward.resCode });
        // Same end as the stored transform (pm.service): the buff bar timer fires delBuffClient then, which reverts the look.
        session.callback('upLongBuff', await this.buffs.grant(cid, PM_TRANSFORM_BUFF_ID, secondsLeftToday(Date.now())));
        session.callback('onBlueMsg', 'Hôm nay bạn đã biến hình!');
        return;
      }
    }
  }
}
