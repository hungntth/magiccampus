// Vùng Đất Rèn Luyện unit pins (Go application/trials pins.go + pins_floors.go, read from the owner's clips of the original at level 150):
// HP / MP / attack / defence / skill pool per creature, scaled to the floor level along the creature curves (HP and MP level^3 / 1000,
// attack and defence level / 10). Pure data + scaling, no Nest. Never quote these numbers to players.

export const PIN_LEVEL = 150;
/** Skill-roll scales (Go BossSkillChanceScale / EscortSkillChanceScale): offensive 30 % -> 90 % / 60 %. */
export const BOSS_CHANCE_SCALE = 3;
export const ESCORT_CHANCE_SCALE = 2;
const REFERENCE_MP = 1_000_000;
const INT_MAX = 2_147_483_647;

export interface UnitPin {
  level: number;
  hp: number;
  mp: number;
  attack: number;
  magicAttack: number;
  defense: number;
  magicDefense: number;
  skills: readonly number[];
}

/** Go CreatureHPLevelMultiplier / CreatureDamageLevelMultiplier. */
const hpMult = (level: number): number => (level <= 0 ? 1 : Math.max(1, (level * level * level) / 1000));
const dmgMult = (level: number): number => (level <= 0 ? 1 : Math.max(1, level / 10));
const scaleValue = (v: number, ratio: number): number => (v <= 0 ? v : Math.min(Math.round(v * ratio), INT_MAX));

/** Go UnitPin.Scaled: the pin at `level`. */
export function scalePin(pin: UnitPin, level: number): UnitPin {
  if (pin.level <= 0 || level <= 0 || level === pin.level) return pin;
  const hp = hpMult(level) / hpMult(pin.level);
  const dmg = dmgMult(level) / dmgMult(pin.level);
  return {
    ...pin, level,
    hp: scaleValue(pin.hp, hp), mp: scaleValue(pin.mp, hp),
    attack: scaleValue(pin.attack, dmg), magicAttack: scaleValue(pin.magicAttack, dmg),
    defense: scaleValue(pin.defense, dmg), magicDefense: scaleValue(pin.magicDefense, dmg),
  };
}

const BOSS_DEFENSE = 60_000;
const ESCORT_DEFENSE = 40_000;
const COPY_DEFENSE = 20_000;

const unit = (hp: number, atk: number, def: number, skills: readonly number[], mp = REFERENCE_MP): UnitPin => ({
  level: PIN_LEVEL, hp, mp, attack: atk, magicAttack: atk, defense: def, magicDefense: def, skills,
});
const boss = (hp: number, atk: number, ...skills: number[]): UnitPin => unit(hp, atk, BOSS_DEFENSE, skills);
const escort = (hp: number, atk: number, ...skills: number[]): UnitPin => unit(hp, atk, ESCORT_DEFENSE, skills);

/** The VDRL block of data_tbl_skill (6381-6430) plus creature rows 1857 / 4030 seen in the clips. */
export const SK = {
  HAC_CHI_HON_KICH: 6381, VO_ANH_CHI_NHA: 6382, KICH_DONG_PHAN_NO: 6383, BONG_DEM_TU_THAN: 6384, LINH_VUC_TUYET_DOI: 6385,
  KHONG_CHE_TA_MA: 6386, Y_CHI_TA_MA: 6398, U_AM_BAO_PHONG: 6399, DOAN_KHONG_TRAM: 6400, NUOC_MAT_TU_THAN: 6401, HAC_AM_BAO_PHONG: 6402,
  HAC_AM_MONG_CANH: 6403, HAC_AM_KHONG_GIAN: 6404, TAN_CONG_DA_TRONG: 6405, DAM_LAY_SINH_TU: 6408, GAO_THET_KHUNG_BO: 6409,
  BONG_TOI_BAO_VAY: 6410, HU_KHONG_MP: 6413, HU_KHONG_VL: 6414, AM_TOC_VL: 6415, AM_TOC_MP: 6416, THAM_QUAN_DIA_NGUC: 6417,
  BAO_PHA_CHI_MANG: 6418, LINH_HON_XUYEN_KICH: 6419, KY_NANG_HUT_MAU: 6420, NGUYET_LUAN_TRAM: 6421, DU_PHONG_TRAM: 6422,
  PHONG_CHI_DAO: 6423, PHONG_CHI_THUONG: 6424, PHONG_CHI_PHE: 6425, PHONG_CHI_KICH: 6426, NGHICH_DAO_CHI_PHONG: 6428,
  LUAN_HOI_PHONG: 6429, LUAN_HOI_PHONG_NHOM: 6430, TINH_HA_CHAN_DONG: 1857, SUY_YEU_LINH_HON: 4030,
} as const;

export const CR = {
  THANATOS: 1814, KY_UC_THANATOS: 1815, BI_AI: 1816, THU_HAN: 1817, TUYET_VONG: 1818, PHAN_NO: 1819, PHAN_THAN_THANATOS: 1820,
  DEEVEN: 1846, BAO_PHONG_CHI_YEN: 1837, THU_VE_BAO_PHONG: 1838, CHIEN_SI_BAO_PHONG: 1840, HO_VE_BAO_PHONG: 1841, BAO_PHONG_CHI_NO: 1843,
  HO_VE_BAO_PHONG_VL: 1844, SU_GIA_BAO_PHONG: 1847,
  HAKA_LEEDS: 1802, ORLANDO: 1803, THU_VE_UU_LINH: 1794, PHU_THUY_HAC_AM: 1796, NU_VUONG_THAM_UYEN: 1797, PHAN_THAN_SU_GIA: 1795,
  PHAN_THAN_THU_VE: 1804, PHAN_THAN_SU_GIA_2: 1805, PHAN_THAN_PHU_THUY: 1806, PHAN_THAN_NU_VUONG: 1807,
  CATOS: 1821, POLLUX: 1822, EVILTA_MP: 1823, EVILTA_VL: 1824, MURPHYS_MP: 1825, MURPHYS_VL: 1826,
  KHAKASS: 1833, THI_TUNG: 1834, THI_GIA: 1835, THU_HO: 1836, ORLANDO_SUMMON: 1851,
} as const;

export const THANATOS_SKILLS = [SK.BONG_DEM_TU_THAN, SK.U_AM_BAO_PHONG, SK.HAC_AM_BAO_PHONG, SK.DOAN_KHONG_TRAM, SK.NUOC_MAT_TU_THAN];
export const DEEVEN_SKILLS = [SK.NGHICH_DAO_CHI_PHONG, SK.LUAN_HOI_PHONG, SK.LUAN_HOI_PHONG_NHOM, SK.TINH_HA_CHAN_DONG];
export const HAKA_SKILLS = [SK.THAM_QUAN_DIA_NGUC, SK.TAN_CONG_DA_TRONG, SK.LINH_HON_XUYEN_KICH];
export const ORLANDO_SKILLS = [SK.BAO_PHA_CHI_MANG, SK.DOAN_KHONG_TRAM, SK.KY_NANG_HUT_MAU, SK.HAC_AM_KHONG_GIAN];
export const CATOS_SKILLS = [SK.HU_KHONG_MP, SK.AM_TOC_MP, SK.THAM_QUAN_DIA_NGUC];
export const POLLUX_SKILLS = [SK.HU_KHONG_VL, SK.AM_TOC_VL, SK.BAO_PHA_CHI_MANG];
export const KHAKASS_SKILLS = [
  SK.LINH_VUC_TUYET_DOI, SK.KHONG_CHE_TA_MA, SK.Y_CHI_TA_MA, SK.DAM_LAY_SINH_TU, SK.GAO_THET_KHUNG_BO, SK.BONG_TOI_BAO_VAY, SK.THAM_QUAN_DIA_NGUC,
];

const BAO_PHONG_HP = 18_000_000;
const BAO_PHONG_ATK = 65_000;
const DEEVEN_COPY_HP = 24_626;
const DEEVEN_COPY_MP = 23_065;

export const THANATOS_PINS: Readonly<Record<number, UnitPin>> = {
  [CR.THANATOS]: boss(36_000_000, 120_000, ...THANATOS_SKILLS),
  [CR.KY_UC_THANATOS]: escort(24_000_000, 90_000, SK.BONG_DEM_TU_THAN, SK.DOAN_KHONG_TRAM),
  [CR.BI_AI]: escort(20_000_000, 70_000, SK.SUY_YEU_LINH_HON, SK.HAC_AM_MONG_CANH),
  [CR.THU_HAN]: escort(20_000_000, 70_000, SK.DOAN_KHONG_TRAM, SK.BAO_PHA_CHI_MANG),
  [CR.TUYET_VONG]: escort(20_000_000, 70_000, SK.HAC_AM_BAO_PHONG, SK.BONG_TOI_BAO_VAY),
  [CR.PHAN_NO]: escort(20_000_000, 70_000, SK.KICH_DONG_PHAN_NO, SK.VO_ANH_CHI_NHA),
  [CR.PHAN_THAN_THANATOS]: escort(15_000_000, 60_000, SK.U_AM_BAO_PHONG),
};

export const DEEVEN_PINS: Readonly<Record<number, UnitPin>> = {
  [CR.DEEVEN]: boss(49_590_840, 110_000, ...DEEVEN_SKILLS),
  [CR.CHIEN_SI_BAO_PHONG]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.NGUYET_LUAN_TRAM),
  [CR.SU_GIA_BAO_PHONG]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.DU_PHONG_TRAM, SK.SUY_YEU_LINH_HON),
  [CR.BAO_PHONG_CHI_NO]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.PHONG_CHI_DAO),
  [CR.BAO_PHONG_CHI_YEN]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.PHONG_CHI_THUONG),
  [CR.HO_VE_BAO_PHONG_VL]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.PHONG_CHI_PHE),
  [CR.THU_VE_BAO_PHONG]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.PHONG_CHI_KICH),
  [CR.HO_VE_BAO_PHONG]: escort(BAO_PHONG_HP, BAO_PHONG_ATK, SK.PHONG_CHI_PHE),
};

/** Deeven's one-hit copies (floor 2): 24 of creature 1846 with this pin. */
export const DEEVEN_COPY_PIN: UnitPin = unit(DEEVEN_COPY_HP, 80_000, COPY_DEFENSE, [SK.LUAN_HOI_PHONG], DEEVEN_COPY_MP);

export const LUAN_HOI_PINS: Readonly<Record<number, UnitPin>> = {
  [CR.HAKA_LEEDS]: boss(30_000_000, 100_000, ...HAKA_SKILLS),
  [CR.THU_VE_UU_LINH]: escort(20_000_000, 70_000, SK.DOAN_KHONG_TRAM),
  [CR.PHU_THUY_HAC_AM]: escort(20_000_000, 70_000, SK.HAC_AM_MONG_CANH, SK.HAC_AM_BAO_PHONG),
  [CR.NU_VUONG_THAM_UYEN]: escort(20_000_000, 70_000, SK.HAC_AM_KHONG_GIAN, SK.SUY_YEU_LINH_HON),
  [CR.ORLANDO]: boss(52_000_000, 130_000, ...ORLANDO_SKILLS),
  [CR.PHAN_THAN_SU_GIA]: escort(18_000_000, 65_000, SK.DOAN_KHONG_TRAM),
  [CR.PHAN_THAN_THU_VE]: escort(18_000_000, 65_000, SK.DOAN_KHONG_TRAM),
  [CR.PHAN_THAN_SU_GIA_2]: escort(18_000_000, 65_000, SK.HAC_AM_BAO_PHONG),
  [CR.PHAN_THAN_PHU_THUY]: escort(18_000_000, 65_000, SK.HAC_AM_MONG_CANH),
  [CR.PHAN_THAN_NU_VUONG]: escort(18_000_000, 65_000, SK.HAC_AM_KHONG_GIAN),
};

export const VAN_MENH_PINS: Readonly<Record<number, UnitPin>> = {
  [CR.CATOS]: boss(55_000_000, 130_000, ...CATOS_SKILLS),
  [CR.POLLUX]: boss(55_000_000, 130_000, ...POLLUX_SKILLS),
  [CR.EVILTA_MP]: escort(22_000_000, 75_000, SK.HU_KHONG_MP),
  [CR.EVILTA_VL]: escort(22_000_000, 75_000, SK.HU_KHONG_VL),
  [CR.MURPHYS_MP]: escort(22_000_000, 75_000, SK.AM_TOC_MP),
  [CR.MURPHYS_VL]: escort(22_000_000, 75_000, SK.AM_TOC_VL),
};

export const KHAKASS_PINS: Readonly<Record<number, UnitPin>> = {
  [CR.KHAKASS]: boss(65_000_000, 150_000, ...KHAKASS_SKILLS),
  [CR.THI_TUNG]: escort(25_000_000, 85_000, SK.HAC_CHI_HON_KICH, SK.KHONG_CHE_TA_MA),
  [CR.THI_GIA]: escort(25_000_000, 85_000, SK.GAO_THET_KHUNG_BO, SK.SUY_YEU_LINH_HON),
  [CR.THU_HO]: escort(25_000_000, 85_000, SK.BONG_TOI_BAO_VAY, SK.DOAN_KHONG_TRAM),
};

/** Khakass's summoned Orlando (creature 1851): a boss-grade pin with Orlando's pool. */
export const KHAKASS_ORLANDO_PIN: UnitPin = boss(52_000_000, 130_000, ...ORLANDO_SKILLS);
