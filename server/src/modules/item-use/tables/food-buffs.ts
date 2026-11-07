// Buff foods (type 502) and wedding candies, copied from the Go server (application/item/food_buff_table.go and
// effect_wedding_candy.go). `seconds` makes a timed buff (eating the same food again adds to the remaining time), `battles` a
// battle-count buff (adds to the remaining battles, decremented once per finished battle). `field` marks "use outside battle only"
// foods (only enforced by the battle item path, which this port does not have for foods). Foods missing here have no effect and are
// refused. Deviation: Go stores 382 (1 hour) under an alias of buff 287 so it coexists with 269 (5 battles); here both write the
// same (character, buff 287) row and the later one wins.

import type { GrantOptions } from '../../buff/buff-stack';

export interface FoodBuff {
  buffId: number;
  seconds?: number;
  battles?: number;
  field?: boolean;
}

const QUARTER = 15 * 60;
const HALF = 30 * 60;
const HOUR = 3600;

const battles = (buffId: number): FoodBuff => ({ buffId, battles: 5, field: true });
const timed = (buffId: number, seconds: number, field = false): FoodBuff => ({ buffId, seconds, ...(field ? { field: true } : {}) });

export const FOOD_BUFFS: Readonly<Record<number, FoodBuff>> = {
  105: battles(268), 259: battles(269), 260: battles(291), 261: battles(311), 262: battles(312), 263: battles(292),
  264: battles(271), 265: battles(272), 266: battles(288), 267: battles(274), 268: battles(275), 269: battles(287),
  307: timed(1404, HOUR, true), 374: timed(327, HOUR, true), 375: timed(328, 3 * HOUR, true), 376: timed(329, HOUR, true),
  377: timed(330, 3 * HOUR, true), 378: timed(292, HOUR, true), 379: timed(292, 3 * HOUR, true), 380: timed(271, HOUR, true),
  381: timed(272, HOUR, true), 382: timed(287, HOUR, true), 383: timed(288, HOUR, true), 384: timed(294, HOUR, true),
  1297: timed(772, QUARTER, true), 1298: timed(773, QUARTER, true), 1299: timed(774, QUARTER, true), 1300: timed(775, QUARTER, true),
  1301: timed(776, QUARTER, true), 1519: timed(883, QUARTER, true), 1520: timed(884, QUARTER, true), 1521: timed(885, QUARTER, true),
  1522: timed(886, QUARTER, true), 1523: timed(887, QUARTER, true), 1638: timed(1041, HOUR, true), 1639: timed(1042, HOUR, true),
  1640: timed(1043, HOUR, true), 1676: timed(1169, QUARTER, true), 1677: timed(1170, QUARTER, true), 1678: timed(1171, QUARTER, true),
  1679: timed(1172, QUARTER, true), 1680: timed(1173, QUARTER, true), 1856: timed(2709, HOUR), 1858: timed(1231, QUARTER),
  1859: timed(1232, QUARTER), 1860: timed(1233, QUARTER), 2051: timed(1381, 6 * HOUR, true), 2069: timed(1376, QUARTER),
  2070: timed(1377, QUARTER), 2071: timed(1378, QUARTER), 2072: timed(1379, QUARTER), 2073: timed(1380, QUARTER),
  2415: timed(1691, HALF, true), 2416: timed(1692, HALF, true), 2419: timed(1697, HALF, true), 2536: timed(1716, HOUR, true),
  2564: timed(1766, HALF), 2565: timed(1767, HALF, true), 2566: timed(1768, HALF, true), 2690: timed(1870, HOUR, true),
  2706: timed(1716, HOUR, true), 3298: timed(2263, HOUR), 3439: timed(2339, 2 * HOUR, true), 3912: timed(2705, QUARTER),
  3913: timed(2706, QUARTER), 3915: timed(2708, QUARTER), 3916: timed(2709, HOUR), 3968: timed(2719, HOUR),
  4149: timed(2836, HOUR), 4150: timed(2837, HOUR), 4151: timed(2838, HOUR), 4580: timed(2854, HALF), 4581: timed(2855, HALF),
  4582: timed(2856, HALF), 4583: timed(2857, HALF), 4584: timed(2858, HALF), 5000: battles(292), 5352: timed(2339, 2 * HOUR),
  6267: timed(3316, HALF), 6863: timed(3393, HALF), 6864: timed(3394, HALF), 6865: timed(3395, HALF), 6866: timed(3396, HALF),
  6867: timed(3397, HALF),
};

/** Wedding candies (effect_wedding_candy.go): Kẹo Cát Tường / Hạnh Phúc / Mỹ Mãn / Hảo Hợp -> buffs 1183-1186, 15 minutes each. */
export const WEDDING_CANDIES: Readonly<Record<number, FoodBuff>> = {
  1690: timed(1183, QUARTER), 1694: timed(1184, QUARTER), 1695: timed(1185, QUARTER), 1696: timed(1186, QUARTER),
};

/** The `BuffService.grant` arguments of a food: timed foods add their time to the remaining time, battle foods add 5 battles. */
export function foodGrantArgs(fb: FoodBuff): { seconds: number; opts: GrantOptions } {
  return fb.battles && fb.battles > 0
    ? { seconds: 0, opts: { addRemaining: true, battles: fb.battles } }
    : { seconds: fb.seconds ?? 0, opts: { addRemaining: true } };
}
