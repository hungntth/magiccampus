// Vietnamese strings of the Ấn Chương window (legacy Language.MEDAL_P, only the entries this window uses; index = Flash index).

export const MEDAL_P: Readonly<Record<number, string>> = {
  0: 'Ấn Chương', 2: 'Thăng cấp', 3: 'Phân Giải', 6: 'Cần thăng cấp', 7: 'Exp hiện tại', 12: 'Ph.Giải Nhiều', 15: 'Thuộc tính Khắc Ấn',
  16: 'Cuồng Chiến Sĩ', 17: 'Thánh Kỵ Sĩ', 18: 'Ma Đạo Sĩ', 19: 'Đại Tế tự', 20: 'Ẩn giả', 21: 'Thuộc tính', 22: 'Thuộc tính sau',
  23: 'Vị trí trang bị:', 24: 'Đối tượng dùng:', 25: 'Pet', 26: 'Nhân vật', 27: 'Cấp độ cần:', 28: 'Cấp độ cần thăng cấp: đã đủ',
  29: 'Cấp độ cần thăng cấp:', 39: 'Cách chơi', 40: 'Khắc Ấn', 51: 'Thuộc tính sau:', 52: 'Đã là Ấn Chương cấp cao nhất!',
  56: 'Nhận:    {num} Exp Ấn Chương', 58: 'Xác nhận xóa Ấn Chương phẩm chất này?',
  46: 'Cách chơi:\n1.Người chơi có thể tham gia các sự kiện , phụ bản hoặc đạt thành tựu để nhận Ấn Chương;\n2.Có 5 loại Ấn Chương cho nhân vật và 5 loại cho pet. Mỗi loại Ấn Chương giúp tăng thuộc tính;\n3.Khi người chơi tổ hợp đủ 5 Ấn Chương khác loại sẽ kích hoạt được Dòng Khắc Ấn tăng thêm thuộc tính;\n4.Mỗi loại Ấn Chương có thể thăng cấp (tối đa 10 cấp, tiêu hao Exp Ấn Chương) hoặc phân giải để nhận Exp Ấn Chương;\n5.Người chơi có thể tự động sắp xếp Túi Ấn Chương.',
};

/** H5-only labels (not in Language.as). */
export const MEDAL_UI = {
  TABS: ['Ấn Chương', 'Cách chơi'],
  EQUIP: 'Trang bị',
  UNEQUIP: 'Tháo',
  ARRANGE: 'Sắp xếp',
  EXP: 'Exp Ấn Chương',
  QUALITY: 'Phẩm chất:',
  LEVEL: 'Cấp',
  EMPTY: 'Trống',
  LINE: 'Dòng khắc ấn',
  PICK: 'Chọn một Ấn Chương trong túi hoặc trên người.',
  COUNT: 'Số lượng:',
} as const;
