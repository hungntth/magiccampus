// War sprite (Chiến Hồn): panel data, the aggregated totals and the four upgrades (stones or unbound gold, cost read on the current
// row). Spend first, persist the new template id, refund when the write fails. Pushes: updateWSPPanel, onUPP (stones / gold), stats.

import { Injectable } from '@nestjs/common';
import { WAR_SPRITE, type CurrencyKey, type WspPanelData, type WspRowView, type WspSlotView, type WspState, type WspUpgradeReply } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import type { WspRow } from '../gamedata/feature-data';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { FeatureCommonService, refuse } from './feature-common.service';
import { FEATURE_KEYS, parseWsp } from './feature-state';
import { displayProps, planWspUpgrade, wspTotals, type WspKind } from './warsprite-rules';

const STONE: Record<WspKind, CurrencyKey> = { 1: 'warSprite', 2: 'battleSprite' };

@Injectable()
export class WarSpriteService {
  constructor(
    private readonly store: FeatureStoreService,
    private readonly currencies: CurrencyService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly common: FeatureCommonService,
  ) {}

  private async load(cid: number): Promise<WspState> {
    return parseWsp(await this.store.get(cid, FEATURE_KEYS.warSprite, {}));
  }

  private viewOf(row: WspRow | undefined): WspRowView {
    return {
      id: row?.id ?? 0, level: row?.level ?? 0, name: row?.name ?? '', costNum: row?.costNum ?? 0, costGold: row?.costGold ?? 0,
      props: displayProps(row?.props ?? []),
    };
  }

  private slotView(obj: Record<string, number>): WspSlotView[] {
    return Array.from({ length: WAR_SPRITE.SLOTS }, (_, i) => {
      const cur = this.gameData.warSpriteRow(obj[String(i + 1)]);
      const next = cur && cur.nextId > 0 ? this.gameData.warSpriteRow(cur.nextId) : undefined;
      return { cur: this.viewOf(cur), next: next ? this.viewOf(next) : null };
    });
  }

  /** getSpWarData reply / updateWSPPanel push: Flash {wObj, bObj} plus the H5 view and totals. */
  async panel(cid: number): Promise<WspPanelData> {
    const s = await this.load(cid);
    return { ...s, view: { war: this.slotView(s.wObj), battle: this.slotView(s.bObj), totals: wspTotals(s, (id) => this.gameData.warSpriteRow(id)) } };
  }

  /** getWSPBuffList: {propType: raw total}. */
  async totals(cid: number): Promise<Record<string, number>> {
    return wspTotals(await this.load(cid), (id) => this.gameData.warSpriteRow(id));
  }

  upgrade(session: Session, kind: WspKind, index: number, gold: boolean): Promise<WspUpgradeReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const chain = kind === 1 ? state.wObj : state.bObj;
      const row = this.gameData.warSpriteRow(chain[String(index)]);
      const plan = row && row.kind !== kind ? 'Dữ liệu Chiến Hồn không hợp lệ' : planWspUpgrade(row, gold);
      if (typeof plan === 'string') return refuse(plan);

      const stone = STONE[kind];
      let refund: () => Promise<unknown> = async () => undefined;
      const updates: Record<string, number> = {};
      if (plan.cost > 0 && gold) {
        const left = await this.characters.spendMoney(cid, 'gold', plan.cost);
        if (left === null) return refuse('Vàng không đủ');
        refund = () => this.characters.addMoney(cid, 'gold', plan.cost);
        updates.gold = left;
      } else if (plan.cost > 0) {
        if ((await this.currencies.spend(cid, stone, plan.cost)) === null) {
          return refuse(kind === 1 ? 'Dũng Khí Thạch không đủ' : 'Ý Chí Thạch không đủ');
        }
        refund = () => this.currencies.credit(cid, stone, plan.cost);
      }
      chain[String(index)] = plan.newId;
      try {
        await this.store.put(cid, FEATURE_KEYS.warSprite, { wObj: state.wObj, bObj: state.bObj });
      } catch (e) {
        await refund();
        throw e;
      }
      const maxed = (this.gameData.warSpriteRow(plan.newId)?.nextId ?? 0) <= 0;
      session.callback('updateWSPPanel', await this.panel(cid));
      if (updates.gold !== undefined) session.callback('onUPP', updates);
      await this.common.push(session, { currencies: !gold });
      return { kind, index, newId: plan.newId, usedGold: gold, maxed };
    });
  }
}
