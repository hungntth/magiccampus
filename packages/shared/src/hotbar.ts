// Skill / item hotbar (legacy UserBarCanvas, M9 phase C): 30 slots s1..s30 in 3 bars of 10, each stored as two interfaceData keys
// st<n> (52 skill, 29 item template, 0 empty) and sid<n> (skill id / item template id); `au` = bar visible, `ubl` = locked.

export const HOTBAR_SLOTS = 30;
export const HOTBAR_PAGE = 10;
export const HotbarKind = { NONE: 0, ITEM: 29, SKILL: 52 } as const;

export interface HotbarSlot { st: number; sid: number }

/** USERBARCANVAS_S strings. */
export const HOTBAR_TEXT = {
  TOGGLE: 'Mở/Ẩn thanh kỹ năng \rKhi chiến đấu nhấp đơn để dùng\r Khi không chiến đấu nhấp đôi để dùng',
  PET_MISSING: 'Pet chưa lâm trận không thể dùng kỹ năng này',
  EMPTY: 'Khi chiến đấu nhấn chuột để sử dụng nhanh\r Trên bản đồ nhấn đôi chuột để sử dụng nhanh',
  NO_ITEM: 'Không có vật phẩm này',
  LOCK: 'Nút khóa phím tắt',
} as const;

/** Login defaults (interface_settings.go:391-420). */
export function hotbarDefaults(): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = { au: 0, ubl: false };
  for (let n = 1; n <= HOTBAR_SLOTS; n++) {
    out[`st${n}`] = 0;
    out[`sid${n}`] = 0;
  }
  return out;
}

/** Index 0 = s1. */
export function hotbarFromSettings(s: Readonly<Record<string, number | boolean | undefined>>): HotbarSlot[] {
  const out: HotbarSlot[] = [];
  for (let n = 1; n <= HOTBAR_SLOTS; n++) {
    const st = Number(s[`st${n}`] ?? 0);
    const sid = Number(s[`sid${n}`] ?? 0);
    out.push(sid > 0 && (st === HotbarKind.ITEM || st === HotbarKind.SKILL) ? { st, sid } : { st: HotbarKind.NONE, sid: 0 });
  }
  return out;
}

const SLOT_KEY = /^(st|sid)([1-9]|[12][0-9]|30)$/;

/** st1..30 / sid1..30 / au / ubl. */
export function isHotbarKey(key: string): boolean {
  return key === 'au' || key === 'ubl' || SLOT_KEY.test(key);
}

/** Value check for a hotbar key: st ∈ {0, 29, 52}, sid integer >= 0, au 0|1, ubl boolean. Null = invalid. */
export function validHotbarValue(key: string, v: unknown): number | boolean | null {
  if (key === 'ubl') return typeof v === 'boolean' ? v : v === 0 || v === 1 ? v === 1 : null;
  const n = typeof v === 'boolean' ? Number(v) : Number(v);
  if (!Number.isInteger(n)) return null;
  if (key === 'au') return n === 0 || n === 1 ? n : null;
  const m = SLOT_KEY.exec(key);
  if (!m) return null;
  if (m[1] === 'st') return n === HotbarKind.NONE || n === HotbarKind.ITEM || n === HotbarKind.SKILL ? n : null;
  return n >= 0 ? n : null;
}

/** Slot argument of skillSetUserBar: a numeric string (or number) 1..30, else null. */
export function parseHotbarSlot(raw: unknown): number | null {
  const n = Number(raw);
  return (typeof raw === 'string' || typeof raw === 'number') && Number.isInteger(n) && n >= 1 && n <= HOTBAR_SLOTS ? n : null;
}

/**
 * useSlotByNum: key 1..9,0 (`n` 1..10) -> slot 1..30. In battle with `battleStExpan` the keys always hit bar 1;
 * otherwise the current page (1..3).
 */
export function slotForKey(n: number, page: number, battleExpanded: boolean, inBattle: boolean): number {
  if (inBattle && battleExpanded) return n;
  return n + page * HOTBAR_PAGE - HOTBAR_PAGE;
}
