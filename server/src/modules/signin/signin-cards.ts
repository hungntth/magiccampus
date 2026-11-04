// Legacy 5-day sign-in cards: the items named by the Flash text (Language.SIGN_IN_U[1..5]); they are resolved by exact name and
// granted bound, on top of the level-scaled exp + silver of the card (shared REWARD_K signin1..5).

import type { NamedItem } from '../activity-rewards/item-grant.service';

export const SIGNIN_CARD_ITEMS: readonly (readonly NamedItem[])[] = [
  [{ name: 'Truy Hồn Phù', qty: 1 }],
  [{ name: 'Loa', qty: 2 }, { name: 'Sách Hồi Nhóm', qty: 2 }],
  [{ name: 'Đông Huyền Lệnh Kỳ (Lam)', qty: 1 }, { name: 'Sách Gặp Đầy Quái (15 phút)', qty: 1 }],
  [{ name: 'Bang Hội Phù', qty: 4 }, { name: 'Kết Tinh Thần Tu A', qty: 2 }],
  [{ name: 'Thăng Tinh Thạch', qty: 5 }, { name: 'Sách Tăng Thần Tu 2 Lần (1 Giờ)', qty: 1 }],
];

/** Items of card 1..5 (empty for anything else). */
export const cardItems = (card: number): readonly NamedItem[] => SIGNIN_CARD_ITEMS[card - 1] ?? [];
