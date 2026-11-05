// Player-visible strings of the Luyện pet window, taken from Flash Language.as PETFUNCPANEL_S (index in the comments); the
// long guide texts are shortened and stripped of their font tags.

export const FUNC_TEXT = {
  starMax: (n: number): string => `Số sao hiện tại: ${n}, đã đạt số sao tối đa!`, // [0]
  starRate: (n: number, per: number): string => `Số sao hiện tại: ${n}, xác suất thành công: ${per}%`, // [2]
  starOk: (n: number): string => `Thăng cấp thành công lên ${n} sao!`, // [4]
  starFail: 'Cường hóa thất bại!', // [6]
  starConfirm: 'Khi số sao của pet >=8, nếu không dùng Nội Đơn Chúc Phúc, sau khi cường hóa thất bại thì số sao sẽ trở về 0, tiếp tục thao tác?', // [55]
  joinRate: 'Xác suất thành công: ', // [8]
  joinOk: 'Dung hợp thành công!', // [13]
  joinFail: 'Dung hợp thất bại!', // [14]
  joinLimit: 'Dung hợp đã đến giới hạn, không thể dung hợp!', // [7]
  needMain: 'Vui lòng đặt pet chính vào trước!', // [10]
  needSame: 'Vui lòng đặt vào pet cùng loại!', // [12]
  bound: 'Bạn đã đặt vào pet đã khóa, pet sau khi dung hợp cũng sẽ khóa!', // [40]
  needPetItem: 'Vui lòng đặt pet và vật phẩm chính xác!', // [24]
  refineResult: 'Kết quả Tẩy Tủy Pet:', // [52]
  rebirthResult: 'Kết quả Trùng Sinh Pet:', // [53]
  growNow: (g: number): string => `Hệ số phẩm chất hiện tại của pet: ${g}`, // [43]
  pointOk: 'Tẩy điểm thành công.', // [37]
  pointDivine: 'Pet tẩy điểm phải là thần thú', // [35]
  eatResult: 'Kết quả Ảo Hóa:', // [60]
  apply: 'Ứng dụng', // [65]
  skip: 'Bỏ qua', // [66]
  pickElement: 'Chọn Nguyên Tố cần đổi', // [59]
} as const;

export const GUIDE: Readonly<Record<string, string>> = {
  star: 'Cường hóa pet làm tăng hệ số phẩm chất, cần Nội Đơn (các loại khác nhau tăng khác nhau). Tối đa 12 sao. Thất bại ở ≤ 7 sao: giữ sao, mất nội đơn. Từ 8 sao: về 0 sao, trừ khi đặt Nội Đơn Chúc Phúc ở ô an toàn. Nội đơn khóa chỉ dùng cho pet đã khóa. Nội Đơn Phụng Hoàng xóa toàn bộ sao.',
  join: 'Pet cùng loại, cùng màu có thể dung hợp để tăng hệ số phẩm chất. Cần 1 pet chính và 4 pet phụ (cùng loại, cùng màu, đã gỡ trang bị). Thất bại: pet chính giữ nguyên, pet phụ mất. Có khóa thì pet kết quả cũng khóa. Dung hợp cao cấp: 4-10 (lam) hoặc 4-16 (tím) pet phụ, cần Nội Đơn Tinh Linh, tỉ lệ tăng theo số pet phụ.',
  refine: 'Tẩy tủy thay đổi ngẫu nhiên tư chất cơ bản của pet (pet phải đã khóa), cần Tẩy Tủy Đan đúng loại tư chất. Tỉ lệ 100%, kết quả thấp hơn thì giữ nguyên. Tẩy Tủy Đan cao cấp chỉ tăng, không giảm.',
  rebirth: 'Phục sinh thay đổi hệ số phẩm chất trong phạm vi màu hiện tại (lục tối đa 1.3, lam 1.6, tím 2.0, cam 2.5), cần Phẩm Chất Hồi Đơn và pet đã khóa từ màu lục. Kết quả thấp hơn thì giữ nguyên.',
  point: 'Pet tẩy điểm phải là thần thú đã khóa. Quy Nguyên Đơn đưa toàn bộ điểm đã cộng về trạng thái chưa cộng; cấp độ, kỹ năng, tư chất và phẩm chất không đổi.',
  skill: 'Thăng cấp nhanh kỹ năng pet bằng Sách Thăng Cấp Kỹ Năng theo phẩm chất pet: cấp 1 → 2 cần 1 quyển, cấp 2 → 3 cần 3 quyển. Kỹ năng tối đa cấp 3.',
  eat: 'Ảo hóa: pet phụ biến mất để pet chính tăng 1 tư chất. Cả hai pet phải từ tím trở lên, pet chính đã khóa. Tỉ lệ cơ bản: tím thường 10%, cam thường 15%, tím thần thú 15%, cam thần thú 30%; cùng hệ +20%, khác hệ giảm một nửa. Mỗi Đá May Mắn +20% (tối đa 5). Chỉ lưu tư chất của lần ảo hóa cuối cùng.',
  element: 'Tốn một lượng bạc nhất định để đổi Nguyên Tố của pet. Có thể tự chọn loại nguyên tố, không ảnh hưởng thuộc tính khác.',
};
