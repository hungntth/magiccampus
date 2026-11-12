// Ấn Thạch (stone seal) contract (M13 phase E2, legacy StoneSealPanel / StoneSealBoreCanvas). Every RPC answers the Responder shape StoneSealReply
// `{flag, data}` (flag false = refused; H5 also shows the reason through onSystemMidMsgOrNote): stoneSealGetData(), stoneSealSetStone(equipSid, sealIndex,
// stoneItemId, tempBagFlag), stoneSealRemoveStone(equipSid, sealIndex), stoneSealRemoveAllStone(equipSid), stoneSealSwapStone(equipSid, i1, i2),
// stoneSealBore(equipSid, sealIndex, payMode, diamondItemId), stoneSealSuccinct(equipSid, payMode). Push: onUPP (character stats, currencies, gold).
// Tables are the client tables (StoneSealBoreCanvas.as / StoneSealPanel.as), verbatim.

export const STONE_SEAL = {
  MIN_EQUIP: 1,
  MAX_EQUIP: 12,
  HOLES: 10,
  MAX_LEVEL: 5,
  /** Hole value: absent = not bored, 0 = bored and empty, > 0 = stone template id (Go fix 2026-10-25). */
  EMPTY_HOLE: 0,
  PAY_GOLD: 1,
  PAY_BORE_DUST: 2,
  PAY_SUCCINCT_DUST: 3,
  /** Item type of a seal stone (a gem / jewel). */
  STONE_ITEM_TYPE: 503,
  /** Kim Cương template and the colour needed per bored-hole count (STONE_SEAL_BORE_ITEM_COLOR). */
  DIAMOND_TEMPLATE: 16,
} as const;

export const STONE_SEAL_BORE_DUST_COST = [50, 60, 77, 102, 136, 180, 234, 299, 375, 463] as const;
export const STONE_SEAL_BORE_GOLD_COST = [71, 86, 110, 146, 195, 258, 335, 428, 537, 663] as const;
export const STONE_SEAL_BORE_DIAMOND_COUNT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] as const;
export const STONE_SEAL_BORE_DIAMOND_COLOR = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4] as const;
export const STONE_SEAL_SUCCINCT_DUST_COST = [110, 110, 275, 529, 582] as const;
export const STONE_SEAL_SUCCINCT_GOLD_COST = [157, 157, 390, 751, 826] as const;
/** Multiplier of the add lines per seal level 0..5. */
export const STONE_SEAL_SUCCINCT_CONF = [1, 1, 3.332, 6.0148, 15.81847, 23.26693] as const;

const at = (table: readonly number[], idx: number): number => table[Math.max(0, Math.min(table.length - 1, Math.trunc(idx) || 0))]!;
export const stoneSealBoreCost = (bored: number, gold: boolean): number => at(gold ? STONE_SEAL_BORE_GOLD_COST : STONE_SEAL_BORE_DUST_COST, bored);
export const stoneSealSuccinctCost = (lvl: number, gold: boolean): number => at(gold ? STONE_SEAL_SUCCINCT_GOLD_COST : STONE_SEAL_SUCCINCT_DUST_COST, lvl);
export const stoneSealDiamondColor = (bored: number): number => at(STONE_SEAL_BORE_DIAMOND_COLOR, bored);

/** Same-prop pairs give nothing (N = 0, STONE_SEAL_CONF_EXTRA_PROPERTY diagonal). */
type Cell = readonly [n: number, v: number];
const SAME: Cell = [0, 100000];
const DEBUFF_ROW = (n: number, v: number): Record<number, Cell> => ({ 7: [n, v], 8: [n, v], 9: [n, v], 10: [n, v], 11: [n, v], 12: [n, v], 13: [n, v], 14: [n, v] });
const STATUS: Record<number, Cell> = { 7: [53, 10.8], 8: [52, 10.8], 9: [56, 10.8], 10: [54, 10.8], 11: [54, 10.8], 12: [55, 10.8], 13: [57, 10.8], 14: [55, 10.8] };

/** STONE_SEAL_CONF_EXTRA_PROPERTY[min(gemProp, stoneProp)][max(...)] = [bonus prop (BUFF_PROP_NAME_ARR id), value per colour unit]. */
export const STONE_SEAL_EXTRA: Readonly<Record<number, Readonly<Record<number, Cell>>>> = {
  1: { 1: SAME, 2: [13, 5.40001], 3: [31, 5.40001], 4: [12, 2.88001], 5: [59, 4.32001], 6: [4, 3960.01], ...STATUS },
  2: { 2: SAME, 3: [10, 4.32001], 4: [14, 1.8], 5: [62, 5.76001], 6: [11, 1440], ...STATUS },
  3: { 3: SAME, 4: [61, 3.60001], 5: [60, 4.32001], 6: [1, 18000], ...STATUS },
  4: { 4: SAME, 5: [63, 5.76001], 6: [5, 1440], ...STATUS },
  5: { 5: SAME, 6: [2, 1353.6], ...STATUS },
  6: { 6: SAME, ...DEBUFF_ROW(32, 5.40001) },
  7: { 7: SAME, 8: [4, 3960.01], 9: [6, 20160], 10: [5, 1440], 11: [34, 4.32001], 12: [34, 4.32001], 13: [7, 18720], 14: [34, 4.32001] },
  8: { 8: SAME, 9: [7, 18720], 10: [7, 18720], 11: [5, 1440], 12: [4, 3960.01], 13: [6, 20160], 14: [6, 1440] },
  9: { 9: SAME, 10: [6, 20160], 11: [34, 4.32001], 12: [5, 1440], 13: [7, 18720], 14: [4, 3960.01] },
  10: { 10: SAME, 11: [34, 4.32001], 12: [34, 4.32001], 13: [4, 3960.01], 14: [34, 4.32001] },
  11: { 11: SAME, 12: [34, 4.32001], 13: [34, 4.32001], 14: [34, 4.32001] },
  12: { 12: SAME, 13: [34, 4.32001], 14: [34, 4.32001] },
  13: { 13: SAME, 14: [5, 1440] },
  14: { 14: SAME },
};

export interface StoneSealAdd {
  /** Bonus prop id (BUFF_PROP ids). */
  t: number;
  /** Raw value; the panel shows n / 10000 (floor to 2 decimals). */
  n: number;
}

/**
 * The seal "add" line of one hole (Go computeStoneSealAddBlock = client refreshAddPropTxt): needs a gem on the equipment and a stone, both with a
 * prop; n = value x (gemColour + stoneColour + 2) x succinct multiplier of the seal level. Null when the pair gives nothing.
 */
export function stoneSealAddLine(gemProp: number, stoneProp: number, gemColor: number, stoneColor: number, lvl: number): StoneSealAdd | null {
  if (gemProp <= 0 || stoneProp <= 0) return null;
  const cell = STONE_SEAL_EXTRA[Math.min(gemProp, stoneProp)]?.[Math.max(gemProp, stoneProp)];
  if (!cell || cell[0] === 0) return null;
  const mult = STONE_SEAL_SUCCINCT_CONF[Math.max(0, Math.min(STONE_SEAL.MAX_LEVEL, Math.trunc(lvl) || 0))]!;
  const n = cell[1] * (gemColor + stoneColor + 2) * mult;
  return n === 0 ? null : { t: cell[0], n };
}

/** `data` of one equipment slot: s1..s10. */
export type StoneSealHoles = Record<string, number>;
export interface StoneSealSlot {
  lvl: number;
  data: StoneSealHoles;
}
/** Equip sid (1..12) -> state; the wire `data` of every reply. */
export type StoneSealData = Record<string, StoneSealSlot>;

/** Item facts of a stone / gem for the H5 panel. */
export interface StoneSealItemInfo {
  tid: number;
  name: string;
  icon: string;
  prop: number;
  num: number;
  color: number;
}

export interface StoneSealHoleView {
  idx: number;
  open: boolean;
  stone?: StoneSealItemInfo;
  /** Gem socketed in the same hole of the equipment. */
  gem?: StoneSealItemInfo;
  /** The stone gives nothing of its own (same prop as the gem). */
  weakened?: boolean;
  add?: StoneSealAdd;
}

export interface StoneSealEquipView {
  sid: number;
  equipTid: number;
  equipName: string;
  equipIcon: string;
  lvl: number;
  bored: number;
  holes: StoneSealHoleView[];
}

export interface StoneSealReply {
  flag: boolean;
  data: StoneSealData;
  watch?: boolean;
  equip?: null;
  slot?: null;
  /** H5 extension: derived display of the 12 slots. */
  view?: StoneSealEquipView[];
}

export const STONE_SEAL_TEXT = {
  BAD_EQUIP: 'Vị trí trang bị không hợp lệ',
  BAD_HOLE: 'Vị trí ô không hợp lệ',
  NOT_BORED: 'Đục lỗ trước',
  EMPTY_HOLE: 'Ô trống',
  ALREADY_BORED: 'Ô đã khai ấn',
  ALL_BORED: 'Đã khai ấn tối đa',
  MAX_LEVEL: 'Kết ấn đã đạt cấp cao nhất!',
  NO_STONE: 'Không tìm thấy bảo thạch',
  NOT_STONE: 'Vui lòng đặt bảo thạch chính xác',
  NO_DIAMOND: 'Không đủ Kim Cương',
  NO_DUST: 'Không đủ Bụi Ấn Thạch',
  NO_GOLD: 'Không đủ vàng',
  BAG_FULL: 'Túi đã đầy',
  BAD_PAY: 'Cách thanh toán không hợp lệ',
  BAD_ITEM: 'Vật phẩm không hợp lệ',
} as const;
