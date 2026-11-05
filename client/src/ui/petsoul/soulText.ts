// Player-visible strings of the Mệnh Hồn window, from Flash Language.as PET_SOUL_S (indexes kept in comments).

export const SOUL_TEXT = {
  title: 'Mệnh Hồn',
  tabs: { overview: 'Tổng quan', prey: 'Xủ Quẻ', exchange: 'Đổi Mảnh Vỡ' },
  exp: 'Exp Mệnh Hồn:', // [11]
  chip: 'Mảnh Vỡ Mệnh Hồn:', // [12]
  point: 'Pha lê:', // [13]
  petList: 'Danh sách pet', // [23]
  ringTitle: 'Vòng Mệnh Hồn', // [26] "Tổng quan Mệnh Hồn"
  bagTitle: 'Túi Mệnh Hồn',
  tempTitle: 'Túi Xủ Quẻ',
  levelUp: 'Tăng', // [0]
  lock: 'Khóa', // [1]
  unlock: 'Mở khóa', // [5]
  pour: 'Truyền', // [3]
  dissolve: 'Giải', // [4]
  take: 'Nhận', // [6]
  move: 'Di chuyển',
  moveHint: 'Chọn ô đích (túi hoặc vòng) để đổi chỗ; chọn lại ô nguồn để hủy.',
  takeAll: 'Nhận nhanh', // [15]
  preyQuick: 'X.quẻ nhanh', // [16]
  dissolveQuick: 'Ph.giải nhanh', // [17]
  advanced: 'Xủ quẻ cao cấp', // [45]
  advancedHint: 'Cần {num} vàng để Xủ Quẻ Cao Cấp, nhận được 1 Mệnh Hồn phẩm chất cao cấp (Chức năng dành cho VIP, không tốn pha lê)', // [46]
  advancedConfirm: 'Xác nhận tốn 200 vàng Xủ quẻ cao cấp?', // [47]
  levelUpConfirm: 'Xác nhận thăng cấp {name}？', // [33]
  dissolveConfirm: 'Xác nhận phân giải {name}？', // [40]
  openBagConfirm: 'Mở ô trong Túi Xủ Quẻ cần 10 vàng, xác nhận mở?', // [21]
  openRingConfirm: 'Đục lỗ Mệnh hồn cần {num} exp mệnh hồn, xác nhận đục lỗ?', // [54]
  ringClosed: 'Pet cấp {level} trở lên mới mở', // [31]
  ringExtraClosed: 'Đục lỗ thêm (cần pet cấp 100)',
  bagClosed: 'Cần 10 vàng để mở', // [32]
  bagFull: 'Túi Mệnh Hồn đã đầy', // [7]
  noExp: 'Không đủ kinh nghiệm', // [37]
  noPoint: 'Không đủ pha lê, không thể xủ quẻ', // [9]
  noMoney: 'Không đủ tiền', // [25]
  noChip: 'Không đủ Mảnh Vỡ Mệnh Hồn', // [27]
  exchangeFull: 'Túi Mệnh Hồn đã đầy, không thể đổi', // [8]
  sameKind: 'Mệnh Hồn cùng loại không thể xuất hiện cùng lúc', // [38]
  needLevel80: 'Người chơi cấp 80 trở lên mới được Xủ Quẻ', // [36]
  needPoint: 'Cần {num} Pha Lê ', // [30]
  exchangeNeed: 'Đổi cần {num} Mảnh Vỡ Mệnh Hồn', // [28]
  exchange: 'Đổi', // [35]
  ringPet: 'Pet cấp 80 trở lên có thể sử dụng Mệnh hồn', // [55]
  locked: 'Mệnh Hồn đã khóa thì sẽ không bị phân giải', // [43]
  detail: 'Mô tả chi tiết', // [34]
  pickGem: 'Nhấp chọn Mệnh Hồn để xem chi tiết và thao tác', // [29] adapted
  rulesTitle: 'Quy tắc', // [49]
  rules: '1. Người chơi cấp 80 sẽ được Xủ Quẻ;\n'
    + '2. Nhấp vào quả cầu thủy tinh để Xủ Quẻ, ngoài nhận được Mệnh Hồn còn có cơ hội nhận được Quả Cầu Pha Lê phẩm chất cao hơn;\n'
    + '3. Mệnh Hồn có 5 loại phẩm chất Trắng, Lục, Lam, Tím, Cam. Phẩm chất càng cao thì sức mạnh càng lớn.\n'
    + '4. Phẩm chất Quả Cầu Pha Lê càng cao thì tỉ lệ nhận Mệnh Hồn Cao Cấp càng cao;\n'
    + '5. Nhấp chọn【Nhận】 để bỏ Mệnh Hồn vào túi;\n'
    + '6. Nhấp chọn【Giải】để phân giải Mệnh hồn nhận kinh nghiệm, nếu phân giải Mệnh Hồn Tím và Cam còn nhận được Mảnh Vỡ Mệnh Hồn;\n'
    + '7. Nhấp chọn【Đổi Mảnh Vỡ】để đổi Mệnh Hồn.', // [48]
  quickHint: 'Chỉ có VIP mới được sử dụng chức năng【Nhanh】', // [44]
  gotSoul: 'Nhận 1 Mệnh Hồn:{soul}', // [53]
} as const;

export const SOUL_CRYSTAL_NAMES: readonly string[] = ['Pha Lê Trắng', 'Pha Lê Lục', 'Pha Lê Lam', 'Pha Lê Tím', 'Pha Lê Cam'];
