// Hồn Khí service (M13 phase E1): the nine state RPCs of the deco panel + the suit read. Every mutation runs under withCharLock:
// validate (pure plan) -> conditional spend -> save -> refund on a failed write -> pushes (look pushes through AppearanceService, stats / balances onUPP).

import { Injectable } from '@nestjs/common';
import { DECO_RATE_LIMIT_MS, DECO_SERVER_TEXT as T, type DecoCatalog, type DecoInfo, type DecoSuitPropReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { AppearanceService } from '../appearance/appearance.service';
import { CharacterService } from '../character/character.service';
import { ForgeMoneyService } from '../forge/forge-money.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import {
  expireShows, liveShowIds, planActivate, planEquip, planHoleLevel, planShowLvl, setVisible, suitReply, validPosition, type Refusal,
} from './deco-rules';
import { decoInfoOf, type DecoState } from './deco-state';
import { DecoStateService } from './deco-state.service';

function must<P extends { ok: true }>(plan: P | Refusal): P {
  if (!plan.ok) throw RpcException.forbidden(plan.note);
  return plan;
}

@Injectable()
export class DecoService {
  /** Replaceable in tests. */
  now: () => number = Date.now;
  rng: () => number = Math.random;
  private catalogCache: DecoCatalog | null = null;
  private readonly lastLevelUp = new Map<number, number>();

  constructor(
    private readonly state: DecoStateService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly money: ForgeMoneyService,
    private readonly stats: CharacterStatsService,
    private readonly appearance: AppearanceService,
  ) {}

  private readonly holeOf = (id: number) => this.gameData.decoHole(id);

  view(state: DecoState): DecoInfo {
    return decoInfoOf(state, this.holeOf);
  }

  /** H5 getDecoCatalog: the hole and show rows (the Flash panel read TBL_DECO_HOLE / TBL_DECO_SHOW locally). */
  catalog(): DecoCatalog {
    this.catalogCache ??= { holes: this.gameData.decoHoles(), shows: this.gameData.decoShows() };
    return this.catalogCache;
  }

  async info(characterId: number): Promise<DecoInfo> {
    return this.view(await this.state.load(characterId));
  }

  /** onUPP of the recomputed character stats (a stat source changed). */
  private async pushStats(session: Session): Promise<void> {
    for (const u of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', u);
  }

  /** activeDecoShow(id, position): buys a show with unbound gold. */
  activate(session: Session, id: number, position: number): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const s = await this.state.load(cid);
      const plan = must(planActivate(s, this.gameData.decoShow(id), position, this.now()));
      if (!plan.changed) return this.view(s);
      const gold = await this.characters.spendMoney(cid, 'gold', plan.gold);
      if (gold === null) throw RpcException.forbidden(T.NO_GOLD);
      try {
        await this.state.save(cid, plan.state);
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', plan.gold);
        throw e;
      }
      session.callback('onUPP', { gold });
      await this.pushStats(session);
      return this.view(plan.state);
    });
  }

  /** equipDecoShow / equipOffDecoShow. */
  equip(session: Session, id: number, position: number, on: boolean): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planEquip(await this.state.load(cid), this.gameData.decoShow(id), position, on, this.now()));
      await this.state.save(cid, plan.state);
      await this.appearance.pushDeco(cid, [position]);
      return this.view(plan.state);
    });
  }

  /** showDecoShow / hideDecoShow. */
  show(session: Session, position: number, visible: boolean): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(setVisible(await this.state.load(cid), position, visible));
      await this.state.save(cid, plan.state);
      await this.appearance.pushDeco(cid, [position]);
      return this.view(plan.state);
    });
  }

  /** changeShowLvl(showLvl, position). */
  showLevel(session: Session, showLvl: number, position: number): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planShowLvl(await this.state.load(cid), position, showLvl, this.holeOf));
      await this.state.save(cid, plan.state);
      await this.appearance.pushDeco(cid, [position]);
      return this.view(plan.state);
    });
  }

  /** updateActiveDecoShow: the client expiry timer; the server drops every expired show by its own clock. */
  expire(session: Session): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const r = expireShows(await this.state.load(cid), this.now());
      if (r.changed) {
        await this.state.save(cid, r.state);
        await this.appearance.pushDeco(cid, r.positions);
        await this.pushStats(session);
      }
      return this.view(r.state);
    });
  }

  /** addDecoHoleLevel(position) / addDecoHoleLevelTenTimes(position): `times` paid attempts (silver by the selected money type + Bí Ngân). */
  levelUp(session: Session, position: number, times: number): Promise<DecoInfo> {
    const cid = session.characterId!;
    if (!validPosition(position)) throw RpcException.invalidArgs('position');
    return withCharLock(cid, async () => {
      const now = this.now();
      if (now - (this.lastLevelUp.get(cid) ?? 0) < DECO_RATE_LIMIT_MS) throw RpcException.forbidden(T.TOO_FAST);
      this.lastLevelUp.set(cid, now);
      const s = await this.state.load(cid);
      const moneyKey = (await this.characters.paymentPrefs(cid)).money;
      const doc = await this.characters.getById(cid);
      const silverHave = await this.currencies.balance(cid, 'decoSilver');
      const plan = must(planHoleLevel(s.pos[String(position)].hid, this.holeOf, times, silverHave, doc[moneyKey] ?? 0, this.rng));
      const charge = await this.money.spend(cid, plan.money, 'selected');
      if (!charge) throw RpcException.forbidden(T.NO_MONEY);
      if (plan.silver > 0 && (await this.currencies.spend(cid, 'decoSilver', plan.silver)) === null) {
        await this.money.refund(cid, charge);
        throw RpcException.forbidden(T.NO_SILVER);
      }
      const next: DecoState = { pos: { ...s.pos, [String(position)]: { ...s.pos[String(position)], hid: plan.hid } } };
      if (plan.successes > 0) {
        try {
          await this.state.save(cid, next);
        } catch (e) {
          await this.money.refund(cid, charge);
          if (plan.silver > 0) await this.currencies.credit(cid, 'decoSilver', plan.silver);
          throw e;
        }
      }
      for (const p of this.money.pushes(charge)) session.callback(p.m, ...p.a);
      await this.currencies.push(session);
      if (plan.successes > 0) await this.pushStats(session);
      return this.view(next);
    });
  }

  /** getDecoSuitProp(suitId, linkSuitId, linkId): the suit panel data from the live shows. */
  async suitProp(characterId: number, suitId: number, linkSuitId: number): Promise<DecoSuitPropReply> {
    const live = liveShowIds(await this.state.load(characterId), this.now());
    return suitReply(suitId, linkSuitId, live, (id) => this.gameData.decoSuit(id));
  }
}
