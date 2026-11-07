// Scroll books of type 500 (Go effect_exp_book.go, effect_encounter_book.go): template id -> buff id + duration in seconds. Item templates
// carry no duration column, so the durations come from the item names. Exp books add to the remaining time of the same buff.

export interface BookBuff {
  buffId: number;
  seconds: number;
}

const MIN = 60;
const HOUR = 3600;

/** Exp books: 281 x1.5 (props 24 / 25 = 150), 762 x3, 764 x5, 1538 pet x3 (prop 25 only). */
export const EXP_BOOKS: Readonly<Record<number, BookBuff>> = {
  298: { buffId: 281, seconds: HOUR }, 368: { buffId: 281, seconds: 3 * HOUR }, 369: { buffId: 281, seconds: 12 * HOUR },
  1140: { buffId: 762, seconds: HOUR }, 1141: { buffId: 762, seconds: 3 * HOUR },
  1142: { buffId: 764, seconds: HOUR }, 1143: { buffId: 764, seconds: 3 * HOUR },
  2274: { buffId: 1538, seconds: HOUR }, 2275: { buffId: 1538, seconds: 3 * HOUR },
};

/** Encounter books: 1203 meet on still, 1365 full roster, 314 crazy encounters, 313 no encounters. */
export const ENCOUNTER_BOOKS: Readonly<Record<number, BookBuff>> = {
  2053: { buffId: 1203, seconds: 15 * MIN }, 1857: { buffId: 1203, seconds: HOUR }, 1872: { buffId: 1203, seconds: 3 * HOUR },
  1873: { buffId: 1203, seconds: 6 * HOUR },
  2055: { buffId: 1365, seconds: 15 * MIN }, 2056: { buffId: 1365, seconds: HOUR },
  328: { buffId: 314, seconds: 15 * MIN }, 329: { buffId: 314, seconds: HOUR },
  327: { buffId: 313, seconds: 15 * MIN },
};

/** Pet slot book (+1 slot of the pet bag). */
export const PET_SLOT_BOOK_ID = 326;

/**
 * Type 500 templates Go consumes with "Da su dung" but whose real effect lives in a hook / RPC this port does not have yet (teleport
 * scrolls, treasure maps, quest-start books, Than Tu multiplier, summon books, exam papers ...): kept instead of eaten for nothing.
 */
export const KEPT_SCROLL_NAME = /Hồi Phù|Thụ Hải Phù|Bang Hội Phù|Bản Đồ Kho Báu|Mảnh Vỡ Bản Đồ|Sách Nhiệm Vụ|Dịch Chuyển|Ragnarok|Địa Cung Phù|Thần Tu|Lâm Âm|Triệu Hồi|Bài Thi|Mở Rộng Kho Đựng Pet/i;
