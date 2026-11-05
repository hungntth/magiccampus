// M10 phase F: Kiếp Nạn Vô Ưu (nine boss, Flash NineBossPanel, activity icon 13). Constants, panel payload, reward formulas and the
// panel texts (Language.NINE_BOSS). RPCs: initNineFloorPanel -> {f, df}, attachThisFloorBoss(floor), getNineBossAward(floorId, type) -> panel.
// Pushes: onSystemSay (refusals, first-kill notice, claim results). Rules: legacy memory nine-boss.md; plan 2026-11-04_13 §2.4.

export const NINE_BOSS = {
  ACTIVITY_ID: 13,
  FLOORS: 9,
  MIN_LEVEL: 130,
  /** Real gold of the direct claim ("Trực tiếp nhận", getNineBossAward(10, 1)). */
  DIRECT_CLAIM_GOLD: 20,
  /** Linh Vũ (wing evolution) and Lông Vũ Ngũ Sắc (wing dye), always bound. */
  ITEM_WING_EVOLVE: 3627,
  ITEM_WING_DYE: 3677,
  /** Diary task "Hoàn thành Kiếp Nạn Vô Ưu". */
  DIARY_TASK: 38,
  /** Round cap of a floor fight (decision 9). */
  ROUND_CAP: 150,
  /** getNineBossAward(floorId, type): "Nhận" sends (9, 2), "Trực tiếp nhận" sends (10, 1). */
  DIRECT_FLOOR_ID: 10,
  DIRECT_TYPE: 1,
} as const;

/** initNineFloorPanel / getNineBossAward reply: `df` = [0, claimedCycle, todayFloors digits, today cycle] (cycles are YYYYMMDD numbers). */
export interface NineFloorPanel {
  f: number;
  df: [0, number, string, number];
}

export interface NineReward {
  linhVu: number;
  longVu: number;
}

/** Daily claim: 3627 x 2 * floor + 3677 x ceil(floor / 3). */
export function nineDailyReward(floor: number): NineReward {
  return { linhVu: 2 * floor, longVu: Math.ceil(floor / 3) };
}

/** First kill of a floor: 3627 x 10 * floor + 3677 x floor. */
export function nineFirstKillReward(floor: number): NineReward {
  return { linhVu: 10 * floor, longVu: floor };
}

/** Boss names in floor order (NOTICE_INFO[57..65] / the tab captions). */
export const NINE_BOSS_NAMES: readonly string[] = [
  'Ma Chiến', 'Quỷ Vương', 'Chu Ma Vương', 'Ma Hồn', 'Avatar', 'Hydra', 'Atula', 'Mehdi', 'Solomon',
];

/** Language.NINE_BOSS[22..30]: the boss blurb of floors 1..9. */
export const NINE_BOSS_INFO: readonly string[] = [
  'Cận vệ bên cạnh Chu Ma Vương đều rất mực trung thành, hơn thế bọn chúng đều là những tên yêu ma hung ác. Để đánh bại được âm mưu của chúng, các dũng sĩ Vô Ưu phải hết sức đoàn kết và luôn nêu cao tinh thần chiến đấu!',
  'Quỷ Vương được xem là sứ giả địa ngục hung ác. Hắn ta luôn muốn đem đến khổ ải sinh lão bệnh tử vào thế giới Vô Ưu này.',
  'Chu Ma Vương đích thân xung trận, nhưng hắn cần phải triệu hồi hồn ma khắp nơi về để gia tăng sức mạnh. Các dũng sĩ hãy nắm bắt cơ hội này mà tiêu diệt hắn!',
  'Trước sĩ khí của lòng quân Đại Lục Vô Ưu, Chu Ma Vương đã tạm nhượng bộ, nhưng bên ngoài hắn vẫn âm mưu bày binh bố trận, gãy bẫy mọi người. Các dũng sĩ phải hết sức cẩn thận!',
  'Tuy đã dần đánh bại Chu Ma Vương nhưng vẫn chưa ngăn được tiếng quân hùng hổ của vô số yêu ma mà Chu Ma Vương triệu hồi về! Các dũng sĩ hãy tiếp tục chiến đấu!',
  'Hydra sinh ra từ dung nham của địa ngục, cho nên sức mạnh của hắn rất được Chu Ma Vương xem trọng. Các dũng sĩ quyết tâm, không chùn bước trước hiểm nguy!',
  'Atula là 1 trong những hung thần trong lục đạo, ai nghe danh cũng phải khiếp sợ. Các dũng sĩ hãy cố lên vì 1 hòa bình cho Đại Lục Vô Ưu.',
  '2 anh em nhà Mehdi nghĩ rằng với sức mạnh của chún thì đã có thể thôn tính Đại Lục Vô Ưu. Các dũng sĩ hãy nhanh chóng đập tan mộng ảo của bọn chúng!',
  'Sức mạnh của con trai thần Sấm Sét - Solomon liệu có thể đe dọa được sĩ khí của mọi người? Vận mệnh của Đại Lục Vô Ưu đều nằm trong tay các dũng sĩ!',
];

export const NINE_BOSS_TEXT = {
  TITLE: 'Kiếp Nạn Vô Ưu',
  CLAIM: 'Nhận',
  CLAIM_DIRECT: 'Trực tiếp nhận',
  RULES_TITLE: 'Quy Tắc',
  /** NINE_BOSS[32] / [11] with {num} / {gold} replaced. */
  CONFIRM_FREE: (floor: number): string => `Mỗi ngày chỉ được nhận thưởng 1 lần, bạn xác nhận thưởng tầng ${floor}?`,
  CONFIRM_DIRECT: (gold: number, floor: number): string =>
    `Trực tiếp nhận thưởng tầng cao nhất cần tiêu hao ${gold} vàng, bạn xác nhận trực tiếp nhận thưởng tầng ${floor}?`,
  RULES: [
    '1. Người chơi cấp 130 trở lên mới có thể tham gia, độc khó của BOSS khá cao, đề nghị lập nhóm khiêu chiến.',
    '2. Khiêu chiến BOSS thành công ở mỗi tầng sẽ nhận được phần thưởng. Lần đầu giết hạ BOSS sẽ nhận được phần thưởng bất ngờ.',
    '3. Số lượng BOSS khiêu chiến mỗi ngày không giới hạn, nhưng mỗi ngày chỉ có thể nhận thưởng 1 lần, phần thưởng nhận tương ứng với BOSS khiêu chiến thành công ở tầng cao nhất.',
    '4. Nếu như ngày đó vẫn chưa khiêu chiến có thể tiêu phí 1 lượng vàng nhất định để Trực tiếp nhận thưởng (phần thưởng nhận tương ứng với BOSS khiêu chiến thành công tầng cao nhất).',
    '5. Sau khi khiêu chiến thành công sẽ nhận được vật phẩm tiến hóa và nhuộm màu cho cánh.',
  ],
  LEVEL: 'Cần đạt cấp 130 trở lên mới có thể tham gia Kiếp Nạn Vô Ưu.',
  LOCKED: 'Cần vượt qua tầng trước mới có thể khiêu chiến tầng này.',
  IN_BATTLE: 'Bạn đang trong trận chiến.',
  UNAVAILABLE: 'Không thể bắt đầu trận chiến, vui lòng thử lại sau.',
  CLAIMED: 'Hôm nay bạn đã nhận thưởng rồi.',
  NOTHING_TODAY: 'Hôm nay bạn chưa vượt qua tầng nào.',
  NO_GOLD: 'Không đủ vàng.',
  BAG_FULL: 'Túi đồ đã đầy, hãy dọn túi rồi nhận lại.',
  /** NOTICE_INFO[57 + floor - 1], composed on the server. */
  FIRST_KILL: (name: string, boss: string): string =>
    `${name} lần đầu đánh bại Kiếp Nạn Vô Ưu - ${boss} đã nhận nhiều phần thưởng, thật đúng là nhân tài của Đại Lục Vô Ưu!`,
} as const;
