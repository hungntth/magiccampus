// Wing (Cánh) rules shared by server and client (M13 phase C, 13.3): equipment kind 13 at position 22, instance state kept in
// `character_items.properties.wing`, the legacy GamePredef tables (fusion / hole / star / feather / level), the pure hole-code and
// look helpers and `wingResFor` (art code from colour, level, chosen look and dye). RPC / push payloads are in wingProtocol.ts.

import type { WingFeatherInfo, WingView } from './wingProtocol.js';

/** Equipment template kind and equip position (= equipped sid) of wings. */
export const WING_KIND = 13;
export const WING_POSITION = 22;
export const WING_COLOUR_MAX = 4;
export const WING_COLOUR_NAMES = ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam'] as const;
export const WING_STAR_MAX = 10;
export const MAX_WING_HOLES = 10;

/** Cánh Ánh Sáng: fused only with the three premium series (owner rule 2026-11-07 of the legacy server). */
export const WING_LIGHT_TID = 1675;
export const WING_LIGHT_PARTNERS: readonly number[] = [1675, 1676, 1677, 1678];

/** Item templates the wing flows consume (data_tbl_item_template ids). */
export const WING_ITEM = {
  STAR: 2906, HOLE: 2907, BIND: 2843, PREFIX: 2937, FEATHER_LUCK: 3021, FEATHER_MIX_LUCK: 3017, EXP: 3627, CRIT: 3628, DYE: 3677,
} as const;
export const WING_BIND_ITEM_NUM = 10;
export const WING_DYE_ITEM_NUM = 10;
/** Prefix material units by colour (purple / orange only). */
export const WING_PREFIX_ITEM_NUM: Readonly<Record<number, number>> = { 3: 5, 4: 15 };
/** Silver per hole / prefix / bind action (Go-invented, kept). */
export const WING_MONEY = { PREFIX: 50_000, HOLE: 50_000, BIND: 30_000 } as const;
/** Gold price of one crit charm comes from its template (`gold` 10); buyCritItem accepts 1..CRIT_BUY_MAX. */
export const WING_CRIT_BUY_MAX = 99_999;

/** Fusion: success percent by main colour 0..3, minus 5 per sub with another template. */
export const WING_JOIN_SUCCESS = [100, 80, 50, 30] as const;
export const WING_JOIN_REDUCE = 5;
export const WING_JOIN_SUBS = 4;
/** Senior fusion (blue 2 / purple 3 main): sub count limits and the success percent by sub count - 4. */
export const WING_SENIOR_JOIN: Readonly<Record<number, { max: number; rates: readonly number[] }>> = {
  2: { max: 10, rates: [50, 53, 58, 65, 74, 85, 100] },
  3: { max: 16, rates: [30, 33, 36, 40, 44, 49, 54, 60, 66, 73, 81, 90, 100] },
};
export const WING_SENIOR_MIN = 4;
/** Fusion result colour needing a server-wide announcement. */
export const WING_ANNOUNCE_COLOUR = 3;

/**
 * Failed star try (owner rule 2026-11-09: failures are level dependent). Thresholds = the legacy `EquipStarFailStar` help table
 * (2026-10-25): from 1..5 stars a failure drops one star, 6 -> 4, 7 -> 5, 8 or 9 -> 0, 0 stays 0. Owner to confirm the numbers.
 */
export const WING_STAR_FAIL_TO: Readonly<Record<number, number>> = { 6: 4, 7: 5 };
export const WING_STAR_RESET_FROM = 8;
export function wingStarAfterFail(star: number): number {
  if (star <= 0 || star >= WING_STAR_RESET_FROM) return 0;
  return WING_STAR_FAIL_TO[star] ?? star - 1;
}

/** Holes: units of item 2907 per hole of that parity (index = holes already drilled of the parity), cap by colour (tens char, units pet). */
export const WING_HOLE_ITEM_NUM = [1, 5, 25, 125, 625] as const;
export const WING_HOLE_COLOUR_MAX = [22, 22, 22, 33, 55] as const;
export const WING_HOLES_PER_GROUP = 5;

/** Feathers: item types, per-category budget, upgrade / mix rates, remove fee (silver by feather colour). */
export const FEATHER_TYPE = { MIX: 1400, A: 1401, B: 1402, C: 1403, D: 1404 } as const;
export const FEATHER_TYPE_BUDGET: Readonly<Record<number, number>> = { 1401: 1, 1402: 1, 1403: 1, 1404: 2 };
export const FEATHER_UPDATE_BATCH = 5;
export const FEATHER_UPDATE_RATE: Readonly<Record<number, number>> = { 0: 100, 1: 90, 2: 75, 3: 55 };
export const FEATHER_UPDATE_LUCK_ADD = 5;
export const FEATHER_MIX_RATE: Readonly<Record<number, number>> = { 2: 60, 3: 30 };
export const FEATHER_MIX_LUCK_ADD = 10;
export const FEATHER_DEL_MONEY = [25_000, 125_000, 700_000, 4_500_000, 40_000_000] as const;
/** Short labels of FEATHER_PROP ids 1..22 (odd holes feed the character, even holes every pet). */
export const FEATHER_PROP_LABELS: Readonly<Record<number, string>> = {
  1: 'Công vật lý', 2: 'Công ma pháp', 3: 'Chính xác', 4: 'Bạo kích', 5: 'Phòng ngự', 6: 'Kháng bạo kích', 7: 'Sinh mệnh', 8: 'Ma pháp',
  9: 'Tốc độ', 10: 'Miễn tử', 11: 'Hỗn loạn', 12: 'Thất hồn', 13: 'Trúng độc', 14: 'Trào phúng', 15: 'Mê hồn', 16: 'Thạch hóa',
  17: 'Chống hỗn loạn', 18: 'Chống thất hồn', 19: 'Chống trúng độc', 20: 'Chống trào phúng', 21: 'Chống mê hồn', 22: 'Chống thạch hóa',
};

/** Level: stat multiplier of the four base lines, exp per level (halved for the Light wing), crit charm odds. */
export const WING_LEVEL_MAX = 10;
export const WING_LEVEL_ADD = [1.03, 1.08, 1.15, 1.24, 1.34, 1.45, 1.57, 1.7, 1.84, 1.99] as const;
export const WING_LEVEL_EXP = [100, 200, 300, 500, 700, 1000, 1300, 1700, 2200, 2800] as const;
export const WING_EXP_PER_ITEM = 10;
export const WING_CRIT_MULT = [2, 5, 10] as const;
export const WING_CRIT_WEIGHT = [70, 25, 5] as const;

/** Wing instance state (`properties.wing`). `holes`: -1 undrilled, 0 open and empty, > 0 feather template id (odd slots = character); absent = all open. */
export interface WingState {
  level?: number;
  exp?: number;
  /** Chosen look 0..2, absent = automatic (highest unlocked). */
  look?: number;
  /** Dye series per look (0 = none). */
  dye?: number[];
  holes?: number[];
}

/** Fully populated state. */
export interface WingData {
  level: number;
  exp: number;
  /** Chosen look 0..2; -1 = no choice (the highest unlocked look shows). */
  look: number;
  dye: [number, number, number];
  holes: number[];
}

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export function parseWing(raw: unknown): WingData {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as WingState;
  // Owner rule 2026-11-09: a wing without a stored hole list starts with all 10 holes open (0 = empty); a stored short list keeps -1 for the rest.
  const holes = Array.from({ length: MAX_WING_HOLES }, (_, i) => (!Array.isArray(r.holes) ? 0 : r.holes[i] !== undefined ? int(r.holes[i]) : -1));
  const dye = [0, 1, 2].map((i) => (Array.isArray(r.dye) ? Math.max(0, int(r.dye[i])) : 0)) as [number, number, number];
  return {
    level: Math.min(WING_LEVEL_MAX, Math.max(0, int(r.level))), exp: Math.max(0, int(r.exp)),
    look: r.look === undefined ? -1 : Math.min(2, Math.max(-1, int(r.look))), dye, holes: holes.map((h) => (h < 0 ? -1 : h)),
  };
}

/** Display colour 0..4 of an instance colorCode (colorCode = colour + 1, 0 = white). */
export const wingColourOf = (colorCode: number): number => Math.min(WING_COLOUR_MAX, Math.max(0, int(colorCode) - 1));
export const wingColorCodeOf = (colour: number): number => Math.min(WING_COLOUR_MAX, Math.max(0, colour)) + 1;

/** Wire view of an instance (colour from colorCode, state from properties.wing). */
export function wingViewOf(raw: unknown, colorCode: number, featherTpl: (tid: number) => Readonly<Record<string, unknown>> | undefined = () => undefined): WingView {
  const w = parseWing(raw);
  const feathers: Record<string, WingFeatherInfo> = {};
  for (const tid of new Set(w.holes.filter((h) => h > 0))) {
    const t = featherTpl(tid);
    feathers[String(tid)] = {
      name: String(t?.name ?? `#${tid}`), iconCode: t?.icon_code ? String(t.icon_code) : '0', colour: int(t?.color), type: int(t?.type), lines: featherLinesOf(t),
    };
  }
  return { colour: wingColourOf(colorCode), level: w.level, exp: w.exp, look: w.look, dye: [...w.dye], holes: [...w.holes], holeNum: holeNumCode(w.holes), feathers };
}

/** Drilled character (odd slot) and pet (even slot) holes. */
export function holeCounts(holes: readonly number[]): { char: number; pet: number } {
  let char = 0;
  let pet = 0;
  holes.slice(0, MAX_WING_HOLES).forEach((h, i) => {
    if (h < 0) return;
    if (i % 2 === 0) char++;
    else pet++;
  });
  return { char, pet };
}

/** Client `holeNum` code: tens = character holes, units = pet holes. */
export function holeNumCode(holes: readonly number[]): number {
  const { char, pet } = holeCounts(holes);
  return char * 10 + pet;
}

/** Next hole to drill (1-based slot) and its item cost; character first, alternating. Null at the per-parity cap. */
export function nextWingHole(holes: readonly number[]): { slot: number; cost: number } | null {
  const { char, pet } = holeCounts(holes);
  if (char > pet) return pet >= WING_HOLES_PER_GROUP ? null : { slot: 2 * (pet + 1), cost: WING_HOLE_ITEM_NUM[pet] };
  return char >= WING_HOLES_PER_GROUP ? null : { slot: 2 * char + 1, cost: WING_HOLE_ITEM_NUM[char] };
}

export const wingHoleCapacity = (colour: number): number => WING_HOLE_COLOUR_MAX[Math.min(WING_COLOUR_MAX, Math.max(0, colour))];

/** One stat line of a feather template (`i1/n1 .. i3/n3`): FEATHER_PROP id and value. */
export interface FeatherLine {
  prop: number;
  value: number;
}

export function featherLinesOf(tpl: Readonly<Record<string, unknown>> | undefined): FeatherLine[] {
  const out: FeatherLine[] = [];
  for (const n of [1, 2, 3]) {
    const prop = int(tpl?.[`i${n}`]);
    if (prop > 0) out.push({ prop, value: int(tpl?.[`n${n}`]) });
  }
  return out;
}

/** Wing fusion success percent (0 outside the four fusable colours). */
export function wingJoinRate(mainTid: number, colour: number, subTids: readonly number[]): number {
  if (colour < 0 || colour >= WING_JOIN_SUCCESS.length) return 0;
  return Math.max(0, WING_JOIN_SUCCESS[colour] - WING_JOIN_REDUCE * subTids.filter((t) => t !== mainTid).length);
}

/** The Light wing fuses only with the Light / Thiên Sứ / Ác Ma / Bích Không wings. */
export function wingJoinTidsValid(mainTid: number, subTids: readonly number[]): boolean {
  const all = [mainTid, ...subTids];
  return !all.includes(WING_LIGHT_TID) || all.every((t) => WING_LIGHT_PARTNERS.includes(t));
}

export function wingSeniorRate(colour: number, subCount: number): number {
  return WING_SENIOR_JOIN[colour]?.rates[subCount - WING_SENIOR_MIN] ?? 0;
}

export function featherUpgradeRate(featherColour: number, luck: number): number {
  const base = FEATHER_UPDATE_RATE[featherColour];
  return base === undefined ? 0 : Math.min(100, base + FEATHER_UPDATE_LUCK_ADD * Math.max(0, luck));
}

/** Mix success percent by the number of stats of the product feather (2 or 3, more counts as 3). */
export function featherMixRate(productStats: number, luck: number): number {
  const base = FEATHER_MIX_RATE[productStats] ?? (productStats > 3 ? FEATHER_MIX_RATE[3] : FEATHER_MIX_RATE[2]);
  return Math.min(100, base + FEATHER_MIX_LUCK_ADD * Math.max(0, luck));
}

export const wingLevelExpFor = (level: number, tid: number): number => {
  const need = WING_LEVEL_EXP[level];
  return need === undefined ? 0 : tid === WING_LIGHT_TID ? Math.floor(need / 2) : need;
};

/** Adds exp; overflow at the level cap is dropped. */
export function addWingExp(level: number, exp: number, gain: number, tid: number): { level: number; exp: number } {
  if (level >= WING_LEVEL_MAX) return { level: WING_LEVEL_MAX, exp: 0 };
  let e = exp + Math.max(0, gain);
  let l = level;
  while (l < WING_LEVEL_MAX) {
    const need = wingLevelExpFor(l, tid);
    if (need <= 0 || e < need) break;
    e -= need;
    l++;
  }
  return l >= WING_LEVEL_MAX ? { level: WING_LEVEL_MAX, exp: 0 } : { level: l, exp: e };
}

export const wingLevelMultiplier = (level: number): number => (level > 0 && level <= WING_LEVEL_MAX ? WING_LEVEL_ADD[level - 1] : 1);
/** Integer percent shown on the advance tab ("+3%"). */
export const wingLevelPercent = (level: number): number => Math.round((wingLevelMultiplier(level) - 1) * 100);

/** Crit charm multiplier for a 0..99 roll (70 % x2, 25 % x5, 5 % x10). */
export function wingCritMultiplier(roll: number): number {
  let acc = 0;
  for (let i = 0; i < WING_CRIT_WEIGHT.length; i++) {
    acc += WING_CRIT_WEIGHT[i];
    if (roll < acc) return WING_CRIT_MULT[i];
  }
  return WING_CRIT_MULT[0];
}

// ---- look: art codes `20703900SSSVVV` ----

const SERIES_BASE = 1_000_000;
const VARIANT_BASE = 1000;
/** Orange wings of series 1..4 (Ánh Sáng, Bích Không, Ác Ma, Thiên Sứ) have looks at level 5 and 10: [lv5 series, lv10 series]. */
export const WING_LEVEL_LOOK_SERIES: Readonly<Record<number, readonly [number, number]>> = { 1: [7, 60], 2: [9, 47], 3: [6, 35], 4: [8, 41] };
/** Dye palettes of the dyeable orange series (2 Bích Không, 3 Ác Ma, 4 Thiên Sứ) per look (base, lv5, lv10). */
export const WING_DYE_PALETTES: Readonly<Record<number, readonly [readonly number[], readonly number[], readonly number[]]>> = {
  2: [[10, 13, 14, 19, 22], [28, 29, 30, 32, 54], [48, 49, 50, 51, 52]],
  3: [[11, 15, 17, 20, 23], [55, 56, 57, 58, 59], [36, 37, 38, 39, 40]],
  4: [[12, 16, 18, 21, 24], [25, 26, 27, 31, 53], [42, 43, 44, 45, 46]],
};
export const WING_DYE_OPTIONS = 2;
/** Wing art that exists in this repo's asset cache (converted sheets under client/public/sheets/equip, measured 2026-11-09). */
export const WING_SHEET_CODES: ReadonlySet<string> = new Set([
  ...[1, 2, 3, 4].flatMap((s) => [1, 2, 3].map((v) => `2070390${String(s).padStart(3, '0')}${String(v).padStart(3, '0')}`)),
  '2070390005003', '2070390061003', '2070390062003', '2070390063003',
]);
export const isWingSheet = (code: string): boolean => WING_SHEET_CODES.has(code);

const seriesOf = (base: number): number => Math.floor(base / VARIANT_BASE) % VARIANT_BASE;
/** Templates whose res_code ends with 001 have colour variants; others are single-look art. */
const multiVariant = (base: number): boolean => base > 0 && base % VARIANT_BASE === 1;

/** Colour variant of the base art: 001 white / green / blue, 002 purple, 003 orange. */
export function wingColourCode(base: number, colour: number): number {
  if (!multiVariant(base)) return base;
  return base - 1 + (colour >= 4 ? 3 : colour === 3 ? 2 : 1);
}

export const wingSeriesCode = (base: number, series: number): number => Math.floor(base / SERIES_BASE) * SERIES_BASE + series * VARIANT_BASE + 3;

/** The three looks (index = look) with the dye applied. Single-look wings repeat the same art. */
export function wingLookCodes(base: number, colour: number, dye: readonly number[] = []): [number, number, number] {
  const c = wingColourCode(base, colour);
  const looks: [number, number, number] = [c, c, c];
  const levels = multiVariant(base) && colour >= 4 ? WING_LEVEL_LOOK_SERIES[seriesOf(base)] : undefined;
  if (levels) {
    looks[1] = wingSeriesCode(base, levels[0]);
    looks[2] = wingSeriesCode(base, levels[1]);
  }
  const palette = multiVariant(base) && colour >= 4 ? WING_DYE_PALETTES[seriesOf(base)] : undefined;
  if (palette) for (let i = 0; i < 3; i++) if (dye[i] && palette[i].includes(dye[i])) looks[i] = wingSeriesCode(base, dye[i]);
  return looks;
}

/** Highest look unlocked by the level: 0, 1 at level 5, 2 at level 10. */
export const wingUnlockedLook = (level: number): number => (level >= 10 ? 2 : level >= 5 ? 1 : 0);

/** A look index the wing can show now: unlocked by the level and (when `has` is given) its art exists. */
export function wingLookSelectable(base: number, colour: number, level: number, dye: readonly number[], index: number, has: (code: string) => boolean = isWingSheet): boolean {
  if (index < 0 || index > 2) return false;
  if (index === 0) return true;
  const looks = wingLookCodes(base, colour, dye);
  return looks[1] !== looks[0] && index <= wingUnlockedLook(level) && has(String(looks[index]));
}

/** Look index shown: the stored choice when selectable, else the highest selectable look not above the level. */
export function wingLookIndex(base: number, colour: number, level: number, stored: number, dye: readonly number[], has: (code: string) => boolean = isWingSheet): number {
  if (wingLookSelectable(base, colour, level, dye, stored, has)) return stored;
  for (let i = wingUnlockedLook(level); i > 0; i--) if (wingLookSelectable(base, colour, level, dye, i, has)) return i;
  return 0;
}

/** Art code of a worn wing as a string ('0' when the template has no art). */
export function wingResFor(base: number | string, colour: number, level: number, look: number, dye: readonly number[] = [], has: (code: string) => boolean = isWingSheet): string {
  const b = Number(base);
  if (!(b > 0)) return '0';
  return String(wingLookCodes(b, colour, dye)[wingLookIndex(b, colour, level, look, dye, has)]);
}

/** True when a dye is possible: orange wing of a dyeable series whose current look palette has art (at least one colour). */
export function wingDyePalette(base: number, colour: number, look: number): readonly number[] {
  return multiVariant(base) && colour >= 4 ? (WING_DYE_PALETTES[seriesOf(base)]?.[look] ?? []) : [];
}
