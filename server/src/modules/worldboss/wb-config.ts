// World boss tuning knobs in one place (M10 decision 19; Go domain/worldboss config.go defaults, owner 2026-10-29 / 10-31 values).

export const WB = {
  MAP_ID: 2006,
  ENTRY_X: 840,
  ENTRY_Y: 720,
  /** Hydra; the battle model is 2060100100027 (Hydra Nhỏ, the HUD preload 100028 has no swf). */
  BOSS_NID: 1255,
  BATTLE_RES: '2060100100027',
  POOL_HP: 800_000_000,
  /** int32-safe battle Life: the Flash bar wraps above 2^31 (Go BattleHPCap). */
  BATTLE_HP_CAP: 2_000_000_000,
  MIN_LEVEL: 50,
  LOBBY_MS: 30 * 60_000,
  CLAIM_GRACE_MS: 3 * 60_000,
  MANUAL_MS: 30 * 60_000,
  FIRST_BATTLE_MS: 2000,
  NEXT_BATTLE_MS: 2000,
  /** battle round cap (decision 9); the doomsday wipe at round 6 ends every fight long before it */
  ROUND_CAP: 150,
  DOOMSDAY_ROUND: 6,
  DOOMSDAY_SKILL: 5935,
  /** Phong Bạo Diệt Vong, Đại Lăng Thao Thiên, Độc Dịch Chí Mạng at roll x3 (30 % -> 90 %) */
  SKILL_POOL: [6023, 5938, 5937] as readonly number[],
  CHANCE_SCALE: 3,
  /** return map when the saved point is missing or is the event map (Đông Huyền Thành) */
  FALLBACK_MAP: 9,
  RANK_LIST: 10,
  TOP_RANKS: 3,
  LUCKY_COUNT: 3,
  /** Túi Quà Quán Quân / Á Quân / Dũng Sĩ for class rank 1 / 2 / 3, Nhất Kích for the killing blow, May Mắn for the lucky draw */
  CLASS_RANK_BAGS: [3585, 3586, 3587] as readonly number[],
  LAST_HIT_BAG: 3588,
  LUCKY_BAG: 3584,
  /** per battle: exp = level x 200 + dmg / 50 (cap level x 2000), bound silver = dmg / 100 (cap 20,000), Chiến tích flat 20 */
  BATTLE_EXP_PER_LEVEL: 200,
  BATTLE_EXP_DIVISOR: 50,
  BATTLE_EXP_CAP_PER_LEVEL: 2000,
  BATTLE_MONEY_DIVISOR: 100,
  BATTLE_MONEY_CAP: 20_000,
  BATTLE_HONOR: 20,
  /** settlement by damage share: share x level x 20,000 exp and share x 2,000,000 bound silver */
  SETTLE_EXP_PER_LEVEL: 20_000,
  SETTLE_MONEY_POOL: 2_000_000,
  /** step of the attack multiplier per cheer level, percent */
  CHEER_STEP_PCT: 20,
} as const;

export const WB_TEXT_SERVER = {
  NOT_STARTED: 'Sự kiện BOSS Thế Giới chưa bắt đầu.',
  LEVEL: (n: number): string => `Cần đạt cấp ${n} trở lên.`,
  IN_BATTLE: 'Đang trong trận chiến, không thể tham gia.',
  KILLED: 'BOSS Thế Giới đã bị tiêu diệt.',
  ENTER_FAILED: 'Không thể vào bản đồ BOSS Thế Giới, hãy thử lại.',
  NO_GOLD: 'Không đủ vàng.',
  NO_SILVER: 'Không đủ bạc.',
  CHEER_FAILED: 'Cổ vũ thất bại.',
  CHEER_OK: (pct: number): string => `Cổ vũ thành công, tấn công tăng ${pct}%.`,
  BAG_FULL: 'Túi đồ đã đầy, hãy dọn túi rồi nhận lại.',
  OWED_CLAIMED: 'Phần thưởng BOSS Thế Giới cất giữ đã được gửi vào hộp thư của bạn.',
  MAILED: 'Phần thưởng BOSS Thế Giới đã được gửi vào hộp thư của bạn.',
  MAIL_SENDER: 'Boss Thế Giới',
  MAIL_TITLE: 'Phần thưởng BOSS Thế Giới',
  MAIL_BODY: (classRank: string, worldRank: string): string =>
    `Phần thưởng BOSS Thế Giới của bạn (xếp hạng nghề ${classRank}, xếp hạng thế giới ${worldRank}) được gửi qua thư vì chưa nhận được trong sự kiện. Hãy nhận trước khi thư hết hạn.`,
  START: 'Sự kiện BOSS Thế Giới đã bắt đầu, hãy nhấn biểu tượng Boss Thế Giới để tham gia!',
  LOBBY: (clock: string): string => `Bản đồ BOSS Thế Giới đã mở, trận chiến bắt đầu lúc ${clock}. Hãy nhấn biểu tượng Boss Thế Giới để vào chờ!`,
  LOBBY_WAIT: (clock: string): string => `BOSS Thế Giới bắt đầu lúc ${clock}, chưa thể tấn công. Trận chiến sẽ tự bắt đầu khi đến giờ.`,
  KILLED_BY: (name: string): string => `BOSS Thế Giới đã bị ${name} hạ gục!`,
  LUCKY: (names: string): string => `Người chơi may mắn của BOSS Thế Giới: ${names}, nhận Quà May Mắn!`,
} as const;
