// Astrology feature state (feature key `astrology`; Go used `magic_array` with the same field names): the cycle the counters belong to, the free picks / refreshes USED, the paid picks
// bought, the collected stars (at most 4), the three lit candidates and the per-player revealed / completed formula indices. Tolerant decode; a new cycle resets everything but the candidates.

import { ASTRO } from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const ASTROLOGY_FEATURE_KEY = 'astrology';

export interface AstrologyState {
  cycle: string;
  pickUsed: number;
  refreshUsed: number;
  buyPickCount: number;
  starsCollected: number[];
  starsToPick: number[];
  revealed: number[];
  completed: number[];
}

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const ints = (v: unknown, ok: (n: number) => boolean): number[] => (Array.isArray(v) ? v.map(int).filter(ok) : []);
const isSid = (n: number): boolean => n >= ASTRO.SID_MIN && n <= ASTRO.SID_MAX;
const isFid = (n: number): boolean => n >= 0 && n < ASTRO.FORMULA_COUNT;

export const emptyAstrology = (): AstrologyState => ({ cycle: '', pickUsed: 0, refreshUsed: 0, buyPickCount: 0, starsCollected: [], starsToPick: [], revealed: [], completed: [] });

export function parseAstrology(raw: unknown): AstrologyState {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    cycle: typeof r.cycle === 'string' ? r.cycle : '',
    pickUsed: Math.max(0, int(r.pickUsed)),
    refreshUsed: Math.max(0, int(r.refreshUsed)),
    buyPickCount: Math.max(0, int(r.buyPickCount)),
    starsCollected: ints(r.starsCollected, isSid).slice(-ASTRO.COLLECT_KEEP),
    starsToPick: ints(r.starsToPick, isSid),
    revealed: [...new Set(ints(r.revealed, isFid))],
    completed: [...new Set(ints(r.completed, isFid))],
  };
}

export const encodeAstrology = (s: AstrologyState): FeatureState => ({ ...s });
