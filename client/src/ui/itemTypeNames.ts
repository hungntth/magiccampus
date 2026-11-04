// Item template type -> name for the tooltip "Loại: " line (legacy GamePredef.ITEM_TYPE_NAME from GAMEPREDEF_S;
// generated from GamePredef.as / Language.as). Unknown types read as ITEM_TYPE_OTHER ("Khác"), like TipItem.getItemTypeName.

const ITEM_TYPE_NAME: Record<number, string> = {
  100: 'Chùy', 101: 'Trượng', 102: 'Súng', 103: 'Kiếm', 104: 'Cầm', 105: 'Bổng',
  200: 'Thuẫn', 201: 'Sách', 202: 'Hộ uyển', 203: 'Chủy thủ', 204: 'Cầm cung', 205: 'Găng tay',
  300: 'Mũ', 301: 'Áo', 302: 'Quần', 303: 'Đai', 304: 'Giày', 305: 'Hộ vai',
  400: 'Dây chuyền', 401: 'Nhẫn', 402: 'Trang sức 1', 403: 'Trang sức 2',
  500: 'Sách', 501: 'Thuốc', 502: 'Thức ăn', 503: 'Bảo thạch', 504: 'Thăng tinh thạch', 505: 'Sách kỹ năng',
  506: 'Yếu quyết', 507: 'Vật liệu luyện hóa', 508: 'Vật phẩm nhiệm vụ', 509: 'Chìa khóa',
  510: 'Thâm Lam Tinh', 511: 'Thâm Hồng Tinh', 512: 'Thăng cấp trang bị pet', 513: 'Sửa trang bị pet',
  514: 'Hoán Thần Thạch', 515: 'Ngư cụ', 516: 'Công thức tạo', 517: 'Túi tiện dụng', 518: 'Cường Hóa Cánh',
  521: 'Bí Kíp Tinh Linh', 550: 'Khác',
  600: 'Kim cương', 601: 'Kim loại', 602: 'Gỗ', 603: 'Ngọc', 604: 'Vải', 605: 'Da',
  610: 'Cá', 611: 'Nông sản', 612: 'Dược thảo',
  700: 'Hệ người', 701: 'Hệ dã thú', 702: 'Hệ thực vật', 703: 'Hệ máy', 704: 'Hệ ác ma', 705: 'Hệ rồng',
  800: 'Thần khí chính', 801: 'Thần khí phụ',
  900: 'Sừng', 901: 'Vòng', 902: 'Chuông', 903: 'Cánh', 904: 'Giáp', 905: 'Vai', 906: 'Thuộc tính I', 907: 'Thuộc tính II',
  1000: 'Phi hành', 1100: 'Thời trang', 1200: 'Găng thu thập', 1201: 'Cần câu',
  1300: 'Cánh', 1400: 'Công thức dung hợp Lông Vũ', 1401: 'Lông vũ loại A', 1402: 'Lông vũ loại B',
  1403: 'Lông vũ loại C', 1404: 'Lông vũ loại D',
};

export function itemTypeName(type: number): string {
  return ITEM_TYPE_NAME[type] ?? ITEM_TYPE_NAME[550];
}
