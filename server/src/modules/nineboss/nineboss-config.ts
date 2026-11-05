// Kiếp Nạn Vô Ưu floor tables (Go application/nineboss config.go + floors_low / chuma / floors_mid / floors_high): nine fixed line-ups at
// fixed enemy slots with a UnitPin per creature (level / HP / MP read from the owner's reference videos, skill pool, XPN / crit pins),
// the Chu Ma clone, the Hydra split, the Atula same-round revives and the Mehdi elite kit. No floor has a fixed level: a pinned unit
// fights at encounter level + (pin.level - floor.pinLevel) with HP / MP scaled along level^3 / 1000 (nineboss-rules.ts).
// Enemy slots: 0 centre, 1 / 2 / 3 / 4 = Right1 / Left1 / Right2 / Left2 (far row), 5 / 6 / 7 / 8 / 9 = pet row centre / R1 / L1 / R2 / L2.

import { NB_SKILL as S } from './nineboss-skills';

export interface UnitPin {
  level: number;
  hp: number;
  mp: number;
  skills?: readonly number[];
  defy?: number;
  critical?: number;
}

export interface Placement {
  creature: number;
  slot: number;
}

export interface NineFloor {
  floor: number;
  boss: string;
  bosses: readonly number[]; // the first one takes the centre slot
  pinLevel: number;
  lineup: readonly Placement[];
  pins: Readonly<Record<number, UnitPin>>;
  clone?: { creature: number; round: number }; // floor 3 Chu Ma Phân Thân, summoned once
  split?: { creature: number; perDeath: number; pool: number }; // floor 6 Hydra regeneration
  hpPct?: number;
  damagePct?: number;
  elite?: boolean; // floor 8 Sổ Tay Mehdi kit
  sameRoundRevives?: number; // floor 7 Atula
}

export const NB = {
  MP: 1_000_000,
  CHU_MA_CLONE_ROUND: 11,
  CHU_MA_HP_PCT: 150,
  CHU_MA_DAMAGE_PCT: 300,
  CHU_MA_DEFY: 40,
  CHU_MA_CRIT: 90,
  HYDRA_SPLIT_PER_DEATH: 3,
  HYDRA_CLONE_POOL: 60,
  HYDRA_DAMAGE_PCT: 150,
  ATULA_ROUND_REVIVES: 60,
} as const;

const pin = (level: number, hp: number, skills?: readonly number[], extra: Partial<UnitPin> = {}): UnitPin => ({ level, hp, mp: NB.MP, ...(skills ? { skills } : {}), ...extra });
const at = (creature: number, slot: number): Placement => ({ creature, slot });

// Floor 1 Ma Chiến: boss + five Phân Thân (1273 x4, 1315 x1), all at the boss value.
const MA_CHIEN = pin(150, 2_382_058, [S.CHIEN_VU, S.MA_THAN_TIEU_THIEN]);

// Floor 2 Quỷ Vương: the boss and all nine 1275-1283.
const quy = (...skills: number[]): UnitPin => pin(160, 2_667_905, skills);

// Floor 3 Chu Ma Vương (HP 150 % / damage 300 %, boss + clone XPN 40 / crit 90).
const CHU_MA_BOSS_HP = 11_332_881;
const chuMaBoss = pin(160, CHU_MA_BOSS_HP, [S.DIA_NGUC_LIEN_KICH, S.LUOI_HAI_TU_THAN], { defy: NB.CHU_MA_DEFY, critical: NB.CHU_MA_CRIT });
const thongLinh = [S.SAM_SET_NGAP_TROI, S.AC_MA_CHI_MONG, S.AC_MA_CHI_NO];

// Floor 4 Ma Hồn: seven units, every element carries Tương Sinh Nguyên Tố.
const element = (level: number, ...skills: number[]): UnitPin => pin(level, 12_239_511, [...skills, S.TUONG_SINH_NGUYEN_TO]);

// Floor 5 Avatar.
const saint = (level: number, ...skills: number[]): UnitPin => pin(level, 16_025_600, skills);

// Floor 6 Hydra: every unit at the post-split value.
const HYDRA = pin(160, 15_064_064, [S.PHONG_BAO_DIET_VONG, S.NGAY_DIET_VONG, S.DOC_DICH_CHI_MANG, S.DAI_LANG_THAO_THIEN]);

// Floor 9 Solomon: the 72 Trụ alternate between two readings.
const TRU_SKILLS = [S.MA_HON_CHI_LUC, S.MA_THAN_HIEN_TE, S.MA_THAN_LOAN_VU];
const tru = (hi: boolean): UnitPin => (hi ? pin(151, 44_794_590, TRU_SKILLS) : pin(149, 26_876_886, TRU_SKILLS));

export const NINE_FLOORS: readonly NineFloor[] = [
  {
    floor: 1, boss: 'Ma Chiến', bosses: [1272], pinLevel: 150,
    lineup: [at(1273, 1), at(1273, 2), at(1273, 5), at(1273, 6), at(1315, 7)],
    pins: { 1272: MA_CHIEN, 1273: MA_CHIEN, 1315: MA_CHIEN },
  },
  {
    floor: 2, boss: 'Quỷ Vương', bosses: [1274], pinLevel: 160,
    lineup: [at(1280, 3), at(1277, 1), at(1275, 2), at(1276, 4), at(1283, 8), at(1282, 6), at(1279, 5), at(1281, 7), at(1278, 9)],
    pins: {
      1274: pin(160, 4_192_423, [S.QUY_VUONG_CHI_NO, S.THUAT_HU_NHUOC, S.THUAT_CHU_DOC]),
      1275: quy(S.TRUNG_SINH_CHI_LUC, S.SINH_SINH_BAT_DIET), 1276: quy(S.KHO_MOC, S.LAO_THAI_LONG_CHUNG), 1277: quy(S.BENH, S.MA_THAN_NHAP_THE),
      1278: quy(S.TU_THAN_THAM_PHAN, S.TU_THAN_LOAN_VU), 1279: quy(S.VU_DIEU_MA_QUY), 1280: pin(159, 3_811_293, [S.NO_HOA_CONG_TAM]),
      1281: quy(S.NHAT_TIEN_THUONG_TAM), 1282: quy(S.KHO_DA), 1283: quy(S.SINH_CHI_LIEM),
    },
  },
  {
    floor: 3, boss: 'Chu Ma Vương', bosses: [1284], pinLevel: 160,
    lineup: [at(1287, 3), at(1285, 1), at(1286, 2), at(1288, 4), at(1289, 8), at(1290, 6), at(1291, 5)],
    clone: { creature: 1305, round: NB.CHU_MA_CLONE_ROUND },
    hpPct: NB.CHU_MA_HP_PCT, damagePct: NB.CHU_MA_DAMAGE_PCT,
    pins: {
      1284: chuMaBoss, 1305: chuMaBoss,
      1285: pin(159, 10_736_413, [S.LOAN_VU_TA_LINH, S.TRUONG_TA_LINH, S.LONG_QUAN_PHAN_KHOI]),
      1286: pin(160, 11_332_881, [S.LOI_NO_CHIEN_KIEM, S.CUONG_NO_CHIEN_Y]),
      1287: pin(159, 6_561_141, [S.VAN_TIEN_XUYEN_TAM]),
      1288: pin(159, 6_561_141),
      1289: pin(160, 4_771_739, thongLinh), 1290: pin(160, 6_561_141, thongLinh), 1291: pin(160, 6_561_141, thongLinh),
    },
  },
  {
    floor: 4, boss: 'Ma Hồn', bosses: [1269], pinLevel: 160,
    lineup: [at(1294, 3), at(1292, 1), at(1293, 2), at(1295, 4), at(1297, 6), at(1296, 5)],
    pins: {
      1269: pin(160, 25_385_653, [
        S.DANH_CAP_SUC_MANH, S.CU_LUC_KHAI_SON, S.BOC_PHA_NGUYEN_TO, S.NGU_SAC_RUC_RO, S.KHOI_DOC_DAY_DAC, S.THUAN_MA_PHAP, S.THUAN_VAT_LY,
      ]),
      1292: element(160, S.PHONG_SINH_THUY_KHOI), 1293: element(160, S.LIET_DIEM_PHAN_DIA), 1294: element(161, S.CHAP_CHON_SONG_VO),
      1295: element(160, S.DIA_HOA_PHAN_THIEN), 1296: element(159, S.ANH_SANG_NGUYEN_TO, S.QUANG_MINH_CHI_KIEM),
      1297: element(160, S.BONG_DEM_NGUYEN_TO, S.HAC_AM_CHI_KIEM),
    },
  },
  {
    floor: 5, boss: 'Avatar', bosses: [1307], pinLevel: 160,
    lineup: [at(1310, 3), at(1308, 1), at(1309, 2), at(1311, 4)],
    pins: {
      1307: pin(160, 44_070_400, [S.VO_TAN_THUONG_KHUNG, S.THU_LINH_THANH, S.PHAN_XA_THAU_KINH]),
      1308: saint(160, S.VAN_KIEM_QUYET, S.TANG_KIEM_QUYET), 1309: saint(160, S.DIEU_KHUC_MA_PHAP, S.CU_PHAO_MA_PHAP),
      1310: saint(161, S.TROI_BUOC_HU_KHONG, S.OANH_TAC_NGUYEN_TO), 1311: saint(160, S.THUAN_KICH_SIEU_CAP, S.HIEN_TE),
    },
  },
  {
    floor: 6, boss: 'Hydra', bosses: [1300], pinLevel: 160,
    lineup: [at(1301, 2), at(1301, 1), at(1301, 5)],
    split: { creature: 1301, perDeath: NB.HYDRA_SPLIT_PER_DEATH, pool: NB.HYDRA_CLONE_POOL },
    damagePct: NB.HYDRA_DAMAGE_PCT,
    pins: { 1300: HYDRA, 1301: HYDRA },
  },
  {
    floor: 7, boss: 'Atula', bosses: [1306], pinLevel: 150,
    lineup: [at(1306, 3), at(1306, 1), at(1306, 2), at(1306, 4), at(1306, 6), at(1306, 5), at(1306, 7)],
    sameRoundRevives: NB.ATULA_ROUND_REVIVES,
    pins: {
      1306: pin(150, 38_611_079, [S.XA_THAN_TAI_SINH, S.RUNG_TU_LA, S.NGHICH_CHUYEN_AM_DUONG, S.TU_LA_LUAN_HOI_1, S.TU_LA_LUAN_HOI_2]),
    },
  },
  {
    floor: 8, boss: 'Mehdi', bosses: [1304, 1303], pinLevel: 150, lineup: [], elite: true,
    pins: {
      1304: pin(150, 50_625_000, [S.THAM_PHAN_DIET_VONG, S.BUA_CHU_TUYET_VONG, S.VO_CUNG_VO_TAN, S.DIET_THAN_TRAM, S.THAN_MA_CUONG_VU]),
      1303: pin(150, 50_625_000),
    },
  },
  {
    floor: 9, boss: 'Solomon', bosses: [1312], pinLevel: 150,
    lineup: [at(1313, 2), at(1314, 1), at(1316, 4), at(1317, 3), at(1318, 5), at(1319, 7), at(1320, 6), at(1321, 9), at(1322, 8)],
    pins: {
      1312: pin(150, 44_794_590, [S.MA_CHI_QUYEN_CO, S.SOLOMON_CHI_NO, S.THO_SAN_MA_THAN]),
      1313: tru(true), 1314: tru(false), 1316: tru(true), 1317: tru(false), 1318: tru(true), 1319: tru(false), 1320: tru(true),
      1321: tru(false), 1322: tru(true),
    },
  },
];

export const nineFloor = (floor: number): NineFloor | undefined => NINE_FLOORS[floor - 1];

/** Every skill id the floors pin (kit test). */
export const NINE_KIT_SKILLS: readonly number[] = [
  ...new Set(NINE_FLOORS.flatMap((f) => Object.values(f.pins).flatMap((p) => p.skills ?? []))),
];
