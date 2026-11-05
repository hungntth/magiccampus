// Pure Vô Danh Động (Không Gian Đa Chiều) rules (Go handlers/npc vo_danh_cave.go + dungeon_portals.go): NPC 1172 on Điêu Linh Thôn
// (map 55) takes a level 50 holder of Sách Không Gian Đa Chiều (2352, not consumed) to map 516, a level 95 holder to floor 2 (577);
// the crack NPC 2200 on 577 jumps back to 516 at level 50. Menu funcs, ids and the Go texts.

export const VO_DANH = {
  NPC: 1172,
  CRACK_NPC: 2200,
  MAP_1: 516,
  MAP_2: 577,
  MIN_LEVEL_1: 50,
  MIN_LEVEL_2: 95,
  BOOK: 2352,
  FUNC_ENTER: 'vo_danh_enter_',
  FUNC_FLOOR2: 'vo_danh_floor2_',
  FUNC_GUIDE: 'vo_danh_guide_',
  FUNC_CRACK: 'dg_portal_2200_0',
} as const;

export const VO_DANH_TEXT = {
  INTRO: 'Gần thôn có 1 hang động sâu không đáy, bên trong đầy quái vật bay kỳ dị. Mang theo Sách Không Gian Đa Chiều, lão sẽ đưa ngươi vào Vô Danh Động.',
  NO_BOOK: 'Ngươi cần mang theo Sách Không Gian Đa Chiều. Hãy đến gặp Reck - Cháu Trai Thôn Trưởng để nhận.',
  LEVEL: (lv: number): string => `Cần đạt cấp ${lv} mới có thể vào đây.`,
  CRACK_INFO: 'Vết nứt dẫn lên tầng 1 Không Gian Đa Chiều.',
  CRACK_LEVEL: 'Cần đạt cấp 50 mới có thể vào Không Gian Đa Chiều.',
  GUIDE: '<b>Vô Danh Động</b>\n\nYêu cầu cấp <font color="#FF9900">50</font> trở lên và mang theo <font color="#FF9900">Sách Không Gian Đa Chiều</font> (nhận từ nhiệm vụ của Reck - Cháu Trai Thôn Trưởng).\n\nQuái vật trong động đều bay lượn.\n\nĐánh bại quái vật có cơ hội nhận <font color="#F9F900">Thâm Lam Tinh</font> và <font color="#F9F900">Tinh Túy Linh Giáp</font>.',
} as const;

/** Entry check of the cave: the level first, then the carried book. Returns the refusal text or null. */
export function caveRefusal(level: number, minLevel: number, books: number): string | null {
  if (level < minLevel) return VO_DANH_TEXT.LEVEL(minLevel);
  if (books <= 0) return VO_DANH_TEXT.NO_BOOK;
  return null;
}
