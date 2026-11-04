// Pure prabuff state helpers: the per-track state kept in character_features key `pra_buff` (flat fields t<N>_level / t<N>_exp) and the
// stat bonuses of the player tracks (1 Thủy, 3 Địa, 5 Ám, 7 Kim; the pet tracks have no H5 effect). Used by the service and the stat provider.

import { PRA_MAX_LEVEL, PRA_TRACKS, PRA_TRACK_LIST, praEffectPercent, type PraState } from '@mc/shared';
import { emptyBonuses, type Bonuses } from '../character/character-stats';

export const PRA_FEATURE_KEY = 'pra_buff';

type Raw = Record<string, unknown> | null | undefined;

const nonNeg = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function parsePraTrack(raw: Raw, type: number): PraState {
  return { level: Math.min(PRA_MAX_LEVEL, nonNeg(raw?.[`t${type}_level`])), exp: nonNeg(raw?.[`t${type}_exp`]) };
}

export function parsePraTracks(raw: Raw): PraState[] {
  return Array.from({ length: PRA_TRACKS }, (_, i) => parsePraTrack(raw, i + 1));
}

export const praPatch = (type: number, s: PraState): Record<string, number> => ({ [`t${type}_level`]: s.level, [`t${type}_exp`]: s.exp });

/** Bonuses of the player tracks at their current levels (percent values: reduce / enhance rates, speed percent). */
export function praBonuses(tracks: readonly PraState[]): Bonuses {
  const b = emptyBonuses();
  for (const t of PRA_TRACK_LIST) {
    if (t.target !== 'player') continue;
    const pct = praEffectPercent(t.type, tracks[t.type - 1]?.level ?? 0);
    if (pct <= 0) continue;
    if (t.stat === 'speedPct') b.pct.speed = (b.pct.speed ?? 0) + pct;
    else b.rates[t.stat] = (b.rates[t.stat] ?? 0) + pct;
  }
  return b;
}
