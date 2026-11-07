// Item use contract: choose-one gift boxes (itemMultitoSel / selMultiItemByIdx), batch use (useMultiItem) and the shared
// refusal / result strings of useItem (legacy Language + application/item/use_notices.go). Phases A/G use the text table, B the gift box.

/** One choice in a gift box; keys are the legacy short names. */
export interface PackItemChoice {
  ti: number; // award type (29 item, 19 equipment, 12 pet, ...)
  ii: number; // template id
  n: number; // count
  q: number; // quality (items / equipment: colour * 5, pets: grow rate * 10)
  /** H5 additions (the Flash client resolved these from its own tables): display name and icon code of the choice. */
  nm?: string;
  ic?: string;
}

/** itemMultitoSel(payload, itemId) push payload. */
export interface ItemMultiToSelPayload {
  packItemList: Record<string, PackItemChoice>;
  packGetNum: number | 'all';
}

/** selMultiItemByIdx(itemId, idx) wire args; `itemId` is the bag row id the itemMultitoSel push carried. */
export interface SelMultiItemArgs {
  itemId: number;
  idx: number;
}

/** selMultiItemByIdx reply: -1 refused, 0 finished (close panel), N > 0 picks left. */
export type SelMultiItemResult = number;

/** Legacy Language.MULTI_ITEM_PANEL (choose-one gift box window). */
export const MULTI_ITEM_PANEL_TEXT = {
  TITLE: 'Túi quà',
  CAN_GET: 'Có thể nhận {num} vật phẩm bên bảng dưới.',
  CAN_GET_ALL: 'Có thể nhận toàn bộ',
  NO_ROOM: 'Không đủ chỗ trống.',
  PICK: 'Nhận',
} as const;

export const ITEM_USE_TEXT = {
  CANNOT_USE: 'Vật phẩm này hiện chưa sử dụng được.',
  LEVEL: 'Cấp độ không đủ!',
  BAG_UNKNOWN: 'Túi quà này hiện chưa mở được.',
  BAG_RETIRED: 'Túi quà này đã ngừng phát hành, không thể mở.',
  NO_ROOM: 'Không đủ ô trống.',
  NEED_GOLD: 'Không đủ Vàng để mở túi này!',
  FOOD_NO_EFFECT: 'Vật phẩm này chưa có hiệu quả sử dụng.',
  OPENED: 'Đã mở %s.',
  USED: 'Đã sử dụng %s.',
  GOT_EXP: 'Nhận được %d kinh nghiệm.',
  GOT_KIM_PHIEU: 'Nhận được %d kim phiếu.',
  GOT_SILVER: 'Nhận được %d bạc.',
  GOT_SILVER_BIND: 'Nhận được %d ngân phiếu.',
  GOT_TITLE: '%s nhận được danh hiệu %s!',
  PICK_NO_ROOM: 'Túi đồ không đủ chỗ trống!',
  PICK_NO_GOLD: 'Không đủ Vàng để mở túi này!',
  PICK_PAID: 'Chọn 1 vật phẩm để mở túi, sẽ trừ %d Vàng khi nhận.',
  // phase D-F: rule potions, pet items, books, special items
  BATTLE_ONLY: 'Vật phẩm này chỉ dùng được trong chiến đấu.',
  HP_MP_FULL: 'HP / MP đã đầy, không cần hồi phục.',
  CHAR_ONLY: 'Vật phẩm này chỉ dùng cho nhân vật.',
  PET_NO_EFFECT: 'Pet không cần hồi phục.',
  PET_LOYALTY_FULL: 'Độ trung thành của pet đã đầy.',
  PET_LIFE_FULL: 'Thọ mệnh của pet đã đầy.',
  PET_LIFE_GAIN: 'Thọ mệnh của pet tăng %d điểm (%d/%d).',
  NEED_PET: 'Hãy chọn pet để sử dụng vật phẩm này!',
  PET_LEVEL_LOW: 'Cấp pet chưa đủ để dùng vật phẩm này!',
  PET_OWNER_CAP: 'Cấp pet không được cao hơn cấp nhân vật quá 5 cấp!',
  EXP_STRONGER: 'Đang có hiệu ứng %s mạnh hơn, không thể dùng %s.',
  ATTR_RESET_LEVEL: 'Chỉ nhân vật cấp 1 - %d có thể dùng.',
  ATTR_RESET_NONE: 'Nhân vật chưa phân phối điểm thuộc tính nào.',
  ATTR_RESET_DONE: 'Đã tẩy điểm thuộc tính, hoàn lại %d điểm.',
  FRUIT_NO_PET: 'Hãy cho pet xuất chiến hoặc đi theo rồi dùng Tinh Hồn Chi Thực!',
  FRUIT_MAX: 'Tư chất của pet đã đạt tối đa, không thể tăng thêm!',
  FRUIT_GAIN: 'Tư chất %s của %s tăng từ %d lên %d.',
  PET_SLOT_MAX: 'Túi pet đã mở tối đa %d chỗ.',
  MOUNT_REBORN: 'Cần chuyển sinh để sở hữu thú cưỡi.',
  MOUNT_PERMANENT: 'Đã sở hữu vĩnh viễn thú cưỡi %s.',
  GOT_ITEM: 'Bạn nhận được %s.',
  GOT_ITEMS: 'Bạn nhận được %d %s.',
  GOT_CANDY: 'Bạn nhận được %d Kẹo Giáng Sinh.',
} as const;

/** `%s` / `%d` substitution for the strings above (first placeholder gets the first argument, and so on). */
export function itemUseText(template: string, ...args: (string | number)[]): string {
  let i = 0;
  return template.replace(/%[sd]/g, () => String(args[i++] ?? ''));
}
