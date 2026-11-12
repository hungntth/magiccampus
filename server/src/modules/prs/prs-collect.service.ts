// Chân Hồn Thần Thú collect + swap (Go application/prs collect.go / swap.go). freePRSCollect spends 1 Lộ Thu Thập (realSoulWater 228), goldPRSCollect
// 148 and goldPRSCollectThree 888 unbound gold (six collects). Draws happen in memory first and nothing is charged when the chip bag cannot hold them;
// then spend -> write (refund on a failed write) -> credit Chân Hồn Thạch / Kết Tinh Thần Dụ -> pushes onAddMoney..., updatePRSChipBag, onGetPRSChip.
// swapPRSChip / swapPRSChipTimes turn three different chips of the exchange slots into one random chip (PRS_PANEL[15]); no currency.

import { Injectable } from '@nestjs/common';
import { PRS, PRS_TEXT, type CurrencyKey } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { chipPool, drawChips, parseCollectRates, planCollect, type ChipPool, type CollectKind, type CollectRates } from './prs-collect';
import { applyDraws, planSwap } from './prs-rules';
import { PrsService, refuse, unwrap } from './prs.service';

@Injectable()
export class PrsCollectService {
  /** Injectable dice in [0, 1) (tests / smoke). */
  rng: () => number = Math.random;
  private rates: { raw: string; parsed: CollectRates } | null = null;

  constructor(
    private readonly prs: PrsService,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly characters: CharacterService,
  ) {}

  /** Drop table of game_tuning_prs_collect (parsed once per distinct raw text; Go defaults when absent). */
  collectRates(): CollectRates {
    const raw = this.gameData.prsCollectRaw();
    if (this.rates?.raw !== raw) this.rates = { raw, parsed: parseCollectRates(raw) };
    return this.rates.parsed;
  }

  private pool(rates: CollectRates): ChipPool {
    const pool = chipPool(rates.chipWeights, (id) => this.gameData.prsChip(id) !== undefined);
    return pool.total > 0 ? pool : refuse(PRS_TEXT.NO_POOL);
  }

  /** freePRSCollect / goldPRSCollect / goldPRSCollectThree. */
  collect(session: Session, kind: CollectKind): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const rates = this.collectRates();
      const pool = this.pool(rates);
      const state = await this.prs.loadLive(session);
      const plan = planCollect(kind, rates, this.rng);
      const ids = drawChips(pool, plan.chips, this.rng) ?? refuse(PRS_TEXT.NO_POOL);
      const drawn = unwrap(applyDraws(state, ids));
      const moves: [CurrencyKey, number, number][] = [];
      if (kind === 'free') {
        const left = await this.prs.spend(cid, 'realSoulWater', PRS.FREE_WATER, PRS_TEXT.NO_WATER);
        await this.prs.saveOrRefund(cid, drawn.state, 'realSoulWater', PRS.FREE_WATER);
        moves.push(['realSoulWater', -PRS.FREE_WATER, left]);
      } else {
        const cost = kind === 'six' ? PRS.GOLD_COLLECT_SIX : PRS.GOLD_COLLECT;
        const left = (await this.characters.spendMoney(cid, 'gold', cost)) ?? refuse(PRS_TEXT.NO_GOLD);
        try {
          await this.prs.save(cid, drawn.state);
        } catch (e) {
          await this.characters.addMoney(cid, 'gold', cost);
          throw e;
        }
        session.callback('onUPP', { gold: left });
        session.callback('onAddMoney', cid, 'gold', -cost, left);
      }
      if (plan.stone > 0) moves.push(['realSoulStone', plan.stone, await this.currencies.credit(cid, 'realSoulStone', plan.stone)]);
      if (plan.crystal > 0) moves.push(['realSoulCrystal', plan.crystal, await this.currencies.credit(cid, 'realSoulCrystal', plan.crystal)]);
      await this.prs.pushMoney(session, moves);
      session.callback('updatePRSChipBag', drawn.state.chipBag);
      for (const r of drawn.rewards) session.callback('onGetPRSChip', r);
      return null;
    });
  }

  /** swapPRSChip (one swap) / swapPRSChipTimes (as many as the exchange slots allow). */
  swap(session: Session, all: boolean): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const pool = this.pool(this.collectRates());
      const plan = unwrap(planSwap(await this.prs.loadLive(session), all ? Number.MAX_SAFE_INTEGER : 1));
      const ids = drawChips(pool, plan.times, this.rng) ?? refuse(PRS_TEXT.NO_POOL);
      const drawn = unwrap(applyDraws(plan.state, ids));
      await this.prs.save(cid, drawn.state);
      session.callback('updatePRSExcBag', drawn.state.excBag);
      session.callback('updatePRSChipBag', drawn.state.chipBag);
      for (const r of drawn.rewards) session.callback('onGetPRSChip', r);
      return null;
    });
  }
}
