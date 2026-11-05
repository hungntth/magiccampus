// Type-6 (Mỗi ngày) quest rules (Go quest/daily_quest.go + require_cost.go), pure: a daily counts as done only when it was
// finished today (UTC+7 day start, M10 decision 2), other types once ever; the turn-in cost TBL_QUEST.rt / rn (rt 1-4 =
// moneyBind / money / goldBind / gold; other rt kinds have no H5 wallet and are not charged).

import { QuestType, startOfDayMs } from '@mc/shared';
import type { QuestTemplate } from '../gamedata/quest-data';

export interface HistoryRow {
  questId: number;
  completedAt?: Date | null;
}

/** Quest ids that gate re-takes / prerequisites now. Loop rounds never count (they have no history anyway). */
export function doneQuestIds(hist: readonly HistoryRow[], typeOf: (qid: number) => number | undefined, nowMs: number): Set<number> {
  const todayStart = startOfDayMs(nowMs);
  const out = new Set<number>();
  for (const h of hist) {
    const type = typeOf(h.questId);
    if (type === QuestType.LOOP) continue;
    if (type === QuestType.DAILY && (!h.completedAt || h.completedAt.getTime() < todayStart)) continue;
    out.add(h.questId);
  }
  return out;
}

export type CostKey = 'moneyBind' | 'money' | 'goldBind' | 'gold';

const COST_KEYS: Readonly<Record<number, CostKey>> = { 1: 'moneyBind', 2: 'money', 3: 'goldBind', 4: 'gold' };
const COST_LABELS: Readonly<Record<CostKey, string>> = { moneyBind: 'Ngân phiếu', money: 'Bạc', goldBind: 'Kim phiếu', gold: 'Vàng' };

/** The turn-in cost of a quest, or null when it costs nothing (or an rt kind H5 has no wallet for). */
export function requireCost(tpl: Pick<QuestTemplate, 'rt' | 'rn'>): { key: CostKey; amount: number } | null {
  if (!(tpl.rn > 0)) return null;
  const key = COST_KEYS[tpl.rt];
  return key ? { key, amount: Math.floor(tpl.rn) } : null;
}

/** Go RequireCostError.Info(): "Không đủ <currency>!". */
export function costRefusal(key: CostKey): string {
  return `Không đủ ${COST_LABELS[key]}!`;
}
