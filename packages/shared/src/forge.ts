// Forge ("Lò rèn") contract shared by server and client: equipment instance properties (quality, prefix, element,
// maker, rolled lines, holes, gems), the quality / star multiplier tables, crafting (getMakeColor, newMake), material
// mixing (materialMixOne/All), gem upgrade (jewelUpdateOne/All) and the phase D upgrades. Flash names and reply keys are kept as they are.

import type { BagItem } from './inventory.js';

/** GamePredef EQUIPT_QUALITY: line multiplier per quality index 0..20 (craft rolls use [q-1, q], capped at 20). */
export const EQUIPT_QUALITY = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.3, 2.5, 2.7, 2.9, 3.5] as const;
/** GamePredef EQUIPT_STAR_NUM: main-line multiplier per star 0..10. */
export const EQUIPT_STAR_NUM = [1, 1.1, 1.21, 1.33, 1.46, 1.61, 1.77, 1.94, 2.14, 2.36, 2.6] as const;
export const MAX_HOLES = 10;
export const MAX_STAR = 10;
/** Prefix (preNameType) names 1..5 (GAMEPREDEF_S[290..294]) and element names 1..6. */
export const PREFIX_NAMES = ['', 'Bình Thường', 'Cường Hóa', 'Tinh Xảo', 'Hoàn Mỹ', 'Trác Việt'] as const;
export const ELEMENT_NAMES = ['', 'Thủy', 'Hỏa', 'Địa', 'Phong', 'Quang', 'Ám'] as const;
/** Mixing / gem upgrade stack size per attempt (client stepper 2..5). */
export const MIX_MIN = 2;
export const MIX_MAX = 5;
/** Highest material ColorCode (level 6): mixing cannot go further. */
export const MAX_MATERIAL_COLOR = 5;

/** Main-line multiplier of a star level (clamped to 0..10). */
export function starMultiplier(star: number): number {
  const s = Math.min(MAX_STAR, Math.max(0, Math.trunc(Number.isFinite(star) ? star : 0)));
  return EQUIPT_STAR_NUM[s];
}

/** Quality multiplier at index `q` (clamped to the table). */
export function qualityMultiplier(q: number): number {
  return EQUIPT_QUALITY[Math.min(EQUIPT_QUALITY.length - 1, Math.max(0, Math.trunc(q)))];
}

/** materialMix success percent: `num * 20`, `num * 6` for ColorCode 4 (the client label shows the same). */
export function mixRate(num: number, colorCode: number): number {
  return num * (colorCode === 4 ? 6 : 20);
}

/** jewelUpdate success percent: `num * 20`, capped at 100. */
export function jewelRate(num: number): number {
  return Math.min(100, num * 20);
}

/** Stat lines of an equipment instance; absent keys fall back to the template (equip-stats). */
export interface EquipLines {
  mainProp1?: number;
  mainPropNum1?: number;
  mainProp2?: number;
  mainPropNum2?: number;
  prop1?: number;
  propNum1?: number;
  prop2?: number;
  propNum2?: number;
  bindMainPropNum1?: number;
  bindMainPropNum2?: number;
}

/** `character_items.properties` of an equipment instance (the legacy jsonb keys). */
export interface EquipProperties extends EquipLines {
  quality?: number; // q = bucket * 5 + prefix
  prefix?: number; // preNameType 1..5
  element?: number; // 0 none, 1..6
  makerName?: string;
  holeNum?: number; // drilled holes
  activeProp?: number; // soul (Linh hồn) prop 1..8 and value
  activePropNum?: number;
  [gem: `t${number}`]: number | undefined; // t1..t10: 0 empty drilled hole, > 0 gem template id, absent = undrilled (magic weapon: skill ids)
  flag?: string; // magic weapon: JSON string, sub weapons carry succ0..succ2 lines
  flag3?: string; // pet gear: inlaid pet stones, JSON {"hole":[tid,0,skillId]} (petStone.ts)
  /** Pet gear: 1 once a pet upgrade (tier / colour / bind / pre) ran, so stats use the Go colour-scaled lines and bind percent. */
  petGear?: number;
}

/** Instance fields carried by a BagItem (all optional: items and plain equipment have none). */
export interface EquipInstanceView {
  quality?: number;
  prefix?: number;
  element?: number;
  makerName?: string;
  star?: number;
  holeNum?: number;
  gems?: number[]; // t1..tholeNum, 0 = empty
  activeProp?: number;
  activePropNum?: number;
  lines?: EquipLines;
  flag3?: string; // pet gear: inlaid pet stones (see EquipProperties.flag3)
  /** Pet gear Thang hoa state parsed from `properties.flag` (absent while the piece was never sublimated). */
  sublime?: { id: number; add: number; element: number };
}

/** One material slot of getMakeColor / newMake: the item instance id (bag) or temp-bag position (not supported). */
export interface MaterialRef {
  tempBagFlag: boolean;
  idx: number;
}
/** Keys "1".."3" match the recipe's require_item1..3. */
export type MaterialRefs = Record<string, MaterialRef>;

export interface GetMakeColorReply {
  canMake: boolean;
  colorPerList?: { makePer1: number; makePer2: number; makePer3: number; makePer4: number };
  flag?: number; // 1 = level-6 material on equipment below level 60 (or unresolved materials)
}

export interface NewMakeReply {
  flag: boolean;
}

/** H5 helper `getMakeRecipes`: equipment templates with makable == 1 (Flash reads them from its static tables). */
export interface MakeRecipe {
  tid: number;
  name: string;
  iconCode: string;
  type: number; // equipment template type (tree group)
  position: number;
  reqLevel: number;
  reqClass: string; // "|1|3|" or ""
  color: number;
  materials: { slot: number; tid: number; name: string; iconCode: string; num: number }[]; // slot 1..3 = require_item1..3 (empty slots omitted)
}

export interface MaterialMixReply {
  slotId: number; // instance id of the source stack
  num: number; // units left in the source stack
  flag: boolean;
  finalNum: number; // successes of the "All" variant (0 for "One")
}

/** Short Vietnamese labels of the equipment prop ids used by the stat dictionary (tooltips of rolled lines). */
export const EQUIP_PROP_LABELS: Readonly<Record<number, string>> = {
  1: 'HP', 2: 'MP', 3: 'SP', 4: 'Công vật lý', 5: 'Công ma pháp', 6: 'Thủ vật lý', 7: 'Thủ ma pháp', 8: 'Chính xác',
  9: 'Né tránh', 10: 'Phản kích', 11: 'Tốc độ', 12: 'Liên kích', 13: 'Bạo kích', 14: 'Xuyên phòng ngự', 20: 'Lực',
  21: 'Nhẫn', 22: 'Trí', 23: 'Thần', 24: 'HP %', 25: 'MP %', 26: 'Hồi sinh', 27: 'Kháng bạo kích', 29: 'Kháng xuyên',
};

// ---- Phase D: equipment upgrades (stars, holes, gems, refinement, tier, resolve) ----

/** Star stone (Thăng Tinh Thạch), diamond (Kim Cương) and the item type of gems. */
export const STAR_STONE_TID = 5;
export const DIAMOND_TID = 16;
export const GEM_ITEM_TYPE = 503;
export const DIAMOND_ITEM_TYPE = 600;
export const STAR_STONE_MAX = 5;
/** Hole dig cost (silver of the selected money type), gem removal fee ratio of the gem's gold value. */
export const HOLE_DIG_COST = 2000;
export const GEM_REMOVE_FEE_RATE = 0.2;
/** GamePredef EQUIPT_STAR_SUCCESS indexed by the target star (the client shows `[star + 1]`). */
export const EQUIPT_STAR_SUCCESS = [100, 100, 100, 90, 80, 70, 60, 50, 30, 30, 30] as const;

/** Success percent of one star attempt from `star` with `count` stones (client display index, capped at 100). */
export function starRate(star: number, count: number): number {
  const s = Math.min(MAX_STAR - 1, Math.max(0, Math.trunc(star)));
  return Math.min(100, Math.floor((EQUIPT_STAR_SUCCESS[s + 1] * Math.max(0, count)) / STAR_STONE_MAX));
}

/** Minimum diamond ColorCode to dig hole `slot` (1..10): slots 1-2 need 0, 3-4 need 1, ... 9-10 need 4. */
export function diamondColorNeeded(slot: number): number {
  return Math.floor((Math.max(1, slot) - 1) / 2);
}

/** Silver fee to take a gem out: 20 % of its template gold value, rounded. */
export function gemRemoveFee(gemGold: number): number {
  return Math.round(Math.max(0, gemGold) * GEM_REMOVE_FEE_RATE);
}

/** Silver costs of the refinements (selected money type unless noted) and the tier-upgrade / prefix formulas. */
export const REFINE_COST = { element: 30000, bind: 30000, soulPerMode: 50000, name: 10000 } as const;
/** Prefix change and tier upgrade cost `reqLevel^2 * 10` (reqLevel falls back to item_level, then 1). */
export function levelCost(reqLevel: number): number {
  const l = Math.max(1, Math.trunc(reqLevel));
  return l * l * 10;
}
/** Soul stone per equipment level band (Linh Hồn Thạch): <= 60, <= 80, <= 100, above. */
export function soulStoneTid(reqLevel: number): number {
  return reqLevel <= 60 ? 1659 : reqLevel <= 80 ? 1660 : reqLevel <= 100 ? 1661 : 1662;
}

/** Wire reply of starOne / starAll (ids are item instance ids). */
export interface StarReply {
  equSlotId: number;
  starSlotId: number;
  num: number; // stones left in the stack
  starNum: number;
  flag: boolean; // last roll succeeded
}
export interface HoleDigReply {
  equSlotId: number;
  diamondSlotId: number;
  num: number;
  flag: boolean;
}
export interface HoleNumReply {
  holeNum: number;
  flag: boolean;
}
/** getJewelData: drilled holes and t1..t10 (-1 undrilled, 0 empty, > 0 gem template id). */
export interface JewelData {
  holeNum: number;
  t1: number; t2: number; t3: number; t4: number; t5: number;
  t6: number; t7: number; t8: number; t9: number; t10: number;
}
/** jewelSet gem refs: {"3": {idx: gemItemId, tempBagFlag: false}} = put that gem into hole 3. */
export type GemRefs = Record<string, MaterialRef>;

/** Refusal of every refine / tier call (the reason is pushed through onSystemMidMsgOrNote). */
export interface RefineFail {
  f: false;
}
export interface ChangeElementPreview {
  f: true;
  ii: number; // material stack id
  n: number; // units left
  e: number; // new element
  b: number; // old element
  ei: number; // new element (legacy duplicate)
}
export interface ChangeBindPreview {
  f: true;
  ii: number;
  n: number;
  b1: number;
  b11: number;
  b2: number;
  b12: number;
  mainProp1: number;
  mainProp2: number;
}
export interface ChangeSoulReply {
  f: true;
  type: '1' | '2'; // 1 = full re-roll (needs sureChangeSoul), 2 = value only (applied at once)
  ii: number;
  n: number;
  ap: number; // current prop
  apn: number; // current value (type 1) / new value (type 2)
  apro: number; // new prop (type 1) / new value (type 2)
  apropnum: number; // new value (type 1) / old value (type 2)
  apropnu?: number;
}
export interface ChangeNameReply {
  f: true;
  ii: number;
  n: number;
}
export type ChangeElementReply = ChangeElementPreview | RefineFail;
export type ChangeBindReply = ChangeBindPreview | RefineFail;
export type ChangeSoulResult = ChangeSoulReply | RefineFail;
export type ChangeNameResult = ChangeNameReply | RefineFail;
/** sureChange* replies keep the Flash string flags. */
export interface SureElementReply {
  f: 'true' | 'false';
  e?: number;
}
export interface SureBindReply {
  f: 'sure' | 'false';
  b1?: number;
  b2?: number;
}
export interface SureSoulReply {
  f: 'true' | 'false';
  activeProp?: number;
  activePropNum?: number;
}
/** changePrefix / changeLevel request: equipment id and the three material stack refs. */
export interface UpgradeRequest {
  e: number;
  i1: { idx: number; flag: boolean };
  i2: { idx: number; flag: boolean };
  i3: { idx: number; flag: boolean };
}
export interface ChangePrefixPreview {
  f: true;
  equIns: BagItem; // the previewed result
  oldEquIns: BagItem;
  sid: number;
  i: number;
}
export type ChangePrefixReply = ChangePrefixPreview | RefineFail;
export interface SureResult {
  f: true;
  e: number;
  i: number;
  n: BagItem;
}
export type SurePrefixReply = SureResult | RefineFail;
export interface ChangeLevelDone extends SureResult {
  sid: number;
}
export type ChangeLevelReply = ChangeLevelDone | RefineFail;
export interface BindItemReply {
  success: boolean;
}

/** One material line of the H5 helper `getUpgradeInfo`. */
export interface UpgradeMaterial {
  slot: number; // 1..3
  tid: number;
  name: string;
  num: number;
}
/** A socketed gem of `getUpgradeInfo`: hole number, gem template and the silver fee to take it out. */
export interface GemInfo {
  slot: number; // 1..10
  tid: number;
  name: string;
  iconCode: string;
  propType: number; // EQUIP_PROP id
  propNum: number;
  fee: number;
}

/** H5 helper reply (Flash reads the templates from its static tables): everything the upgrade tabs need for one equipment. */
export interface UpgradeInfo {
  id: number;
  tid: number;
  reqLevel: number;
  /** require_item1..3 of the template: slot 1 = element material, 2 = bind material, 3 = maker-name material; all three = prefix. */
  refineMaterials: UpgradeMaterial[];
  soul: { tid: number; name: string; activeProp: number; activePropNum: number; maxNum: number };
  prefixCost: number;
  holeCapacity: number;
  /** Gems in the drilled holes (empty holes omitted). */
  gems: GemInfo[];
  next: null | {
    tid: number;
    name: string;
    reqLevel: number;
    iconCode: string;
    cost: number;
    materials: UpgradeMaterial[];
  };
  resolve: { tid: number; name: string; num: number; color: number; iconCode: string }[];
}
