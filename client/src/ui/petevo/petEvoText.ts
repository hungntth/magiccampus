// Player-visible strings of the Tiến hóa window and the Sách Tiến Hóa book, from Flash Language.as PET_EVOLUTION_PANEL_U /
// PET_HANDBOOK_PANEL_U (index in the comments); long guides are shortened and stripped of font tags.

export const EVO_TEXT = {
  title: 'Tiến Hóa', // PET_EVOLUTION_PANEL_U[0]
  book: 'Sách Tiến Hóa', // PET_HANDBOOK_PANEL_U[0]
  noEvoPet: 'Không có pet tiến hóa hoặc đã tiến hóa\nHoàn thành Tiến Hóa, vào bảng [Vũ Hóa] để xem thêm', // [45]
  canEvolve: 'Pet có thể Tiến Hóa', // [42]
  before: 'Hình dạng trước', // [43]
  after: 'Hình dạng sau', // [44]
  aptGain: 'Tư Chất Gia Tăng', // [9]
  confirmEvolve: 'Xác nhận Tiến Hóa?', // [38]
  evolveOk: 'Tiến Hóa thành công!', // [32]
  unbound: 'Pet chưa khóa không thể Tiến Hóa, vui lòng chọn lại!', // [37]
  levelGate: 'Cấp độ không đủ, cần cấp 120 mới có thể tiến hóa pet', // HANDBOOK[112]
  npLabel: 'NLượng TNhiên: ', // [10]
  costLabel: 'Tiêu hao : ', // [11]
  protectPick: 'Chọn Sử dụng', // [12]
  once: 'Tăng 1 lần', // [14]
  ten: 'Tăng 10 lần', // [15]
  jump: 'Tăng 1 điểm', // [24]
  stop: 'Kết thúc Vũ Hóa', // [23]
  noNp: 'Không đủ Năng Lượng Tự Nhiên', // [16]
  confirmTen: 'Xác nhận Vũ Hóa liên tục 10 lần?', // [17]
  noCharm: 'Bùa Cầu Nguyện không đủ!', // [20]
  featherCap: 'Thần thú này đã Vũ Hóa đến cấp cao nhất!', // [21]
  featherFail: 'Vũ Hóa thất bại!', // [29]
  featherRealm: 'Vũ Hóa thành công, tăng 1 Cảnh Giới!', // [30]
  featherOk: 'Vũ Hóa thành công!', // [33]
  maxLevel: 'Đã đạt cấp cao nhất, không thể tăng tiếp', // [61]
  contractMax: 'Đã MAX', // [60]
  contractStones: 'Đá Khế Ước có：', // [49]
  contractNeed: 'Đá Khế Ước cần', // [53]
  autoBuy: 'Tự động mua Đá Khế Ước', // [54] (shortened)
  contractBuy: 'Trong quá trình thăng cấp nếu không đủ vật phẩm thì sẽ tự động trừ vàng, xác nhận tiếp tục?', // [65]
  contractTen: 'Thăng 10 lần', // [64]
  contractOne: 'Tăng', // [55]
  contractNow: 'Thuộc tính hiện tại', // [51]
  contractNext: 'Thuộc tính cấp kế', // [52]
  noPet: 'Chọn pet để xem thông tin.',
  needPetFirst: 'Vui lòng đặt pet vào trước!',
} as const;

export const tabLabels = ['Tiến hóa', 'Vũ hóa', 'Khế ước'] as const; // [47]

export const confirmGoldContract = (money: number): string => `Để tăng cần ${money} vàng, xác nhận tiếp tục?`; // [62]
export const confirmJump = (cost: number, realm: number, stage: number): string =>
  `Xác nhận tiêu phí ${cost} vàng để Vũ Hóa đến Cảnh Giới ${realm} cấp ${stage}?`; // [25]
export const featherUp = (realm: number, stage: number): string => `Vũ Hóa thành công, tăng đến Cảnh Giới ${realm} cấp ${stage}!`; // [18]
export const featherDown = (realm: number, stage: number): string => `Vũ Hóa thất bại, giảm xuống Cảnh Giới ${realm} cấp ${stage}`; // [19]
export const protectCost = (n: number): string => `Tiêu hao ${n} Bùa Cầu Nguyện để tránh giảm tư chất`; // [13]
export const confirmNp = (n: number): string => `Xác nhận Sử dụng ${n} Năng Lượng Tự Nhiên?`; // HANDBOOK[103]
export const confirmGoldActive = (n: number): string => `Xác nhận tiêu phí ${n} vàng kích hoạt nhanh?`; // HANDBOOK[100]

/** Language.PET_EVOLUTION_PANEL_U[39..41]: what a failed try does at a stage that is not a milestone. */
export const FEATHER_FALL_HINT: Readonly<Record<number, string>> = {
  1: 'Chưa tăng đến cấp 3, nếu thăng cấp thất bại, điểm sẽ trở về như cũ', 2: 'Chưa tăng đến cấp 3, nếu thăng cấp thất bại, điểm sẽ trở về như cũ',
  4: 'Chưa tăng đến cấp 6, nếu thăng cấp thất bại, điểm sẽ trở về như cũ', 5: 'Chưa tăng đến cấp 6, nếu thăng cấp thất bại, điểm sẽ trở về như cũ',
  7: 'Chưa tăng đến cấp 9, nếu thăng cấp thất bại, điểm sẽ trở về như cũ', 8: 'Chưa tăng đến cấp 9, nếu thăng cấp thất bại, điểm sẽ trở về như cũ',
};

export const GUIDES: readonly string[] = [
  'Pet muốn tiến hóa phải là thần thú đã khóa, đã kích hoạt trong Sách Tiến Hóa và nằm trong túi pet. Sau khi Tiến Hóa pet đổi hình dạng và tăng thuộc tính; không thể quay lại hình dạng cũ. Không thể dung hợp pet tiến hóa với pet chưa tiến hóa. Pet tiến hóa vẫn tẩy tủy được, tư chất tiến hóa phải tăng bằng Vũ Hóa.',
  'Vũ Hóa tăng tư chất tiến hóa, mỗi lần tốn Năng Lượng Tự Nhiên và có tỉ lệ thất bại. Có 3 Cảnh Giới, mỗi Cảnh Giới 9 cấp. Thành công +1 cấp; thất bại rớt về mốc 0 / 3 / 6, riêng mốc 9 không rớt. Hết 9 cấp sang Cảnh Giới kế, không bao giờ rớt Cảnh Giới. Bùa Cầu Nguyện giúp thất bại không bị rớt cấp (chỉ ở cấp không phải mốc). Giới hạn Lực và Xảo Vũ Hóa là 20.',
  'Pet tham chiến đã tiến hóa nhận thuộc tính Khế Ước (không hiệu lực trong đấu pet), Pet của Thợ Săn nhận nhiều hơn. Có 4 loại Khế Ước, tối đa cấp 50, tăng cấp tiêu hao Đá Khế Ước. Mỗi lần tăng nhận 20 điểm exp, có cơ hội nhận x2 và x3 exp.',
];

/** Language.PROP_NAME_U for the handbook bonus props. */
export const HANDBOOK_PROP_NAMES: Readonly<Record<number, string>> = {
  1: 'Hp', 4: 'Công vlý', 5: 'Công mpháp', 6: 'Phòng vlý', 7: 'Phòng mpháp', 10: 'Phản kích', 11: 'Tốc', 12: 'Liên kích', 13: 'Bạo',
  20: 'Kháng độc', 31: 'Kháng bạo', 32: 'Buff Ch.xác', 58: 'Kháng Debuff', 59: 'Miễn giảm vlý', 60: 'Miễn giảm mpháp',
};
