// Stat-feature systems (M7 phase C): train soul (trainSoul), awakening (awakening / ensureBuyAwaken / addAwakenPoint /
// reduceAwakenPoint), war sprite (getSpWarData, getWSPBuffList, add(War|Battle)Sprite[Gold], push updateWSPPanel) and magic crystal
// (initMagicCrystalData, MagicCrystal*, push onInitMagicCrystalData). RPC / push names are the Flash names; the `*Info` / `view`
// payloads are H5 extensions (the client has no static tables). Pure helpers only: the magic crystal catalog lives here because the
// client panel and the server rules read the same numbers (transcribed from GamePredef.MAGIC_CRYSTAL_UP / _ACTIVE).

/** One stat line of a progression table: prop id (Flash AWAKEN_PROP_DICT ids) and its raw value. */
export interface PropLine {
  t: number;
  v: number;
}

/** Labels of the prop ids used by these systems (GamePredef.AWAKEN_PROP_DICT + the war-sprite / crystal extras). */
export const PROP_LABELS: Readonly<Record<number, string>> = {
  1: 'HP', 2: 'MP', 4: 'Công VL', 5: 'Công MP', 6: 'Phòng VL', 7: 'Phòng MP', 8: 'C.Xác', 9: 'N.Tránh', 11: 'Tốc',
  13: 'B.Kích', 14: 'XPN', 31: 'Kh.Bạo', 32: 'Giảm C.Xác', 34: 'Miễn Tử', 58: 'Giảm Kháng', 59: 'Giảm STVL Cuối',
  60: 'Giảm STMP Cuối', 61: 'Kháng XPN', 62: 'Tăng STVL Cuối', 63: 'Tăng STMP Cuối', 72: 'Phá Miễn Tử',
};

/** Awaken panel shows these props with a % suffix (GamePredef.AWAKEN_PERCENT_PROP). */
export const AWAKEN_PERCENT_PROPS: readonly number[] = [62, 63];

export function propLabel(t: number): string {
  return PROP_LABELS[t] ?? `#${t}`;
}

/** "HP+231" (train soul / awakening rows: raw value, % only for AWAKEN_PERCENT_PROPS). */
export function propLineText(line: PropLine): string {
  return `${propLabel(line.t)}+${line.v}${AWAKEN_PERCENT_PROPS.includes(line.t) ? '%' : ''}`;
}

// --- Train soul (Luyện Hồn) ---

export const TRAIN_SOUL = {
  MAX_LEVEL: 100, // TrainSoulPanel MAX_SOUL_LVL
  MIN_PLAYER_LEVEL: 50, // help text TRAIN_SOUL_PANEL[7]
  /** H5 (Go: +10000 exp per call): crystals converted per call; 1 crystal = 1 exp (help text), never more than the level needs. */
  STEP: 10_000,
} as const;

/** trainSoul reply (client reads soulLvl / soulExp). soulExp is the progress INSIDE the current level (resets on level up). */
export interface TrainSoulResult {
  soulLvl: number;
  soulExp: number;
}

/** H5 getTrainSoulInfo reply: the panel view (bar = soulExp / need, current / next level rows). */
export interface TrainSoulInfo extends TrainSoulResult {
  need: number; // data_tbl_soul[lvl + 1].require_num, 0 at max level
  maxed: boolean;
  current: PropLine[]; // row of the current level (absolute, not cumulative)
  next: PropLine[];
}

// --- Awakening (Giác Ngộ / Thức Tỉnh) ---

export const AWAKEN = {
  ITEM_ID: 4913, // Hỗn Độn Ma Tinh
  EDGE: 77, // rows of data_tbl_awakening = max level
  MIN_LEVEL: 80, // lowest req_level of the table (help text: player level 80+)
  PITY_STEP: 1, // H5/Go-invented: extra success percent per miss, reset on success
  BUY_GOLD_PER_ITEM: 10, // H5/Go-invented auto-buy price: unbound gold per missing item
} as const;

/** Login payload (PlayerData.awaken*): the client keeps them on the player. */
export interface AwakenLogin {
  awakenLevel: number;
  awakenAdd: number;
  awakenPoint: number;
  awakenPointUsed: number;
  awakenPointDict: Record<string, number>;
}

export interface AwakenNext {
  level: number;
  name: string;
  reqLevel: number;
  itemNum: number;
  money: number;
  rate: number;
  points: number;
  props: PropLine[];
}

export interface AwakenSkillView {
  id: number;
  code: string; // key of awakenDict (first part of skill_code_name)
  name: string;
  desc: string;
  cost: number;
  max: number;
  req: number; // points that must already be spent
  reqClass: number;
}

/** H5 getAwakenInfo reply. `total` = sum of the rows 1..awakenLevel (client AwakenPanel). */
export interface AwakenInfo extends AwakenLogin {
  next: AwakenNext | null;
  itemHave: number;
  total: PropLine[];
  skills: AwakenSkillView[];
}

/** awakening(autoBuy) / ensureBuyAwaken reply. */
export type AwakenReply =
  | { needGold: number }
  | { success: true; awakenLevel: number; awakenPoint: number; awakenAdd: 0 }
  | { success: false; itemNum: number; awakenAdd: number };

/** addAwakenPoint / reduceAwakenPoint reply. */
export interface AwakenPointReply {
  awakenPoint: number;
  awakenPointUsed: number;
  awakenDict: Record<string, number>;
}

// --- War sprite (Chiến Hồn Bạo Nộ) ---

export const WAR_SPRITE = {
  SLOTS: 8,
  WAR_ROOTS: [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800],
  BATTLE_ROOTS: [2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800],
} as const;

/** {wObj:{1..8: template id}, bObj:{1..8: template id}} (getSpWarData reply, updateWSPPanel push). */
export interface WspState {
  wObj: Record<string, number>;
  bObj: Record<string, number>;
}

export interface WspRowView {
  id: number;
  level: number;
  name: string;
  costNum: number;
  costGold: number;
  props: PropLine[]; // raw p_n values
}

export interface WspSlotView {
  cur: WspRowView;
  next: WspRowView | null;
}

/** H5 extension of the panel payload: the rows to draw and the raw aggregated totals ({propType: total}, getWSPBuffList). */
export interface WspPanelData extends WspState {
  view?: { war: WspSlotView[]; battle: WspSlotView[]; totals: Record<string, number> };
}

/** add(War|Battle)Sprite[Gold] reply. */
export interface WspUpgradeReply {
  kind: 1 | 2;
  index: number;
  newId: number;
  usedGold: boolean;
  maxed: boolean;
}

/** Stat value of a raw war-sprite number (WarSpritePanel display = what the stat gets): 13/14/31/61 /10000, 59/60/62/63 /100. */
export function wspStatValue(propType: number, raw: number): number {
  if (propType === 13 || propType === 14 || propType === 31 || propType === 61) return raw / 10000;
  if (propType === 59 || propType === 60 || propType === 62 || propType === 63) return raw / 100;
  return raw;
}

/** "+0.25" / "+0.5%" (per-row and total display of the war sprite panel). */
export function wspValueText(propType: number, raw: number): string {
  const v = Math.round(wspStatValue(propType, raw) * 10_000) / 10_000;
  return `+${v}${propType === 59 || propType === 60 || propType === 62 || propType === 63 ? '%' : ''}`;
}

// --- Magic crystal (Pháp Tinh / Pha Lê Ma Thuật) ---

export const MAGIC_CRYSTAL = {
  SLOTS: 16,
  MAX_LEVEL: 9,
  MAX_ADD: 10_000, // per MagicCrystalAddPower call
  RECOVER_COST: 1, // dust per MagicCrystalRecovery
} as const;

/** One pool (Go Crystal): a active, max capacity, l permanent points (pointType "1"), s temporary (pointType "2"), lv 0-9. */
export interface CrystalSlot {
  a: 0 | 1;
  max: number;
  l: number;
  s: number;
  lv: number;
}

/** onInitMagicCrystalData payload: object keyed "0".."15". */
export type MagicCrystalData = Record<string, CrystalSlot>;

// Slot -> stat prop type (GamePredef.MAGIC_CRYSTAL_UP[slot][lv].t).
const CRYSTAL_TYPES = [1, 2, 4, 5, 6, 7, 11, 13, 31, 14, 61, 8, 9, 32, 58, 72] as const;
// Activation cost in dust (GamePredef.MAGIC_CRYSTAL_ACTIVE[slot].num).
const CRYSTAL_ACTIVATE = [10, 10, 10, 10, 10, 10, 10, 8, 8, 12, 12, 8, 8, 12, 12, 8] as const;
// Value at level 0; the table is linear: V[lv] = base * (lv + 1).
const CRYSTAL_BASE = [12000, 4000, 3000, 2400, 9600, 9600, 1200, 1.2, 1.2, 0.5, 0.5, 1.2, 1.2, 1, 1, 1.2] as const;
// Raise-cap cost per level (0 at the last level) by slot family.
const COST_A = [20, 30, 40, 50, 60, 60, 70, 80, 90, 0] as const; // slots 0-6
const COST_B = [12, 24, 32, 40, 48, 52, 62, 70, 90, 0] as const; // slots 7, 8, 11, 12, 15
const COST_C = [24, 32, 42, 52, 64, 64, 72, 88, 90, 0] as const; // slots 9, 10, 13, 14

const validSlot = (slot: number): boolean => Number.isInteger(slot) && slot >= 0 && slot < MAGIC_CRYSTAL.SLOTS;
const validLevel = (lv: number): boolean => Number.isInteger(lv) && lv >= 0 && lv <= MAGIC_CRYSTAL.MAX_LEVEL;

/** Capacity of a pool at a level: (lv + 1) * 100. */
export function crystalMaxAt(lv: number): number {
  return (Math.min(Math.max(Math.trunc(lv), 0), MAGIC_CRYSTAL.MAX_LEVEL) + 1) * 100;
}

export function crystalStatType(slot: number): number {
  return validSlot(slot) ? CRYSTAL_TYPES[slot] : 0;
}

/** Dust to activate; null for an invalid slot. */
export function crystalActivateCost(slot: number): number | null {
  return validSlot(slot) ? CRYSTAL_ACTIVATE[slot] : null;
}

/** Dust to raise the cap from `lv`; 0 at the last level, null for an invalid slot / level. */
export function crystalLevelUpCost(slot: number, lv: number): number | null {
  if (!validSlot(slot) || !validLevel(lv)) return null;
  if (slot <= 6) return COST_A[lv];
  if (slot === 9 || slot === 10 || slot === 13 || slot === 14) return COST_C[lv];
  return COST_B[lv];
}

/** Stat value of a pool at full fill; 0 for an invalid slot / level. */
export function crystalFullValue(slot: number, lv: number): number {
  if (!validSlot(slot) || !validLevel(lv)) return 0;
  return Math.round(CRYSTAL_BASE[slot] * (lv + 1) * 10_000) / 10_000;
}

/** Current stat of an active pool: V * min(l + s, max) / max (MagicCrystalPanel display). */
export function crystalCurrentValue(slot: number, c: CrystalSlot): number {
  if (c.a !== 1 || c.max <= 0) return 0;
  return (crystalFullValue(slot, c.lv) * Math.min(c.l + c.s, c.max)) / c.max;
}

/** Fresh state: 16 inactive pools. */
export function emptyCrystals(): MagicCrystalData {
  const out: MagicCrystalData = {};
  for (let i = 0; i < MAGIC_CRYSTAL.SLOTS; i++) out[String(i)] = { a: 0, max: 0, l: 0, s: 0, lv: 0 };
  return out;
}
