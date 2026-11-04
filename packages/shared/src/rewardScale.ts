// Level-scaled reward tables (M8 decision 2): BASIC_GET_EXP / BASIC_GET_MONEY (Flash GamePredef, identical in Go
// gamedata/predef/quest_reward.go, 161 entries for levels 0..160) and the per-reward multiplier `k` table used where the
// legacy data has no reward contents (diary chests, sign-in bags, online gifts). One shared copy for server and client.

/** Exp of one "basic unit" at a level (index = level, 0..160). */
export const BASIC_GET_EXP: readonly number[] = [
  1, 11220, 12240, 13260, 14280, 15300, 16320, 17340, 18360, 19380,
  20400, 26775, 28050, 29325, 30600, 31875, 33150, 34425, 35700, 36975,
  38250, 47430, 48960, 50490, 52020, 53550, 55080, 56610, 58140, 59670,
  61200, 73185, 74970, 76755, 78540, 80325, 82110, 83895, 85680, 87465,
  89250, 104040, 106080, 108120, 110160, 112200, 114240, 116280, 118320, 120360,
  122400, 139995, 142290, 144585, 146880, 149175, 151470, 153765, 156060, 158355,
  160650, 181050, 183600, 186150, 188700, 191250, 193800, 196350, 198900, 201450,
  224400, 227205, 230010, 232815, 235620, 238425, 241230, 244035, 246840, 249645,
  252450, 278460, 281520, 284580, 287640, 290700, 293760, 296820, 299880, 302940,
  306000, 334815, 338130, 341445, 344760, 348075, 351390, 354705, 358020, 361335,
  392700, 396270, 399840, 403410, 406980, 410550, 414120, 417690, 421260, 424830,
  428400, 493680, 497760, 501840, 505920, 573750, 578340, 582930, 652800, 657900,
  663000, 734910, 740520, 746130, 820080, 826200, 832320, 908310, 914940, 921570,
  1071000, 1222470, 1375980, 1531530, 1689120, 1848750, 2010420, 2174130, 2339880, 2507670,
  2677500, 2809722, 2943597, 3163417, 3303903, 3446868, 3625368, 3757590, 3891465, 4111285,
  4251771, 4469938, 4606292, 4738514, 4872389, 5005438, 5145924, 5288889, 5407063, 5539285,
  5673160,
];

/** Bound silver of one "basic unit" at a level (index = level, 0..160). */
export const BASIC_GET_MONEY: readonly number[] = [
  1, 2380, 2380, 2380, 2380, 2380, 2783, 2783, 2783, 2783,
  2783, 3657, 3657, 3657, 3657, 3657, 5135, 5135, 5135, 5135,
  5135, 7420, 7420, 7420, 7420, 7420, 10780, 10780, 10780, 10780,
  10780, 15551, 15551, 15551, 15551, 15551, 22137, 22137, 22137, 22137,
  22137, 31007, 31007, 31007, 31007, 31007, 42700, 42700, 42700, 42700,
  42700, 57820, 57820, 57820, 57820, 57820, 77039, 77039, 77039, 77039,
  77039, 101097, 101097, 101097, 101097, 101097, 130799, 130799, 130799, 130799,
  130799, 167020, 167020, 167020, 167020, 167020, 210700, 210700, 210700, 210700,
  210700, 262847, 262847, 262847, 262847, 262847, 324537, 324537, 324537, 324537,
  324537, 396911, 396911, 396911, 396911, 396911, 481180, 481180, 481180, 481180,
  481180, 578620, 578620, 578620, 578620, 578620, 690575, 690575, 690575, 690575,
  690575, 818457, 818457, 818457, 818457, 818457, 963743, 963743, 963743, 963743,
  963743, 1127980, 1127980, 1127980, 1127980, 1127980, 1312780, 1312780, 1312780, 1312780,
  1312780, 1510278, 1510278, 1510278, 1510278, 1510278, 1725180, 1725180, 1725180, 1725180,
  1725180, 1955780, 1955780, 1955780, 1955780, 1955780, 2206784, 2206784, 2206784, 2206784,
  2206784, 2475287, 2475287, 2475287, 2475287, 2475287, 2758873, 2758873, 2758873, 2758873,
  2758873,
];

const clampLevel = (level: number): number => Math.max(0, Math.min(BASIC_GET_EXP.length - 1, Math.floor(level)));

export const basicExp = (level: number): number => BASIC_GET_EXP[clampLevel(level)];
export const basicMoney = (level: number): number => BASIC_GET_MONEY[clampLevel(level)];

/** Multipliers over the basic units for one reward (H5 design: the legacy data holds no contents for these rewards). */
export interface RewardK {
  exp: number;
  silver: number;
}

export type ScaledRewardId =
  | 'signin1' | 'signin2' | 'signin3' | 'signin4' | 'signin5' // legacy 5-day cards
  | 'calDaily' | 'calSurprise' | 'calCrit' // monthly calendar pools (inc 1 / 2 / 4)
  | 'chest0' | 'chest1' | 'chest2' | 'chest3' | 'chest4' // diary chests (items 3255..3259)
  | 'online' // one 30-minute online gift
  | 'feast'; // a festival gift (phase D)

/** The one documented k table; tune here only. */
export const REWARD_K: Readonly<Record<ScaledRewardId, RewardK>> = {
  signin1: { exp: 0.04, silver: 0.04 },
  signin2: { exp: 0.06, silver: 0.06 },
  signin3: { exp: 0.08, silver: 0.08 },
  signin4: { exp: 0.1, silver: 0.1 },
  signin5: { exp: 0.15, silver: 0.15 },
  calDaily: { exp: 0.05, silver: 0.05 },
  calSurprise: { exp: 0.3, silver: 0.3 },
  calCrit: { exp: 0.2, silver: 0.2 },
  chest0: { exp: 0.1, silver: 0.1 },
  chest1: { exp: 0.2, silver: 0.2 },
  chest2: { exp: 0.4, silver: 0.4 },
  chest3: { exp: 0.7, silver: 0.7 },
  chest4: { exp: 1.2, silver: 1.2 },
  online: { exp: 0.04, silver: 0.04 },
  feast: { exp: 0.5, silver: 0.5 },
};

/** Exp and bound silver granted by a reward at `level` (rounded, never negative). */
export function scaledReward(id: ScaledRewardId, level: number): { exp: number; silver: number } {
  const k = REWARD_K[id];
  return { exp: Math.round(basicExp(level) * k.exp), silver: Math.round(basicMoney(level) * k.silver) };
}
