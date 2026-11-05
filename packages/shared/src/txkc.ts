// M10 phase H: Khóa Học Đặc Huấn (Flash texunkecheng / TXKCEXPPanel, strip id 80). RPCs getTXKCData, takeTXKCDailyQuest, openTXKCShop,
// openTXKCAdvanceCourse, buyTXKCEXP(levels), takeTXKCFreeAward, takeTXKCAdvanAward, TXKCGetProgressEXP(kind, id); pushes onTXKCGetData,
// onRedMsg / onBlueMsg. The 70-level award tables are the client's TXKC_AWARD_MAP / TXKC_ADVAN_AWARD_MAP (copied verbatim, all bound),
// the task ids are TBL_DIARY ids (TXKC_Daily_Lang) and weekly ids 1..6 (TXKC_Weekly_Lang). Pure helpers shared by server and panel.

export const TXKC = {
  MAX_LEVEL: 70,
  LEVEL_EXP: 500,
  ADVANCE_GOLD: 680,
  EXP_GOLD: 300, // per 500 exp (one level), advanced course only
  DAILY_EXP: 120,
  DAILY_SPECIAL_EXP: 150,
  WEEKLY_EXP: 280,
  KIND_DAILY: 1,
  KIND_WEEKLY: 2,
  SHOP_ID: 7,
  FEATURE_ID: 80,
  CLAIMED: 'exped',
  DONE: 'true',
} as const;

export interface TxkcTaskDef {
  id: number;
  /** diary task ids summed for the progress (empty for the vitality task) */
  diary: readonly number[];
  need: number;
  vitality?: true;
}

export const TXKC_DAILY_TASKS: readonly TxkcTaskDef[] = [
  { id: 1, diary: [1], need: 3 }, { id: 2, diary: [2], need: 3 }, { id: 4, diary: [4], need: 3 }, { id: 6, diary: [6], need: 1 },
  { id: 7, diary: [7], need: 1 }, { id: 8, diary: [8], need: 1 }, { id: 26, diary: [26], need: 1 }, { id: 27, diary: [27], need: 1 },
  { id: 37, diary: [37], need: 3 }, { id: 40, diary: [40], need: 1 },
];

export const TXKC_WEEKLY_TASKS: readonly TxkcTaskDef[] = [
  { id: 1, diary: [21, 22, 23, 24, 25, 35, 36, 38, 41], need: 5 }, // any dungeon
  { id: 2, diary: [19], need: 30 }, { id: 3, diary: [4], need: 30 }, { id: 4, diary: [17], need: 30 }, { id: 5, diary: [20], need: 50 },
  { id: 6, diary: [], need: 1000, vitality: true },
];

export const TXKC_DAILY_NAME: Readonly<Record<string, string>> = {
  '1': 'Hoàn thành 3 lần nhiệm vụ gia tộc', '2': 'Hoàn thành 3 lần nhiệm vụ treo thưởng', '4': 'Hoàn thành 3 lần nhiệm vụ thần tu',
  '6': 'Hoàn thành 1 lần nhiệm vụ câu cá', '7': 'Hoàn thành 1 lần nhiệm vụ hái thuốc', '8': 'Hoàn thành 1 lần nhiệm vụ trồng trọt',
  '26': 'Tham gia 1 lần đấu pet', '27': 'Hoàn thành 1 lần thu hoạch trang viên', '37': 'Hoàn thành 3 lần sổ tay ma thú',
  '40': 'Hoàn thành 1 lần Ước nguyện',
};

export const TXKC_WEEKLY_NAME: Readonly<Record<string, string>> = {
  '1': 'Tích lũy hoàn thành 5 lần phụ bản bất kỳ', '2': 'Tích lũy hoàn thành 30 lần nhiệm vụ trị an',
  '3': 'Tích lũy hoàn thành 30 lần nhiệm vụ thần tu', '4': 'Tích lũy hoàn thành 30 lần nhiệm vụ trừ ma',
  '5': 'Tích lũy hoàn thành 50 lần nhiệm vụ luyện pet', '6': 'Tích lũy nhận 1000 điểm năng nổ',
};

/** onTXKCGetData payload. Task wire values: "exped" claimed, "true" claimable, else "n/need". `dd` / `spIndex` only once opened. */
export interface TxkcData {
  start: string;
  end: string;
  days: number;
  flag: {
    lev: number;
    exp: number;
    p: 0 | 1;
    awd1: number;
    awd2: number;
    wd: Record<string, string>;
    dd?: Record<string, string>;
    spIndex?: number;
  };
}

/** getTXKCData reply (H5 helper, Go replies null): name + icon code of every award template, keyed by template id. */
export type TxkcItemInfo = Record<string, { name: string; iconCode: string }>;

export const TXKC_TEXT = {
  NO_GOLD: 'Không đủ Vàng.',
  ADVANCE_OWNED: 'Bạn đã mở khóa học cao cấp.',
  ADVANCE_NEED: 'Cần mở khóa học cao cấp trước.',
  MAX_LEVEL: 'Khóa học đã đạt cấp tối đa.',
  NOTHING: 'Không có phần thưởng có thể nhận.',
  BAG_FULL: 'Túi đã đầy, hãy dọn túi rồi nhận lại.',
  TASK_NOT_DONE: 'Nhiệm vụ chưa hoàn thành.',
  TASK_CLAIMED: 'Nhiệm vụ này đã nhận exp.',
  DAILY_CLOSED: 'Hãy mở nhiệm vụ hàng ngày trước.',
  DAILY_OPEN: 'Nhiệm vụ hàng ngày đã được mở.',
  ADVANCE_OPENED: 'Mở khóa học cao cấp thành công.',
  EXP_BOUGHT: (exp: number): string => `Mua thành công ${exp} exp khóa học.`,
  EXP_GAINED: (exp: number): string => `Nhận được ${exp} exp khóa học.`,
  SHOP_CLOSED: 'Cửa hàng Bút Chì chưa mở.',
  BUSY: 'Hệ thống bận, vui lòng thử lại sau.',
} as const;

/** Course level of a total exp (capped at 70). */
export const txkcLevel = (exp: number): number => Math.min(TXKC.MAX_LEVEL, Math.floor(exp / TXKC.LEVEL_EXP));

/** Exp inside the current level (0 at the cap). */
export const txkcLevelExp = (exp: number): number => (txkcLevel(exp) >= TXKC.MAX_LEVEL ? 0 : exp % TXKC.LEVEL_EXP);

/** `n` levels bought from `lev` (clamped to the cap): cost in gold and exp gained. */
export function txkcBuy(lev: number, levels: number): { levels: number; gold: number; exp: number } {
  const n = Math.max(0, Math.min(Math.trunc(levels), TXKC.MAX_LEVEL - lev));
  return { levels: n, gold: n * TXKC.EXP_GOLD, exp: n * TXKC.LEVEL_EXP };
}

/** Next level that is a multiple of 5 above `lev` (the panel's milestone row), 0 past the cap. */
export function txkcNextMilestone(lev: number): number {
  const n = (Math.floor(lev / 5) + 1) * 5;
  return n > 0 && n <= TXKC.MAX_LEVEL ? n : 0;
}

/** Wire text of a task: claimed / done / progress. */
export function txkcTaskWire(progress: number, need: number, claimed: boolean): string {
  if (claimed) return TXKC.CLAIMED;
  return progress >= need ? TXKC.DONE : `${progress}/${need}`;
}

/** One row of the panel's task list, decoded from a wire value. */
export interface TxkcTaskRow {
  id: number;
  text: string;
  state: 'claimed' | 'ready' | 'progress';
  progress: string;
  exp: number;
  special: boolean;
}

export function txkcTaskRows(
  raw: Readonly<Record<string, string>> | undefined, names: Readonly<Record<string, string>>, exp: number, spIndex?: number, spExp = exp,
): TxkcTaskRow[] {
  const out: TxkcTaskRow[] = [];
  for (const [k, v] of Object.entries(raw ?? {})) {
    const special = spIndex !== undefined && String(spIndex) === k;
    out.push({
      id: Number(k), text: names[k] ?? `Nhiệm vụ ${k}`, special, exp: special ? spExp : exp,
      state: v === TXKC.CLAIMED ? 'claimed' : v === TXKC.DONE ? 'ready' : 'progress',
      progress: v === TXKC.CLAIMED || v === TXKC.DONE ? 'Đã hoàn thành' : v,
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** [templateId, count] of a level award (1-based level), or undefined. */
export const txkcFreeAward = (level: number): readonly [number, number] | undefined => TXKC_FREE_AWARDS[level - 1];
export const txkcAdvanAward = (level: number): readonly [number, number] | undefined => TXKC_ADVAN_AWARDS[level - 1];

/** Awards of levels `from + 1 .. to` merged per template (Go MergeRewards: first-seen order, quantities added). */
export function txkcMergeAwards(table: readonly (readonly [number, number])[], from: number, to: number): { templateId: number; qty: number }[] {
  const out: { templateId: number; qty: number }[] = [];
  for (let lv = from + 1; lv <= to; lv++) {
    const a = table[lv - 1];
    if (!a || a[0] <= 0 || a[1] <= 0) continue;
    const hit = out.find((o) => o.templateId === a[0]);
    if (hit) hit.qty += a[1];
    else out.push({ templateId: a[0], qty: a[1] });
  }
  return out;
}

export const TXKC_FREE_AWARDS: readonly (readonly [number, number])[] = [
  [2333, 2], [5216, 1], [6733, 10], [4841, 10], [1333, 1], [6733, 10], [1405, 10], [2336, 1], [6733, 10], [6524, 1],
  [1365, 1], [6733, 10], [2037, 10], [6733, 35], [6524, 1], [5, 50], [2002, 2], [6733, 10], [2037, 5], [2336, 1],
  [6733, 10], [1315, 5], [274, 1], [2333, 1], [6733, 10], [2334, 2], [6733, 10], [2334, 1], [2002, 2], [6733, 35],
  [2334, 1], [5238, 1], [2334, 1], [5238, 1], [2334, 5], [274, 3], [2002, 2], [5216, 2], [329, 1], [6516, 1],
  [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1],
  [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1],
  [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1], [6526, 1],
];

export const TXKC_ADVAN_AWARDS: readonly (readonly [number, number])[] = [
  [6734, 1], [2336, 1], [6525, 3], [5215, 1], [1335, 1], [6524, 3], [1405, 10], [6525, 1], [1142, 1], [4595, 1],
  [5246, 1], [6525, 1], [5246, 1], [4841, 20], [2335, 1], [5, 99], [6524, 5], [6524, 5], [1142, 1], [4595, 1],
  [6525, 1], [2335, 1], [6524, 10], [6733, 10], [6800, 1], [1405, 10], [2335, 1], [3837, 1], [4841, 30], [4596, 1],
  [6733, 10], [6516, 1], [2335, 1], [6733, 10], [3837, 1], [6733, 5], [6733, 5], [6733, 5], [6525, 3], [6733, 50],
  [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5],
  [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5],
  [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5], [6733, 5],
];
