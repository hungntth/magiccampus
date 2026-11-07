// Per-day use caps (Go application/item/daily_use_limit.go): 2795 Ket Tinh Than Tu 3 per day, 2796 5 per day. Counts live in the
// feature state `item_daily_use` as { day: 'YYYY-MM-DD' (UTC+7), '<template id>': used }; a stored day other than today counts as
// zero. reserveDailyUse is pure: it returns the state to write (written before the effect) or null when the cap is reached.

export const ITEM_DAILY_USE_FEATURE = 'item_daily_use';

export const dailyLimitNotice = (name: string, limit: number): string =>
  `${name} mỗi ngày chỉ dùng được ${limit} cái, hôm nay bạn đã dùng đủ. Hãy quay lại vào ngày mai!`;

export function reserveDailyUse(
  state: Readonly<Record<string, unknown>>, templateId: number, cap: number, today: string,
): Record<string, unknown> | null {
  const sameDay = state.day === today;
  const used = sameDay ? Math.max(0, Number(state[String(templateId)] ?? 0) || 0) : 0;
  if (used >= cap) return null;
  return { ...(sameDay ? state : {}), day: today, [String(templateId)]: used + 1 };
}
