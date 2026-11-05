// Pure Ảo Ma Tháp rules on the stored progress (Go application/hmtxl tower.go): enter (level 60, floor = best + 1), begin a floor
// fight, record a win, advance, leave and the weekly reset checks. Each function edits the document in place and returns null /
// the value when it applied, or the refusal text (Go texts from handlers/hmtxl tower.go).

import { HMT_TOWER, hmtNextFloor } from '@mc/shared';
import type { HmtxlDoc, TowerDoc } from './training-doc';

export const TOWER_TEXT = {
  KEEPER: 'Ảo Ma Tháp dẫn đến ma giới, kẻ có năng lực có thể đến đây tu luyện. Cấp 60 trở lên có thể vào Tháp khiêu chiến.\nMỗi tuần có 1 lượt dùng 999 vàng tái thiết lập tiến độ khiêu chiến ở tầng 1 (cần nhận thưởng và thoát phòng tu luyện). 0 giờ thứ 2 hàng tuần sẽ bắt đầu lại tuần mới',
  PORTER: (floor: number): string => `Theo lệnh của Ma Vương, ta phụ trách dịch chuyển trong Ảo Ma Tháp, chỉ có người đánh bại Ma Ảnh ở tầng này mới có thể lên tầng cao hơn\nTầng hiện tại: ${floor}`,
  GUARDIAN: 'Ta phụng lệnh Ma Vương canh giữ tầng này, nhận lời khiêu chiến của ngươi',
  LEVEL: 'Cấp 60 trở lên mới có thể vào Ảo Ma Tháp khiêu chiến.',
  ENTERED: (floor: number, name: string): string => `Đã vào Ảo Ma Tháp tầng ${floor}. Hãy nói chuyện với Dịch Chuyển Ảo Ma Tháp để khiêu chiến ${name}.`,
  UP: (floor: number, name: string): string => `Đã lên Ảo Ma Tháp tầng ${floor}. Ma Ảnh canh giữ: ${name}.`,
  NOT_IN_TOWER: 'Hãy vào Ảo Ma Tháp qua Thủ Vệ Ảo Ma Tháp ở Bàng Bối Thành.',
  NOT_CLEARED: (floor: number): string => `Khiêu chiến cần có trình tự, bạn chưa khiêu chiến ở tầng ${floor}, không thể chuyển`,
  CLEARED: (floor: number): string => `Đã đánh bại Ma Ảnh tầng ${floor}, hãy lên tầng tiếp theo.`,
  TOP: 'Đã chinh phục tầng cao nhất của Ảo Ma Tháp (400).',
  FLOOR_WIN: (name: string, floor: number, best: number): string => `Đánh bại ${name}, vượt qua Ảo Ma Tháp tầng ${floor}! Phòng tu luyện tính theo tầng ${best}.`,
  FIGHT_FAILED: 'Không thể bắt đầu trận chiến, vui lòng thử lại sau.',
  IN_BATTLE: 'Bạn đang trong trận chiến.',
  INFO: (best: number, floor: number): string => `Số tầng đã khiêu chiến: ${best}\nTầng hiện tại: ${floor}`,
  RESET_DONE: 'Đã tái thiết lập tiến độ Ảo Ma Tháp, bắt đầu lại từ tầng 1.',
  RESET_USED: 'Một tuần chỉ thiết lập lại Ảo Ma Tháp 1 lần.',
  RESET_GOLD: 'Không đủ 999 vàng.',
  RESET_ACTIVE: 'Cần rời Phòng Tu Luyện và nhận thưởng trước khi tái thiết lập tiến độ Ảo Ma Tháp.',
  BUSY: 'Hệ thống bận, vui lòng thử lại sau.',
  GUIDE: [
    '1.Có thể khiêu chiến Ảo Ma Tháp không giới hạn. Số tầng càng cao (giới hạn 400 tầng) thì phần thưởng tu luyện càng nhiều. Khi hoàn thành tầng nào thì vĩnh viễn sẽ được ghi nhận tu luyện ở tầng đó, không cần khiêu chiến lại；',
    '2.Tu luyện chắc chắn sẽ nhận được exp và có cơ hội nhận Tinh Hoa Hắc Diệu Thạch, Ấn Chương Ảo Ma. Nhân vật có thú cưỡi tiến hóa đến cấp 8 còn được nhận Dược Thủy Tiến Hóa Cao Cấp；',
    '3.Sau khi tu luyện 10 phút sẽ có được 1 phần thưởng, tu luyện quá lâu sẽ không nhận được phần thưởng mà phải thoát ra vào lại；',
    '4.Phòng tu luyện cao cấp chỉ chứa được 5 người, mỗi ngày mỗi người tu luyện 1 lần, mỗi lần tiêu hao 1 lượng chiến tích, tối đa tu luyện 6 tiếng 1 lần, nhưng sau 120 phút tu luyện sẽ bị người khác vào cướp phòng；',
    '5.Phòng tu luyện công cộng không giới hạn số người vào, số lần tu luyện, tối đa tu luyện 9 tiếng 1 lần, phần thưởng tương đối thấp hơn phòng tu luyện cao cấp；',
    '6.Từ 3h - 8h mỗi ngày là thời gian quét dọn phòng tu luyện, người chơi không thể vào；',
    '7.Ở phòng tu luyện cần có đội pet thi đấu để giúp chủ nhân canh chừng.',
    '8.Mỗi tuần có 1 lượt dùng 999 vàng để tái thiết lập tiến độ khiêu chiến từ tầng 1 (cần rời Phòng Tu Luyện và nhận thưởng trước). 0 giờ thứ 2 hàng tuần bắt đầu tuần mới',
  ].join('\n'),
} as const;

/** The floor being challenged is already beaten (floor <= best). */
export const towerCleared = (t: TowerDoc): boolean => t.f > 0 && t.f <= t.b;

/** EnterTower: level 60, the floor becomes best + 1 (400 once everything is cleared). */
export function enterTower(t: TowerDoc, level: number): string | null {
  if (level < HMT_TOWER.MIN_LEVEL) return TOWER_TEXT.LEVEL;
  t.f = hmtNextFloor(t.b);
  return null;
}

/** BeginFloorFight: the floor to fight, or the refusal text. */
export function beginFloorFight(t: TowerDoc): number | string {
  if (t.f <= 0) return TOWER_TEXT.NOT_IN_TOWER;
  if (towerCleared(t)) return TOWER_TEXT.CLEARED(t.f);
  return t.f;
}

/** RecordFloorWin: only the floor being challenged and above the best counts. True when the best rose. */
export function recordFloorWin(t: TowerDoc, floor: number): boolean {
  if (floor <= 0 || floor !== t.f || floor <= t.b) return false;
  t.b = floor;
  return true;
}

/** AdvanceFloor: the next floor needs the current one cleared. */
export function advanceFloor(t: TowerDoc): string | null {
  if (t.f <= 0) return TOWER_TEXT.NOT_IN_TOWER;
  if (!towerCleared(t)) return TOWER_TEXT.NOT_CLEARED(t.f);
  if (t.f >= HMT_TOWER.FLOORS) return TOWER_TEXT.TOP;
  t.f += 1;
  return null;
}

/** Weekly reset checks before the gold is taken: once per week, no training running, no reward waiting. */
export function resetBlocker(t: TowerDoc, room: HmtxlDoc, week: string): string | null {
  if (t.w === week) return TOWER_TEXT.RESET_USED;
  if (room.st > 0 || room.u > 0) return TOWER_TEXT.RESET_ACTIVE;
  return null;
}

/** Applies the reset: progress back to floor 1 (best 0, outside), the week stamped. */
export function applyReset(t: TowerDoc, week: string): void {
  t.b = 0;
  t.f = 0;
  t.w = week;
}
