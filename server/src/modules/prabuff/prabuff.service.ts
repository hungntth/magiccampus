// Prabuff ("Ma Pháp Bí Trận"): getMagicArrayData and addPracticeExp. One practice action costs 10 element points (tracks 1-4 elementPnt,
// 5-8 yijieElement) or 7 gold, which is spent first; then exp (crit x2 on 10 %) is persisted and the level follows the cumulative table.
// The stat effect of the player tracks flows through the StatBonusProvider registry (stats/feature-providers.ts).

import { Injectable } from '@nestjs/common';
import {
  PRA_ELEMENT_COST, PRA_GOLD_COST, PRA_MAX_LEVEL, PRABUFF_MIN_LEVEL, praAdvance, praRollGain, praTrack, validPraType, type PraView,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { PRA_FEATURE_KEY, parsePraTrack, praPatch } from './prabuff-rules';

@Injectable()
export class PrabuffService {
  rng: () => number = Math.random;

  constructor(
    private readonly features: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly stats: CharacterStatsService,
  ) {}

  private async view(characterId: number, type: number): Promise<PraView> {
    const t = parsePraTrack(await this.features.get(characterId, PRA_FEATURE_KEY, {}), type);
    const doc = await this.characters.getById(characterId);
    const currency = praTrack(type)!.currency;
    return { praType: type, buff: t.level, exp: t.exp, goldNum: doc.gold ?? 0, elementNum: await this.currencies.balance(characterId, currency) };
  }

  getData(characterId: number, type: number): Promise<PraView> {
    if (!validPraType(type)) throw RpcException.invalidArgs('praType');
    return this.view(characterId, type);
  }

  addExp(session: Session, type: number, isGold: boolean): Promise<PraView> {
    const cid = session.characterId!;
    if (!validPraType(type)) throw RpcException.invalidArgs('praType');
    return withCharLock(cid, async () => {
      if ((await this.characters.getById(cid)).level < PRABUFF_MIN_LEVEL) {
        throw RpcException.forbidden(`Cần đạt cấp ${PRABUFF_MIN_LEVEL} để mở Ma Pháp Bí Trận`);
      }
      const track = parsePraTrack(await this.features.get(cid, PRA_FEATURE_KEY, {}), type);
      if (track.level >= PRA_MAX_LEVEL) throw RpcException.forbidden('Bí trận đã đạt cấp tối đa');
      if (isGold) {
        const total = await this.characters.spendMoney(cid, 'gold', PRA_GOLD_COST); // spend before the exp exists
        if (total === null) throw RpcException.forbidden('Không đủ vàng!');
        session.callback('onUPP', { gold: total });
      } else {
        const left = await this.currencies.spend(cid, praTrack(type)!.currency, PRA_ELEMENT_COST);
        if (left === null) throw RpcException.forbidden('Không đủ nguyên tố!');
      }
      const roll = praRollGain(track.level, Math.floor(this.rng() * 100));
      const next = praAdvance(track, roll.gain);
      await this.features.patch(cid, PRA_FEATURE_KEY, praPatch(type, next));
      if (!isGold) await this.currencies.push(session);
      if (next.level !== track.level) await this.stats.refreshPush(session); // the player tracks change the stats
      const view: PraView = { ...(await this.view(cid, type)), addExp: roll.gain, critMulit: roll.crit };
      session.callback('updatePraView', view);
      return view;
    });
  }
}
