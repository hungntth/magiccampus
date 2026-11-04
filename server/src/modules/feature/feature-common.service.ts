// Shared plumbing of the stat features: the login snapshot (train soul + awakening), the "something changed" push pair (currency
// balances + stat refresh) and the refusal helpers. Services run their mutation under withCharLock; this only reads / pushes.

import { Injectable } from '@nestjs/common';
import type { AwakenLogin, PlayerData } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { FEATURE_KEYS, parseAwaken, parseSoul } from './feature-state';
import { parseStars, toStarsData } from './zodiac-rules';

export const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

@Injectable()
export class FeatureCommonService {
  constructor(
    private readonly store: FeatureStoreService,
    private readonly currencies: CurrencyService,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
  ) {}

  /** chooseCharactor extras: trainSoulLvl / trainSoulExp, the awaken* keys of the Flash Player.data setter and starsData. */
  async loginFields(characterId: number): Promise<Partial<PlayerData>> {
    const all = await this.store.list(characterId);
    const soul = parseSoul(all[FEATURE_KEYS.soul]);
    const a = parseAwaken(all[FEATURE_KEYS.awaken]);
    const awaken: AwakenLogin = {
      awakenLevel: a.level, awakenAdd: 0, awakenPoint: a.point, awakenPointUsed: a.pointUsed, awakenPointDict: a.pointDict,
    };
    const look = { byId: (id: number) => this.gameData.starTemplate(id), at: (t: number, l: number) => this.gameData.starTemplateAt(t, l) };
    const starsData = toStarsData(parseStars(all[FEATURE_KEYS.zodiac]), look);
    return { trainSoulLvl: soul.lvl, trainSoulExp: soul.exp, ...awaken, starsData };
  }

  /** onUPP of the currency map (optional) and of the recomputed stats (HP / MP clamped when a bonus shrank). */
  async push(session: Session, opts: { currencies?: boolean } = {}): Promise<void> {
    if (opts.currencies) await this.currencies.push(session);
    for (const update of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', update);
  }
}
