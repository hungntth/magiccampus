// Palace cultivation levels for the star instance gate: the FINISHED level of each Tinh Cung slot kept by the M7 zodiac feature
// (character_features 'zodiac_stars'), so a level-up still counting down does not open the next palace level (Go CultivatedLevel).

import { Injectable } from '@nestjs/common';
import { WAR_MAP_SIDS } from '@mc/shared';
import { FEATURE_KEYS } from '../feature/feature-state';
import { parseStars } from '../feature/zodiac-rules';
import { FeatureStoreService } from '../progression/feature-store.service';

@Injectable()
export class StarCultivation {
  constructor(private readonly store: FeatureStoreService) {}

  /** Finished cultivation level per palace, `levels[sid]` for sid 1..12 (0 = never cultivated). */
  async levels(characterId: number): Promise<Record<string, number>> {
    const stars = parseStars(await this.store.get(characterId, FEATURE_KEYS.zodiac, {}));
    const out: Record<string, number> = {};
    for (let sid = 1; sid <= WAR_MAP_SIDS; sid++) out[String(sid)] = stars[String(sid)]?.level ?? 0;
    return out;
  }

  async of(characterId: number, sid: number): Promise<number> {
    return (await this.levels(characterId))[String(sid)] ?? 0;
  }
}
