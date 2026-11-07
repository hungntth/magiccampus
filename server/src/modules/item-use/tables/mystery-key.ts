// Chia Khoa Than Bi 1361 (type 509): one use grants one item x1, uniform over this list (Go application/item/effect_mystery_key.go
// mysteryKeyJunk): potions 4 / 125 / 158, food 261 / 264 / 267, Toai Liet gems 9-13, Liet Van Menh Thach 14.

export const MYSTERY_KEY_ID = 1361;
export const MYSTERY_KEY_PRIZES: readonly number[] = [4, 125, 158, 261, 264, 267, 9, 10, 11, 12, 13, 14];

/** Uniform prize from a [0, 1) rng. */
export function rollMysteryKeyPrize(rng: () => number): number {
  return MYSTERY_KEY_PRIZES[Math.min(MYSTERY_KEY_PRIZES.length - 1, Math.floor(rng() * MYSTERY_KEY_PRIZES.length))];
}
