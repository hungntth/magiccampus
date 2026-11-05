// Player-visible strings of the PPVE (Khong Gian Dieu Khac), arena (Dau pet) and line-up windows, from Flash Language.as
// PET_PVE_PANEL / PET_ARENA_U / PET_ARENA_RANK_U / AI_CONF_PANEL_U (index in the comments); long guides are stripped of font tags.

export const PPVE_TEXT = {
  title: 'Không Gian Điêu Khắc', // PET_PVE_PANEL[0]
  tabChallenge: 'Khiêu Chiến', // [1]
  tabCarve: 'Khắc Văn',
  challenge: 'Khiêu Chiến',
  setup: 'Cài Đặt', // [5]
  buy: 'Lượt mua', // [10]
  exchange: 'Đổi', // [4]
  exchangeGold: 'Đổi cao cấp', // [12]
  floor: (n: number): string => `Tầng ${n}`, // [14]
  freeTries: (n: number): string => `Chiến miễn phí: ${n}`, // [9]
  boughtTries: (n: number): string => `Lượt chiến mua: ${n}`, // [51]
  freeExchanges: (n: number): string => `Lượt đổi miễn phí: ${n}`, // [11]
  goldExchanges: (n: number): string => `Lượt đổi cao cấp: ${n}`, // [15]
  kp: (n: number): string => `Văn Chỉ: ${n}`, // [24]
  kpLeft: (n: number): string => `Văn Chỉ còn lại: ${n}`, // [26]
  reward: (n: number): string => `Thưởng tầng ${n}`, // [21]
  openFloor: (n: number): string => `Mở tầng ${n}`, // [25]
  master: (n: number): string => `Bậc ${n}`, // [28]
  maxed: 'Đã MAX', // [30]
  now: 'Hiện tại', // [18]
  next: 'Cấp sau', // [19]
  cost: 'Tiêu hao Văn Chỉ', // [20]
  confirmBuy: (n: number): string => `Xác nhận dùng ${n} vàng để mua thêm lượt chiến?`, // [31]
  confirmKp: 'Xác nhận dùng 25 vàng để đổi lấy 50 Văn Chỉ?', // [32]
  confirmCarve: 'Xác nhận thăng cấp Khắc Văn này?', // [23]
  needConfig: 'Hãy cài đặt pet thi đấu trước khi khiêu chiến tầng tiếp theo', // [33]
  saved: 'Cài đặt thành công', // [34]
  win: (n: number): string => `Khiêu chiến thành công! Lên tầng ${n}`, // [35]
  lose: 'Khiêu chiến thất bại.', // [36]
  draw: 'Khiêu chiến thất bại. Chưa hạ đối thủ trong 24 lượt', // [44]
  replay: '[Chiến trận]', // [37]
  loading: 'Đang khiêu chiến..........', // [48]
  autoWatch: 'Tự xem trận',
  rankNo: 'No', // [38]
  rankChar: 'Char', // [39]
  rankLevel: 'Lv', // [40]
  rankClass: 'Nghề', // [41]
  rankFloor: 'Tầng', // [42]
  myRank: (n: number | string): string => `XH: ${n}`, // [43]
  noRank: 'Mở', // [43] with -1
  logTitle: 'Nhật ký',
  rankTitle: 'Bảng xếp hạng',
  rules: [
    'Quy tắc:\n1. Sau khi cài đặt, pet chiến đấu có thể bắt đầu khiêu chiến. Khiêu chiến thành công sẽ mất lượt chiến, khiêu chiến thất bại có thể chiến lại.\n2. Chỉ xuất chiến 1 pet cùng loại.\n3. Mỗi ngày khiêu chiến miễn phí 3 lần. Mua thêm lượt lần đầu mất 10 vàng/lượt, lần 2 mất 20 vàng/lượt, lần 3 trở lên mất 50 vàng/lượt.\n4. Mỗi ngày đổi miễn phí 1 lần nhận thưởng số Văn Chỉ cao nhất tương ứng với số tầng vượt được ngày đó.\n5. Vượt 5 tầng có thể tăng thêm 1 lần đổi cao cấp mỗi ngày. Số tiền đổi mỗi lần là 25 vàng, nhận 50 Văn Chỉ', // [47]
    'Quy tắc:\n1. Thuộc tính Khắc Văn sẽ được cộng vào cho pet chiến đấu, hiệu quả trong đấu pet và khiêu chiến Không Gian Điêu Khắc\n2. Tiến độ Không Gian Khiêu Chiến dần tăng, Khắc Văn mở khóa dần nhiều', // [45]
  ],
  setupGuide: 'Hướng dẫn:\n1. Pet chiến đấu phải là pet khóa, lv pet không vượt quá 5 so với lv nhân vật\n2. Chọn pet trong danh sách pet đặt vào danh sách thi đấu pet. Tối đa được chọn 5 pet (chỉ được chọn 1 pet cùng loại).\n3. Mỗi pet đều có thể cài đặt thi đấu AI. Nếu không cài đặt thì thao tác mặc định là ngẫu nhiên.\n4. Thuộc tính của pet khi cài đặt không bao gồm các thuộc tính kỹ năng, tu luyện và các thể loại buff khác của nhân vật/pet. Chỉ sử dụng thuộc tính cơ bản của pet, hệ số trang bị pet và Khắc Văn', // [7]
  carveNode: (part: number, icon: number): string => `Ô ${part + 1} - Khắc Văn ${icon + 1}`,
  carveMaster: 'Th.tính Bậc Thầy Điêu Khắc', // [17]
  carveStats: 'Th.tính Khắc Văn', // [16]
  noData: 'Lỗi dữ liệu, vui lòng đóng và mở lại bảng chức năng', // [13]
} as const;

export const ARENA_TEXT = {
  title: 'Đấu pet', // PET_ARENA_U[0]
  register: 'Báo danh', // [1]
  edit: 'Sửa đổi thiết lập', // [41]
  rank: 'Bảng xếp hạng', // [2]
  lastRank: 'Xếp hạng tuần trước:', // [46]
  lastRankBtn: 'Xem Bảng xếp hạng tuần trước', // PET_ARENA_RANK_U[7]
  award: 'Nhận thưởng', // [16]
  turns: 'Số lần khiêu chiến:', // [4]
  more: 'Tăng thêm', // [6]
  cooldown: 'T.gian chờ k.chiến:', // [7]
  cancelWait: 'Hủy chờ', // [8]
  colRank: 'Hạng', // [9]
  colTeam: 'Tên đội', // [10]
  colOwner: 'Tên chủ nhân', // [11]
  colRate: 'Tỷ lệ thắng', // [13]
  colAction: 'Thao tác', // [14]
  fight: 'Khiêu chiến', // [15]
  myRank: (n: number): string => `Hạng h.tại của bạn:${n}`, // [17]
  notRegistered: 'Chưa báo danh', // [53]
  needRegister: 'Vui lòng đầu tiên hãy báo danh', // [40]
  points: 'Điểm hiện tại：', // [31]
  rating: 'Điểm xếp hạng:',
  combo: 'Thắng liên tục cao nhất tuần này:', // [45]
  report: 'Chiến báo:', // [55]
  logTitle: 'Nhật ký chiến đấu',
  replay: '[Chiến cuộc]',
  autoWatch: 'Tự xem trận',
  group: (rid: number): string => ['Nhóm A (35-74)', 'Nhóm B (75-94)', 'Nhóm C (95-114)', 'Nhóm D (115-134)', 'Nhóm E (135-154)', 'Nhóm F (155+)'][rid] ?? '',
  groupShort: ['Nhóm A', 'Nhóm B', 'Nhóm C', 'Nhóm D', 'Nhóm E', 'Nhóm F'],
  confirmTurn: (n: number): string => ` Bạn xác định tốn ${n} vàng để có thêm 1 lần khiêu chiến không?`, // [37]
  confirmCd: (n: number): string => `Bạn xác định tốn ${n} vàng để bỏ khiêu chiến không?`, // [36]
  win: (enemy: string, pnt: number): string => `Khiêu chiến ${enemy} thành công，nhận ${pnt} điểm`, // [18]
  lose: (enemy: string, pnt: number): string => `Khiêu chiến ${enemy} thất bại, nhận ${pnt} điểm`, // [27]
  guestWin: (enemy: string): string => `${enemy}khiêu chiến thành công`, // [32]
  guestLose: (enemy: string): string => `${enemy}khiêu chiến thất bại, bảo vệ thành công danh hiệu`, // [33]
  streakMsg: (name: string, n: number): string => `${name} tuần này đã có số lần thắng liên tục đến ${n} lần`, // [51]
  climbMsg: (name: string, n: number): string => `${name} trong 1 ngày đã liên tục tăng ${n} hạng`, // [54]
  rankTitle: 'Xếp hạng Pet', // PET_ARENA_RANK_U[0]
  rankLevel: 'Cấp độ', // [4]
  rankCombo: 'Liên trảm', // [5]
  rankPoints: 'Điểm',
  prevTitle: 'Bảng xếp hạng tuần trước', // [8]
  back: 'Quay lại',
  teamName: 'Tên đội',
  teamHint: '1-16 chữ cái, số hoặc khoảng trắng',
  setupTitle: 'Thiết lập đội thi đấu Pet',
  guide: 'Hướng dẫn:\n1. Đặt tên đội pet, không thể đổi cho đến mùa thi đấu tiếp theo.\n2. Pet xuất chiến phải khóa. Nhóm A tối đa 2 pet, nhóm B 3 pet, nhóm C 4 pet, nhóm D trở lên 5 pet (mỗi loại 1 pet).\n3. Mỗi pet có thể cài đặt AI thi đấu. Nếu không cài đặt thì thao tác mặc định là ngẫu nhiên.\n4. Mỗi ngày có 20 lượt khiêu chiến, mỗi lượt cách nhau 10 phút. Thắng đối thủ hạng cao hơn sẽ đổi chỗ hạng.', // [42]
  needName: 'Vui lòng nhập tên đội',
} as const;

export const LINEUP_TEXT = {
  seat: (pos: number): string => `Vị trí ${pos}`,
  empty: 'Trống',
  remove: 'Gỡ pet',
  noPets: 'Không có pet khóa phù hợp (cần pet đã khóa, mỗi loại 1 pet)',
  ai: 'AI pet',
  aiTitle: (name: string): string => `Thiết lập AI: ${name}`, // AI_CONF_PANEL_U[10]
  aiEmpty: 'Chưa thiết lập: pet tấn công thường, mục tiêu ngẫu nhiên.',
  round: (n: number): string => `Lượt ${n}`,
  attack: 'Tấn công thường',
  addRound: '+ Thêm lượt',
  clear: 'Xóa hết',
  stale: '(chưa học)',
  hint: 'Danh sách lặp lại khi trận dài hơn số lượt đã đặt. Chọn kỹ năng và mục tiêu cho từng lượt.', // AI_CONF_PANEL_U[21]
  save: 'Lưu', // AI_CONF_PANEL_U[9]
  cancel: 'Hủy',
  needPet: 'Hãy đặt ít nhất 1 pet',
} as const;
