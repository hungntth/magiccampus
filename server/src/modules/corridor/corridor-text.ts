// Hành Lang Vô Tận NPC texts (Go handlers/corridor helpers.go + application/corridor rewards.go): menu intros, alerts and refusals.

export const CORRIDOR_TEXT = {
  GATE: `Chú ý:
1. Mỗi người đều có lịch sử vượt ải các tầng.
2. Cả nhóm sẽ dựa vào số tầng thấp nhất của thành viên vượt được.
3. Trong Hành Lang Vô Tận có thể tùy ý lập nhóm và khiêu chiến Boss chuyển dịch đến tầng kế tiếp, dựa vào tầng thấp nhất của thành viên trong nhóm đã vượt.
4. Lần đầu vượt qua mỗi tầng sẽ nhận được phần thưởng, mỗi ngày nhận 1 lần.`,
  BOSS: 'Chú ý: đừng tin vào mắt mình\nTrong nhóm, quái giao chiến được\nquyết định bởi số tầng thấp nhất của\nthành viên vượt được! Trước khi giao\nchiến có thể xem thông tin BOSS ở mỗi tầng',
  PORTAL: 'Nơi này không có điểm cuối cùng, lẽ nào chúng ta không thể thoát được sao? Đây nhất định là biểu tượng mà chưa ai tìm thấy...',
  EXIT: 'Không có manh mối, về Đông Huyền Thành tìm đội trưởng thương lượng',
  MAX_POSSIBLE: (n: number) => `Tiến độ nhóm khiêu chiến: Tầng ${n}`,
  MAX_CLEARED: (n: number) => `Tiến độ khiêu chiến : Tầng ${n}`,
  BOSS_INFO: (floor: number, name: string, level: number, hp: number) => `Tầng Boss nhóm khiêu chiến: Tầng ${floor}\nBOSS: ${name} (cấp ${level}, HP ${hp})`,
  ENTERED: (floor: number, name: string) => `Đã đến Hành Lang Vô Tận tầng ${floor}. BOSS canh giữ: ${name}.`,
  LOCKED: (floor: number) => `Cần vượt qua tầng ${floor - 1} trước mới có thể đến tầng ${floor}.`,
  NOT_CLEARED: (floor: number) => `Hãy đánh bại BOSS tầng ${floor} trước khi đến tầng kế tiếp.`,
  BEAT_ME_FIRST: 'Muốn đi tiếp thì phải đánh bại ta trước!',
  TOP: 'Đã đến tầng cao nhất của Hành Lang Vô Tận.',
  NOT_IN_CORRIDOR: 'Hãy vào Hành Lang Vô Tận qua Cổng Dịch Chuyển ở Quyến Cố Thành.',
  EXPLORE: 'Cứ thám hiểm tầng này đi, khi nào sẵn sàng thì quay lại tìm ta.',
  CLAIMED: 'Hôm nay bạn đã nhận thưởng',
  NOTHING: 'Bạn chưa vượt qua tầng nào của Hành Lang Vô Tận. Hãy đánh bại BOSS tầng 1 trước.',
  CLAIM_OK: (floor: number, points: number) => `Đã nhận thưởng hằng ngày theo tiến độ tầng ${floor}: ${points} điểm Dũng Khí.`,
  IN_BATTLE: 'Bạn vẫn còn trong một trận đấu chưa kết thúc. Vui lòng chờ giây lát rồi thử lại.',
  FIGHT_FAILED: 'Không thể bắt đầu trận chiến, vui lòng thử lại sau.',
  ERROR: 'Có lỗi xảy ra, vui lòng thử lại sau.',
  BAG_FULL: 'Túi đồ đã đầy, không nhận được túi quà lần đầu vượt tầng.',
  VICTORY: (name: string, floor: number) => `Đánh bại ${name}, vượt qua Hành Lang Vô Tận tầng ${floor}! Hãy qua cổng dịch chuyển để đến tầng ${floor + 1}.`,
  VICTORY_TOP: (name: string, floor: number) => `Đánh bại ${name}, đã chinh phục tầng cao nhất của Hành Lang Vô Tận (tầng ${floor})!`,
  FIRST_KILL_BAG: ' Lần đầu vượt qua tầng này, nhận được túi quà.',
  ONE_FLOOR_LEFT: 'Vẫn còn 1 tầng nữa đấy',
} as const;
