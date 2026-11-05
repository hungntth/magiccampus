// "Hệ thống" panel keys (legacy UserSystemSetPanel, M9 phase G): the us(map) whitelist with the login defaults of
// settings.go:17-57, value validation, the H5 refusal texts of the enforced gates (ag / achat / at) and the panel strings.

export type SystemSettingKey = 'am' | 'battleStExpan' | 'hc' | 'hn' | 'ag' | 'ac' | 'achat' | 'at' | 'he' | 'hm'
  | 'dressHide' | 'cf' | 'sjan' | 'bfr' | 'flyEffect' | 'hpmf' | 'nlws' | 'maxView' | 'wingHide' | 'c0' | 'c1' | 'c2' | 'c3';

export const MAX_VIEW_MIN = 1;
export const MAX_VIEW_MAX = 200;

/** Login defaults; keys Go never seeds default to "on" for the permission gates and "off" for the rest. */
export const SYSTEM_SETTING_DEFAULTS: Readonly<Record<SystemSettingKey, number | boolean>> = {
  am: 1, battleStExpan: false, hc: false, hn: false, ag: true, ac: 1, achat: true, at: true, he: 0, hm: 0,
  dressHide: 0, cf: false, sjan: false, bfr: false, flyEffect: true, hpmf: true, nlws: true, maxView: 100, wingHide: 0,
  c0: 1, c1: 0, c2: 0, c3: 0,
};

export function isSystemSettingKey(k: string): k is SystemSettingKey {
  return Object.prototype.hasOwnProperty.call(SYSTEM_SETTING_DEFAULTS, k);
}

/** maxView: integer 1..200; every other key: a boolean or 0 / 1 (kept as sent). null = bad value. */
export function validSystemSetting(k: SystemSettingKey, v: unknown): number | boolean | null {
  if (k === 'maxView') {
    const n = Number(v);
    return typeof v !== 'boolean' && Number.isInteger(n) && n >= MAX_VIEW_MIN && n <= MAX_VIEW_MAX ? n : null;
  }
  if (typeof v === 'boolean') return v;
  return v === 0 || v === 1 ? v : null;
}

/** Truthy setting with its default when unset (`0`, `false` = off). */
export function settingOn(data: Readonly<Record<string, number | boolean | undefined>> | undefined, k: SystemSettingKey): boolean {
  const v = data?.[k] ?? SYSTEM_SETTING_DEFAULTS[k];
  return v === true || (typeof v === 'number' && v !== 0);
}

/** Server-enforced permissions (H5 decision 13; Go stored them only). */
export type PermissionKey = 'ag' | 'achat' | 'at';
export const PERMISSION_TEXT: Readonly<Record<PermissionKey, (name: string) => string>> = {
  ag: (name) => `${name} không nhận lời mời nhóm.`,
  achat: (name) => `${name} không nhận tin nhắn riêng.`,
  at: (name) => `${name} không nhận giao dịch.`,
};

/** Checkbox rows of the panel (USERSYSTEMSETPANEL_S order); `bfr` has no label in Flash and is not shown. */
export const SYSTEM_SETTING_ROWS: readonly (readonly [SystemSettingKey, string])[] = [
  ['am', 'Mở nhạc'], ['battleStExpan', 'Triển khai nhanh trong chiến đấu'], ['hc', 'Ẩn nhân vật'], ['hn', 'Ẩn tên'],
  ['ag', 'Cho phép mời nhóm'], ['ac', 'Nhân vật ở giữa'], ['achat', 'Cho phép chat riêng'], ['at', 'Cho phép giao dịch'],
  ['he', 'Đóng hiệu ứng'], ['hm', 'Đóng mẫu'], ['dressHide', 'Ẩn thời trang'], ['flyEffect', 'Hiệu ứng bay'],
  ['hpmf', 'Ẩn danh hiệu VIP'],
];

export const SYSTEM_TEXT = {
  TITLE: 'Hệ thống',
  TRAY_TIP: 'Thiết lập hệ thống (Phím tắt: P)',
  MAX_VIEW: 'Số người chơi hiển thị tối đa: ',
  SPEED: 'Tốc độ game',
  SPEED_TIP: 'Sau khi chọn game sẽ chạy mượt hơn, tuy nhiên hiệu ứng đồ họa sẽ kém đi.',
  QUALITY: 'Chất lượng ảnh: ',
  RESET_CONFIRM: 'Thao tác này sẽ tái thiết lập tất cả, xác nhận tái thiết lập?',
  UNSTUCK_CONFIRM: 'Chức năng này sau 20 giây sẽ chuyển bạn đến vị trí có thể di chuyển trên bản đồ, xác nhận tự cứu?',
  UNSTUCK_WAIT: 'Sau 20 giây sẽ chuyển bạn đến vị trí có thể di chuyển, vui lòng chờ',
  IN_BATTLE: 'Không thể thực hiện thao tác này khi đang chiến đấu.',
} as const;

/** Client wait before toMovable and the server's per-character limit (to_movable.go). */
export const UNSTUCK_WAIT_MS = 20_000;
export const UNSTUCK_LIMIT_MS = 18_100;

/** Chat emotions (EmotionCanvas panel order) and their resource codes (GamePredef.EMOTION_CODE). */
export const EMOTION_CODES: readonly string[] = [
  '/no', '/yes', '/pig', '/heart', '/icy', '/shit', '/laugh', '/depress', '/daze', '/face', '/shy', '/distress',
  '/devil', '/excite', '/anger', '/tear', '/sigh', '/smile', '/shock', '/cry', '/mess', '/bnhh', '/xfmm',
];

/** The emotion code of a chat text that is exactly one code (trimmed), else null. */
export function emotionOf(text: string): string | null {
  const t = text.trim();
  return EMOTION_CODES.includes(t) ? t : null;
}

/** GamePredef.EMOTION_CODE: emotion code -> resource code (decodes to emotion/EM_NORMAL_0000NN.swf). */
export const EMOTION_RES: Readonly<Record<string, string>> = Object.fromEntries([
  '/no', '/pig', '/yes', '/heart', '/icy', '/shit', '/laugh', '/devil', '/daze', '/face', '/shy', '/tear', '/distress',
  '/excite', '/anger', '/depress', '/sigh', '/smile', '/shock', '/cry', '/mess', '/bnhh', '/xfmm',
].map((code, i) => [code, String(2110200000001 + i)]));
