// Stat bonus provider registry (M7 foundation): every source of character bonuses (gear, buffs, guild skills, titles and later
// the progression features) is a StatBonusProvider; CharacterStatsService merges them all. Providers read models / game data only
// (never feature RPC services) so StatsModule stays free of DI cycles.

import { emptyBonuses, mergeBonuses, type Bonuses } from '../character/character-stats';
import type { Character } from '../character/character.schema';

export interface StatBonusProvider {
  /** Stable name, used in logs and tests. */
  readonly key: string;
  bonuses(characterId: number, doc: Character): Promise<Bonuses>;
}

/** Nest multi-provider token: a factory in StatsModule injects every provider class into this array. */
export const STAT_BONUS_PROVIDERS = Symbol('STAT_BONUS_PROVIDERS');

/** Sums the bonuses of all providers (fractional flats stay floats; assembleStats truncates once). */
export async function collectBonuses(providers: readonly StatBonusProvider[], characterId: number, doc: Character): Promise<Bonuses> {
  const parts = await Promise.all(providers.map((p) => p.bonuses(characterId, doc)));
  return parts.reduce((acc, b) => mergeBonuses(acc, b), emptyBonuses());
}
