// Lật Bài Truyền Thuyết reward tables (Go application/floppass config.go; every value but the client-fixed ones is a legacy owner
// assumption): per-stage reward pools (conf.pi, picked per stage and re-rolled by "làm mới") and the top-10 rank awards (conf.ri[rank + 10]).
// Prices, kill tiers, stage / card counts and the window live in @mc/shared flopPass.ts.

export interface FlopReward {
  templateId: number;
  count: number;
}

const LINH_VU = 3627;
const LONG_VU = 3677;
const TINH_LINH = 3390;
const TUI_KIM_LOAI = 1469;
const TUI_GO = 1470;
const TUI_KIM_LOAI_HIEM = 1455;
const TUI_GO_TOT = 1456;
const TUI_PHA_LE = 1457;

const r = (templateId: number, count: number): FlopReward => ({ templateId, count });

export const STAGE_POOLS: Readonly<Record<number, readonly FlopReward[]>> = {
  1: [r(LINH_VU, 2), r(TINH_LINH, 1), r(TUI_KIM_LOAI, 1), r(TUI_GO, 1)],
  2: [r(LINH_VU, 3), r(TINH_LINH, 1), r(TUI_KIM_LOAI, 1), r(TUI_GO, 1)],
  3: [r(LINH_VU, 4), r(TINH_LINH, 2), r(TUI_KIM_LOAI, 2), r(TUI_GO, 2)],
  4: [r(LINH_VU, 5), r(LONG_VU, 1), r(TUI_KIM_LOAI_HIEM, 1), r(TUI_GO_TOT, 1)],
  5: [r(LINH_VU, 6), r(LONG_VU, 1), r(TUI_KIM_LOAI_HIEM, 1), r(TUI_GO_TOT, 1)],
  6: [r(LINH_VU, 8), r(LONG_VU, 2), r(TUI_KIM_LOAI_HIEM, 2), r(TUI_GO_TOT, 2)],
  7: [r(LINH_VU, 10), r(LONG_VU, 2), r(TUI_PHA_LE, 1), r(TINH_LINH, 3)],
  8: [r(LINH_VU, 12), r(LONG_VU, 3), r(TUI_PHA_LE, 1), r(TINH_LINH, 4)],
  9: [r(LINH_VU, 20), r(LONG_VU, 5), r(TUI_PHA_LE, 2), r(TINH_LINH, 5)],
};

export const RANK_AWARDS: Readonly<Record<number, readonly FlopReward[]>> = {
  1: [r(LINH_VU, 100), r(LONG_VU, 20)],
  2: [r(LINH_VU, 80), r(LONG_VU, 15)],
  3: [r(LINH_VU, 60), r(LONG_VU, 10)],
  4: [r(LINH_VU, 30), r(LONG_VU, 5)],
  5: [r(LINH_VU, 30), r(LONG_VU, 5)],
  6: [r(LINH_VU, 30), r(LONG_VU, 5)],
  7: [r(LINH_VU, 30), r(LONG_VU, 5)],
  8: [r(LINH_VU, 30), r(LONG_VU, 5)],
  9: [r(LINH_VU, 30), r(LONG_VU, 5)],
  10: [r(LINH_VU, 30), r(LONG_VU, 5)],
};

/** Every template id the tables mention (the conf payload adds name / icon for each). */
export const FLOP_TEMPLATE_IDS: readonly number[] = [
  ...new Set([...Object.values(STAGE_POOLS), ...Object.values(RANK_AWARDS)].flatMap((rows) => rows.map((x) => x.templateId))),
];
