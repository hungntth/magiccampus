// Train soul (Luyện Hồn) rules, pure. Resolved from the client display (H5 decision, plan §1.4): TrainSoulPanel draws the bar as
// `trainSoulExp / data_tbl_soul[lvl + 1].require_num` and the help text says 1 Kết Tinh Thần Bí = 1 exp, so `require_num` is the
// exp needed INSIDE one level and the exp resets on level up (Go kept it cumulative; its +10000 exp per call is the step here).
// The stat is the CURRENT level row only (absolute per level, as the client shows it).

import { TRAIN_SOUL } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { SoulRow } from '../gamedata/feature-data';
import type { SoulState } from './feature-state';

/** Refusal text, or null when the player may train. */
export function soulGate(playerLevel: number, state: SoulState, crystals: number): string | null {
  if (playerLevel < TRAIN_SOUL.MIN_PLAYER_LEVEL) return `Cần cấp ${TRAIN_SOUL.MIN_PLAYER_LEVEL} trở lên để Luyện Hồn`;
  if (state.lvl >= TRAIN_SOUL.MAX_LEVEL) return 'Đã đạt cấp cao nhất, không thể tiếp tục Luyện Hồn';
  if (crystals <= 0) return 'Kết Tinh Thần Bí không đủ';
  return null;
}

/** Crystals (= exp) spent by one call: what is held, one step, and never more than the level still needs. */
export function soulGain(held: number, need: number, exp: number): number {
  return Math.max(0, Math.min(held, TRAIN_SOUL.STEP, need - exp));
}

/** Adds `gain` exp; reaching `need` levels up (exp back to 0). Gains are capped at the need, so there is no overflow. */
export function applySoul(state: SoulState, gain: number, need: number): SoulState {
  const exp = state.exp + gain;
  return exp >= need ? { lvl: state.lvl + 1, exp: 0 } : { lvl: state.lvl, exp };
}

/** Stat bonuses of the current level row (rates stay raw, like the panel shows them; fractional flats truncate once at the end). */
export function soulBonuses(row: SoulRow | undefined): Bonuses {
  const b = emptyBonuses();
  for (const p of row?.props ?? []) addProp(b, BUFF_PROP, p.t, p.v, false);
  return b;
}
