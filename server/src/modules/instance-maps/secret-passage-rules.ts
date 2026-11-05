// Pure Mật Đạo rules (Go handlers/item secret_passage_use.go, application/combat secret_passage_encounter.go): the two books, the
// refusals before one is consumed (level, battle, group, already inside), the encounter level (the player's), the exp base
// (level x 10 unless the row has one) x map exp_multi x 2, and the elite life scale.

export const SECRET_PASSAGE = {
  BOOKS: [128, 2137] as readonly number[], // Sách Dịch Chuyển Mật Đạo (bound) / 4 Giờ (tradable)
  MAPS: [140104, 140105, 140106] as readonly number[],
  ENTRY_MAP: 140106,
  EXP_BONUS: 2,
  ELITE_LIFE_SCALE: 0.5,
  ELITE_BOSS_FLAG: 2, // creature 452 (floors 1-2) / 727 (floor 3)
} as const;

export const SECRET_PASSAGE_TEXT = {
  IN_GROUP: 'Không thể sử dụng khi đang ở trong nhóm.',
  IN_BATTLE: 'Không thể sử dụng khi đang chiến đấu.',
  INSIDE: 'Ngươi đang ở trong Mật Đạo rồi.',
  LEVEL: 'Cấp độ không đủ!',
  FAILED: 'Không thể vào Mật Đạo lúc này.',
} as const;

export const isSecretPassageBook = (templateId: number): boolean => SECRET_PASSAGE.BOOKS.includes(templateId);
export const isSecretPassageMap = (mapId: number): boolean => SECRET_PASSAGE.MAPS.includes(mapId);

export interface BookState {
  level: number;
  reqLevel: number;
  inBattle: boolean;
  inGroup: boolean;
  mapId: number;
}

/** Refusal text (the book stays in the bag), or null when it may be used. Go order: level, battle, group, inside. */
export function bookRefusal(s: BookState): string | null {
  if (s.reqLevel > s.level) return SECRET_PASSAGE_TEXT.LEVEL;
  if (s.inBattle) return SECRET_PASSAGE_TEXT.IN_BATTLE;
  if (s.inGroup) return SECRET_PASSAGE_TEXT.IN_GROUP;
  if (isSecretPassageMap(s.mapId)) return SECRET_PASSAGE_TEXT.INSIDE;
  return null;
}

/** Exp multiplier of the map: its exp_multi (at least 1) x 2. */
export const passageExpMulti = (mapExpMulti: number): number => Math.max(1, mapExpMulti) * SECRET_PASSAGE.EXP_BONUS;

/** Exp base of a mob at `level`: the row's own base (> 0) else level x 10, times the map multiplier, truncated. */
export function passageExpBase(rowBase: number, level: number, mapExpMulti: number): number {
  const base = rowBase > 0 ? rowBase : level * 10;
  return Math.max(1, Math.trunc(base * passageExpMulti(mapExpMulti)));
}

/** Elite (boss flag 2) max life after the 50 % cut, at least 1. */
export const eliteLife = (hpMax: number): number => Math.max(1, Math.trunc(hpMax * SECRET_PASSAGE.ELITE_LIFE_SCALE));
