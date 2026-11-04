// War sprite (Chiến Hồn Bạo Nộ) rules, pure. Two chains of 8 sprites x 11 templates: kind 1 "level up" (stones = warSprite currency)
// and kind 2 "evolve" (stones = battleSprite). The cost is read on the CURRENT row. Aggregation (Go AggregateMultiplied): for every
// sprite i and prop slot j, total[p_t] += war.p_n + war.p_n * battle.p_n / 10000, then wspStatValue scales the raw total.

import { wspStatValue, type PropLine, type WspState } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { WspRow } from '../gamedata/feature-data';

export type WspKind = 1 | 2;

export interface WspUpgrade {
  newId: number;
  /** Stone cost, or the unbound gold cost when `gold`. */
  cost: number;
  gold: boolean;
  maxed: boolean;
}

/** Plans one upgrade from the current row, or a refusal text (max level, missing row). */
export function planWspUpgrade(row: WspRow | undefined, gold: boolean): WspUpgrade | string {
  if (!row) return 'Thiếu dữ liệu Chiến Hồn';
  if (row.nextId <= 0) return 'Đã Max Cấp';
  return { newId: row.nextId, cost: gold ? row.costGold : row.costNum, gold, maxed: false };
}

/** Raw totals {propType: sum} over both chains. */
export function wspTotals(state: WspState, rowOf: (id: number) => WspRow | undefined): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const idx of Object.keys(state.wObj)) {
    const war = rowOf(state.wObj[idx]);
    const battle = rowOf(state.bObj[idx]);
    if (!war) continue;
    war.props.forEach((p, j) => {
      if (p.v === 0) return;
      const bv = battle?.props[j]?.v ?? 0;
      totals[String(p.t)] = (totals[String(p.t)] ?? 0) + p.v + (p.v * bv) / 10000;
    });
  }
  return totals;
}

/** Stat bonuses of the totals (5 / 7 are applied too: the rows carry the same value as 4 / 6, the panel only draws one line). */
export function wspBonuses(totals: Record<string, number>): Bonuses {
  const b = emptyBonuses();
  for (const [t, raw] of Object.entries(totals)) addProp(b, BUFF_PROP, Number(t), wspStatValue(Number(t), raw), false);
  return b;
}

/** Row props a panel line shows: the 5 / 7 mirror lines are skipped (WarSpritePanel). */
export const displayProps = (props: readonly PropLine[]): PropLine[] => props.filter((p) => p.t !== 5 && p.t !== 7);
