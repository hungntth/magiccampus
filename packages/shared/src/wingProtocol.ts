// Wing wire contract (M13 phase C, 13.3). RPCs (Flash names): wingJoin(mainId, {w1..w4}), wingSeniorJoin(mainId, subIds), addWingStar(count,
// wingId, stoneId, upToNum), addWingHole(wingId, materialId), addWingFeather(wingId, {"1".."10": {idx, flag}}), featherMix, featherDel(wingId,
// index), featherUpdate, getFeatherData(wingId), changeWingColor(npcId) + onSureChangeWingColor(series), changeWingPrefix({e, i}) /
// sureChangeWingPrefix(1|-1), changeWingBind(wingId, materialId) / sureChangeWingBind(1|-1), changeWingRes(index), newWingAdvanced(useCrit,
// mode), showNewWingPro, buyCritItem(n), checkLimitWingEffect (dead, null), setWingHide(hide). Item ids on the wire are instance ids (`idx`).
// Pushes: onWingOn {cid, resCode} / onWingOff {cid}, onShowNewWingPro(state), updateCritItemNum {num1, num2}, showWingColorPanel(options),
// sureChangeWingColor(num, npcId), onSystemMidMsgOrNote (refusals), onSystemSay (fusion announcement), onAddCharactorSlot / onUPP.

import type { BagItem } from './inventory.js';

/** Facts of an inlaid feather (the client has no item tables): name, icon, colour, type and its stat lines. */
export interface WingFeatherInfo {
  name: string;
  iconCode: string;
  colour: number;
  type: number;
  lines: { prop: number; value: number }[];
}

/** Wing part of a BagItem (tooltip + panels): colour 0..4, level / exp, chosen look (-1 = automatic), dye per look, holes (see WingState), the hole code and the inlaid feathers by template id. */
export interface WingView {
  colour: number;
  level: number;
  exp: number;
  look: number;
  dye: number[];
  holes: number[];
  holeNum: number;
  feathers: Record<string, WingFeatherInfo>;
}

/** onWingOn / onWingOff. */
export interface WingOnPush {
  cid: number;
  resCode: string;
}
export interface WingOffPush {
  cid: number;
}

export interface WingJoinOk {
  f: true;
  i: number;
  n: BagItem;
  e: number;
  sid: number;
}
export interface WingFail {
  f: false;
}
export type WingJoinReply = WingJoinOk | WingFail;

export interface WingStarReply {
  equSlotId: number;
  itemSlotId: number;
  /** Stone units left. */
  num: number;
  upgradeNum: number;
  flag: boolean;
}

export type AddWingHoleReply = { f: true; i: number; h: number; ii: number; n: number } | WingFail;

export interface FeatherUpdateReply {
  slotId: number;
  num: number;
  lSid: number;
  lnum: number;
  flag: boolean;
  finalNum: number;
}

export interface FeatherMixReply {
  f: boolean;
  /** Formula id; -1 = wrong materials, -2 = luck error. */
  fid: number;
  fnum: number;
  i: Record<string, { id: number; num: number }>;
  lid: number;
  lnum: number;
}

/** Rolled wing lines (prefix preview). */
export interface WingPropLines {
  mainProp1: number;
  mainProp2: number;
  mainPropNum1: number;
  mainPropNum2: number;
  prop1: number;
  prop2: number;
  propNum1: number;
  propNum2: number;
  bindMainPropNum1: number;
  bindMainPropNum2: number;
}

export type ChangeWingPrefixReply = { f: true; sid: number; i: number; n: WingPropLines; ii: number; inum: number } | WingFail;
export type SureChangeWingPrefixReply = { f: 'sure'; i: number; n: BagItem; e: number } | { f: 'false' };
export type ChangeWingBindReply =
  | { f: true; ii: number; n: number; b1: number; b2: number; b11: number; b12: number; mainProp1: number; mainProp2: number }
  | WingFail;
export type SureChangeWingBindReply = { f: 'sure'; b1: number; b2: number } | { f: 'false' };

export interface ChangeWingResReply {
  flag: boolean;
  newResCode?: string;
}

/** showWingColorPanel options: the dye series and the art of its preview. */
export interface WingColorOption {
  color: number;
  res: string;
}

/** Pairs of the advance tab (keys of the four wing lines). */
export interface WingProKeys {
  mainPropNum1: number;
  mainPropNum2: number;
  propNum1: number;
  propNum2: number;
}

/** onShowNewWingPro state (tab "Thăng cấp"). `arr` = art of the three looks, `curRescode` the shown one, `eid` the worn wing id. */
export interface NewWingProState {
  num1: number;
  num2: number;
  level: number;
  curExp: number;
  nextExp: number;
  curAdd: WingProKeys;
  nextAdd: WingProKeys;
  basicPro: WingProKeys;
  arr: string[];
  curRescode: string;
  eid: number;
}

/** updateCritItemNum. */
export interface CritItemNum {
  num1: number;
  num2: number;
}

/** Strings (WING_PANEL_U verbatim where the Flash client has them) and H5 refusals. */
export const WING_TEXT = {
  JOIN_OK: 'Dung hợp thành công',
  JOIN_FAIL: 'Dung hợp thất bại!',
  COLOUR_MISMATCH: 'Màu sắc cánh không phù hợp!',
  SAME_KIND: 'Vui lòng đặt cánh cùng loại',
  HOLE_OK: 'Đục lỗ cánh thành công',
  HOLE_MAX: 'Số lỗ của cánh phẩm chất này đã đạt giới hạn',
  HOLE_ALL_OPEN: 'Cánh đã mở đủ 10 lỗ (5 cho nhân vật, 5 cho pet).',
  FEATHER_UP_OK: (n: number): string => `Thành công thăng cấp ${n} Lông Vũ!`,
  FEATHER_UP_FAIL: 'Thăng cấp lông vũ thất bại',
  INLAY_OK: (n: number): string => `Khảm nạm thành công ${n} Lông Vũ!`,
  REMOVE_CONFIRM: (silver: number, name: string): string => `Xác nhận mất ${silver} bạc để bỏ: ${name} (sau khi bỏ sẽ thành thuộc tính khóa)?`,
  PREFIX_OK: 'Tái thiết lập thuộc tính thành công',
  PREFIX_COLOUR: 'Chỉ có cánh tím và cam mới có thể tái thiết lập thuộc tính',
  BIND_OK: 'Đổi thuộc tính khóa thành công',
  NEED_BOUND: 'Cánh cần phải khóa',
  MAX_LEVEL: 'Đã là cấp cao nhất',
  LOOK_LEVEL: 'Cánh không đủ cấp đổi hình dạng',
  LOOK_COLOUR: 'Chỉ có cánh cam mới mới có thể đổi hình dạng!',
  DYE_CONFIRM: (num: number): string => `Nhuộm cánh cần ${num} Lông Vũ Ngũ Sắc, xác nhận tiếp tục?`,
  // H5 refusals
  NOT_WING: 'Không tìm thấy cánh.',
  NO_MATERIAL: 'Không đủ nguyên liệu.',
  NO_SILVER: 'Không đủ bạc!',
  NO_GOLD: 'Không đủ Vàng.',
  BAG_FULL: 'Túi đồ không đủ chỗ trống!',
  JOIN_INVALID: 'Cánh dung hợp không hợp lệ.',
  JOIN_LIGHT: 'Cánh Ánh Sáng chỉ dung hợp được cùng Ánh Sáng, Thiên Sứ, Ác Ma, Bích Không.',
  JOIN_MAX_COLOUR: 'Cánh cam không thể dung hợp thêm.',
  STAR_MAX: 'Cánh đã đạt 10 sao.',
  FEATHER_EMPTY: 'Vui lòng đặt Lông Vũ vào ô Cánh đã đục lỗ.',
  FEATHER_BAD: 'Vui lòng chọn Lông Vũ chính xác',
  FEATHER_NO_HOLE: 'Ô này chưa được đục lỗ, hãy Đục lỗ cánh trước khi khảm nạm.',
  FEATHER_OCCUPIED: 'Lông Vũ không thể khảm nạm lại',
  FEATHER_COLOUR: 'Không thể khảm nạm, phẩm chất lông vũ không thích hợp với cánh',
  FEATHER_CATEGORY: 'Thuộc tính Lông Vũ và Lông Vũ đã khảm nạm phục hồi',
  FEATHER_UP_MAX: 'Lông Vũ không thể thăng cấp',
  FEATHER_UP_COUNT: 'Cần ít nhất 5 Lông Vũ cùng loại để thăng cấp.',
  FEATHER_UP_LUCK: 'Số Lông Vũ Chúc Phúc không đủ.',
  FEATHER_DEL_BAG: 'Túi đồ đã đầy, không thể bỏ Lông Vũ.',
  ADVANCE_RULE: 'Cần trang bị cánh đã khóa từ phẩm chất tím trở lên.',
  NO_LOOK_ART: 'Hình dạng này chưa có tài nguyên.',
  NO_DYE_ART: 'Chưa có tài nguyên nhuộm cho cánh này.',
  DYE_RULE: 'Chỉ có cánh Thiên Sứ cam, cánh Bích Không cam, cánh Ác Ma cam mới có thể nhuộm',
  DYE_NO_ITEM: 'Không đủ Lông Vũ Ngũ Sắc, nhuộm cánh cần 10 Lông Vũ Ngũ Sắc.',
  FORGE_GATE: 'Cánh được nâng cấp tại bảng Cải tạo cánh (Sứ Giả Đôi Cánh).',
  FUSION_SAY: (name: string, wing: string): string => `Chúc mừng ${name} đã dung hợp thành công ${wing}`,
} as const;

/** Window tabs of the client wing panel (Cải tạo cánh). */
export const WING_TABS = ['Dung hợp', 'Thăng tinh', 'Đục lỗ', 'Lông vũ', 'Thiết lập', 'Thăng cấp'] as const;
