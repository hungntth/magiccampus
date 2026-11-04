// Heiyaoshi (Hắc Diệu Thạch): panel load (with the Go LoadPanel repair), point activation by stones or unbound gold, and the dev reset.
// Spend first (conditional $inc), persist the new board, refund when the write fails. Push order follows the Go handler:
// gotoLightHeiyaoshiPoint -> Area -> Line -> AllJihuo -> wallet onUPP -> stat refresh onUPP.

import { Injectable } from '@nestjs/common';
import {
  heiyaoshiPool, type HeiyaoshiLightReply, type HeiyaoshiPanelData, type HeiyaoshiResetReply,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { FeatureCommonService, refuse } from './feature-common.service';
import { FEATURE_KEYS } from './feature-state';
import {
  applyPoint, computeBuff, figureView, idSetOf, newHyState, parseHy, planPoint, reconcile, toWire, triangleFigure, type HyState,
} from './heiyaoshi-rules';

@Injectable()
export class HeiyaoshiService {
  constructor(
    private readonly store: FeatureStoreService,
    private readonly currencies: CurrencyService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly common: FeatureCommonService,
    private readonly achievements: AchievementEvents,
  ) {}

  private get tables() {
    return this.gameData.heiyaoshiTables();
  }

  private async load(cid: number): Promise<HyState> {
    return parseHy(await this.store.get(cid, FEATURE_KEYS.heiyaoshi, {}));
  }

  private save(cid: number, st: HyState): Promise<void> {
    return this.store.put(cid, FEATURE_KEYS.heiyaoshi, { lastActFigure: st.lastActFigure, actPoint: st.actPoint, actArea: st.actArea, actLine: st.actLine });
  }

  private view(st: HyState): HeiyaoshiPanelData {
    return { TRIANGLE_FIGURE: triangleFigure(this.tables), data: toWire(this.tables, st), view: figureView(this.tables, st) };
  }

  /** initHeiyaoshiPanelData: repairs the stored board first (starters, derived triangles, cascading completion). */
  async panel(cid: number): Promise<HeiyaoshiPanelData> {
    return withCharLock(cid, async () => {
      const stored = await this.load(cid);
      const st = reconcile(this.tables, stored);
      if (JSON.stringify(st) !== JSON.stringify(stored)) await this.save(cid, st);
      this.achievements.record(cid, 'heiyaoshiFigures', { value: st.lastActFigure - 1 });
      return this.view(st);
    });
  }

  /** lightHeiyaoshiPoint (stones, figure checked) and activateHeiyaoshiPoint (current figure, `useGold` = typeNum 2). */
  activate(session: Session, figureIdx: number, pointId: number, useGold: boolean): Promise<HeiyaoshiLightReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = planPoint(this.tables, await this.load(cid), figureIdx, pointId, useGold);
      if (!plan.ok) return refuse(plan.note);
      const { figure, point, cost } = plan;
      let refund: () => Promise<unknown> = async () => undefined;
      const wallet: Record<string, number> = {};
      if (cost.amount > 0 && cost.currency === 'gold') {
        const left = await this.characters.spendMoney(cid, 'gold', cost.amount);
        if (left === null) return refuse('Không đủ vàng');
        refund = () => this.characters.addMoney(cid, 'gold', cost.amount);
        wallet.gold = left;
      } else if (cost.amount > 0) {
        const pool = heiyaoshiPool(figure);
        if ((await this.currencies.spend(cid, pool, cost.amount)) === null) {
          if (point.gold <= 0) return refuse('Không đủ Hắc Diệu Thạch');
          // Go: stones short + a gold price -> the client asks to pay gold (goldBuyHeiyaoshi), the reply says so.
          session.callback('goldBuyHeiyaoshi', point.gold, pointId);
          return { success: true, figure, pointId, goldFallback: true, goldCost: point.gold };
        }
        refund = () => this.currencies.credit(cid, pool, cost.amount);
      }
      const res = applyPoint(this.tables, plan.state, point);
      try {
        await this.save(cid, res.state);
      } catch (e) {
        await refund();
        throw e;
      }
      session.callback('gotoLightHeiyaoshiPoint', pointId);
      if (res.newAreas.length > 0) session.callback('gotoLightHeiyaoshiArea', idSetOf(res.newAreas), computeBuff(this.tables, res.state));
      // Go passes the figure AFTER advancing (the client derives the stage from it).
      if (res.newLines.length > 0) session.callback('gotoLightHeiyaoshiLine', idSetOf(res.newLines), res.state.lastActFigure);
      if (res.figureCompleted) {
        session.callback('gotoLightHeiyaoshiAllJihuo', toWire(this.tables, res.state));
        this.achievements.record(cid, 'heiyaoshiFigures', { value: res.state.lastActFigure - 1 });
      }
      if (wallet.gold !== undefined) session.callback('onUPP', wallet);
      await this.common.push(session, { currencies: cost.currency === 'stone' });
      return { success: true, figure, pointId, figureCompleted: res.figureCompleted, usedGold: cost.currency === 'gold' };
    });
  }

  /**
   * resetHeiyaoshi(targetCharId). Go: GM level >= 5 may reset anyone. H5 has no GM levels, so this is a dev command that only
   * resets the caller's own board (0 / own id).
   */
  reset(session: Session, targetCid: number): Promise<HeiyaoshiResetReply> {
    const cid = session.characterId!;
    if (targetCid !== 0 && targetCid !== cid) return refuse('Chỉ có thể đặt lại Hắc Diệu Thạch của chính mình');
    return withCharLock(cid, async () => {
      const st = reconcile(this.tables, newHyState());
      await this.save(cid, st);
      await this.common.push(session);
      return { success: true, panel: this.view(st) };
    });
  }
}
