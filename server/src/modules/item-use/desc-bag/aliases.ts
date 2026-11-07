// Fixed name mapping and description overrides for the description-driven gift bag opener. Copied from Go
// item/effect_desc_bag_aliases.go (owner-approved fixes, 2026-10-27 .. 2026-11-06). Each alias key (a descBagNameKey) is indexed
// as exactly that template and replaces whatever the name resolved to; a mapped id missing from the game data is skipped. A
// description override replaces the template description for the parser (bags whose text the parser cannot read as written);
// ids with an override are routed to the opener even when the name has no bag word.

export const DESC_BAG_NAME_ALIASES: Readonly<Record<string, number>> = {
  'hoàng kim lễ đại': 653,
  'hoàng kim lễ nhỏ': 642,
  'túi quà mệnh hồn cao cấp': 3719,
  'kết tinh thần tu ( mỗi ngày 3 viên )': 2795,
  'túi pha lê vĩnh hằng': 5994,
  'canh gan dê': 307,
  'bánh xếp hải sản': 2706,
  'hải sản chay': 2566,
  'túi hủy diệt phù cam': 5213,
  'túi quà viễn cổ thần binh ( trợ thủ trác việt )': 3378,
};

export const DESC_BAG_DESCRIPTION_OVERRIDES: Readonly<Record<number, string>> = {
  3755: 'Chọn 1 trong: Ma Tâm Cao Cấp, Man Lực Cao Cấp, Thuấn Ảnh Cao Cấp, Trì Độn Cao Cấp, Thần Thánh Phủ Định Cao Cấp',
  5267: 'Chứa: Thời Trang Baymax (30 Ngày)*1',
  5913: 'Chọn 1 trong: Túi Quà Viễn Cổ Thần Binh (Chính Trác Việt), Túi Quà Viễn Cổ Thần Binh (Trợ Thủ Trác Việt), '
    + 'Túi Quà Sách Kỹ Năng Cao Cấp Kinh Điển',
  6598: 'Chứa: Bánh Trôi Thần Kỳ*2, Kem Ngọt Ngào*2, Tuổi Thơ Tươi Tắn*2, Truyền Thuyết Thất Tịch - Hoàn Chỉnh*2',
};

export const hasDescBagDescriptionOverride = (bagId: number): boolean => bagId in DESC_BAG_DESCRIPTION_OVERRIDES;

export const descBagDescription = (bagId: number, description: string): string =>
  DESC_BAG_DESCRIPTION_OVERRIDES[bagId] ?? description;
