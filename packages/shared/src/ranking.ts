// Rankings shared contract (M6 phase D): rankGet(category) reply and the category / tab table of the legacy ActivePanel.
// Flash: ActivePanel.getInfo(category) -> remote.call("rankGet", Responder(onInfo), category); onInfo({name, data:[{id,name,guild,value}]}).

/** Categories the client requests through `rankGet` (ActivePanel getInfo call sites). */
export const RANK_CATEGORIES = [
  'expBattle', 'exp', 'money', 'pop', 'popMonth', 'popWeek', 'totalBp', 'lastWeekBp', 'achPoint', 'treasureHunt',
] as const;
export type RankCategory = (typeof RANK_CATEGORIES)[number];

/** Categories with an H5 data source; every other category answers the empty shape. */
export const RANK_LIVE_CATEGORIES: readonly RankCategory[] = ['exp', 'money', 'achPoint'];

/** List size and server-side cache lifetime (plan decision 5). */
export const RANK_TOP = 100;
export const RANK_CACHE_MS = 5 * 60 * 1000;

export interface RankRow {
  /** Character id (the client builds its double-click menu from it). */
  id: number;
  name: string;
  /** Guild name, "" when the character has no guild. */
  guild: string;
  /** `exp`: character level; `money`: moneyBind + money; `achPoint`: achievement points. */
  value: number;
}

export interface RankGetReply {
  /** Echo of the requested category (the client binds `this[name + "Grid"]`). */
  name: RankCategory;
  data: RankRow[];
}

/** Tab labels (ACTIVEPANEL_U[5..8], [42], [44..47], [54]) and the value column header (ACTIVEPANEL_S[21..26]). */
export const RANK_TABS: readonly { category: RankCategory; label: string; valueLabel: string }[] = [
  { category: 'expBattle', label: 'Ch.tích', valueLabel: 'Chiến tích' },
  { category: 'exp', label: 'Cấp', valueLabel: 'Cấp độ' },
  { category: 'money', label: 'Tài sản', valueLabel: 'Bạc' },
  { category: 'pop', label: 'Nhân khí', valueLabel: 'Tổng' },
  { category: 'popMonth', label: 'Nhân khí tháng', valueLabel: 'Tháng' },
  { category: 'popWeek', label: 'Nhân khí tuần', valueLabel: 'Tuần' },
  { category: 'totalBp', label: 'Đấu trường giác đấu', valueLabel: 'Chiến tích' },
  { category: 'achPoint', label: 'Thành tựu', valueLabel: 'Thành tựu' },
];

export function isRankCategory(v: unknown): v is RankCategory {
  return typeof v === 'string' && (RANK_CATEGORIES as readonly string[]).includes(v);
}
