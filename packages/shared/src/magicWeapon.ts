// Magic weapon (Thần Khí) contract: kind-8 equipment at positions 15 (main) and 16..20 (sub). Constants and pure helpers shared by
// the server and the client, plus the reply shapes of mWeaponUpgrade, getSpiritRequire, magicWeapon{Repair,AllRepair,Resolve,
// ResetProp,ResetSkill}, MWTrans, queryMWResetPropMax, getMWSkills, showMWInfo, activateMWPro and the H5 helper getMWPanel.

export const MW = {
  KIND: 8,
  MAIN_TYPE: 800,
  SUB_TYPE: 801,
  MAIN_POSITION: 15,
  SUB_FIRST: 16,
  SUB_LAST: 20,
  UNLOCK_LEVEL: 50,
  MAX_LEVEL: 50,
  /** Upgrading to this level or beyond needs player level 100 (EquiptFuncPanel S[180]). */
  LEVEL100_FROM: 16,
  PLAYER_LEVEL_FOR_HIGH: 100,
  RESET_LEVEL: 5,
  RESET_SPIRIT: 40000,
  RESET_STONES: 5,
  /** One Thâm Lam Tinh restores this much durability (MAGIC_WEAPON_REPAIR_ENDURE_BASIC). */
  REPAIR_BASE: 500,
  RESOLVE_REFUND_PCT: 40,
  ACTIVATE_GOLD: 20,
  ACTIVATE_LEVEL: 50,
  SKILL_SLOTS: 10,
} as const;

/** Item templates of the stones: repair (type 510), skill reset (511), transfer (514), prop reset (519), stage crystal (522). */
export const MW_STONE_TID = { repair: 2330, skillReset: 2331, trans: 2356, propReset: 3228, crystal: 4758 } as const;

export type MWFailType = 1 | 2 | 3;

export interface MWUpgradeReply {
  succ: boolean;
  level?: number;
  /** Spirituality of the NEXT upgrade (0 / absent = already at the top). */
  require?: number;
  color?: number;
  failType?: MWFailType;
  msg?: string;
  /** H5: the attempt was paid but the roll failed (the level did not change). */
  rolled?: boolean;
}

/** getSpiritRequire reply: Flash reads `value`; rate / itemNum / itemHave are H5 additions for the upgrade tab. */
export interface MWSpiritRequire {
  value: number;
  rate?: number;
  itemNum?: number;
  itemHave?: number;
}

export interface MWRepairReply {
  succ: boolean;
  /** Stones left in the bag. */
  num: number;
}

export interface MWResolveReply {
  succ: boolean;
  type: number;
  giid: number;
  stackNum: number;
  temp_quality: number;
}

export interface MWTransReply {
  succ: boolean;
  msg?: string;
  num: number;
}

export interface MWResetMaxReply {
  succ: boolean;
  maxMainPropNum1: number;
  maxMainPropNum2: number;
}

export interface MWResetPropReply {
  succ: boolean;
  num: number;
  /** H5: the committed values (single phase). */
  mainPropNum1?: number;
  mainPropNum2?: number;
}

/** updateMWResetView push: repaints the reset tab when the open item matches. */
export interface MWResetView {
  itemId: number;
  mainPropNum1: number;
  mainPropNum2: number;
}

/** getMWSkills: position ("1".."10") -> skill id. */
export type MWSkills = Record<string, number>;

export interface MWResetSkillReply {
  succ: boolean;
  num: number;
  sid: number;
  /** H5: name of the new skill (the client has no skill tables). */
  name?: string;
}

/** One activated sub-weapon line. */
export interface MWSuccLine {
  propType: number;
  propVal: number;
}
export type MWFlag = Partial<Record<'succ0' | 'succ1' | 'succ2', MWSuccLine>>;

export interface MWInfoReply {
  flag: MWFlag;
}

export type MWActivateReply = { index: number; flag: MWSuccLine } | { f: true; index: number };

/** H5 helper getMWPanel: everything the Thần khí operation tabs show for one item (the client has no static tables). */
export interface MWPanelInfo {
  equipId: number;
  tid: number;
  name: string;
  main: boolean;
  position: number;
  worn: boolean;
  binded: boolean;
  level: number;
  color: number;
  durability: number;
  maxDurability: number;
  /** Effective stat lines (instance rolls, template fallback). */
  mainProp1: number;
  mainProp2: number;
  mainPropNum1: number;
  mainPropNum2: number;
  /** Reset-prop range: template value .. template x 2. */
  tplPropNum1: number;
  tplPropNum2: number;
  /** Next upgrade (null at the top or for a sub weapon). */
  next: { level: number; spirit: number; itemNum: number; rate: number; propNum1: number; propNum2: number } | null;
  skills: { pos: number; sid: number; name: string; description: string }[];
  flag: MWFlag;
  /** Counters of the player at the time of the call. */
  spirituality: number;
  stones: { repair: number; skillReset: number; trans: number; propReset: number; crystal: number };
}

/** Item colour (ColorCode) of a magic weapon by upgrade level (legacy upgrade.go): 2 from +1, 3 from +6, 4 from +11, 5 from +16. */
export function mwColorByLevel(level: number): number {
  if (level >= 16) return 5;
  if (level >= 11) return 4;
  if (level >= 6) return 3;
  if (level >= 1) return 2;
  return 0;
}

/** True for the equip positions of the magic weapons (15 main, 16..20 sub). */
export function isMwPosition(position: number): boolean {
  return position >= MW.MAIN_POSITION && position <= MW.SUB_LAST;
}

/**
 * Thâm Lam Tinh needed to repair: ceil(missing / 500) per item (client cost line of the all-repair button). `missing` = durability
 * lost per item; zero or negative entries need nothing.
 */
export function mwRepairStones(missing: readonly number[]): number {
  const total = missing.reduce((sum, m) => sum + Math.max(0, Math.trunc(m)), 0);
  return Math.ceil(total / MW.REPAIR_BASE);
}

/** Sub-weapon line ranges (legacy formulas.go ActivateMWPro / client ACTIVATE_MW_PRO); hit / dodge / critical are fractional. */
export const MW_PRO_RANGE: Readonly<Record<number, { min: number; max: number }>> = {
  1: { min: 1200, max: 12000 }, 2: { min: 50, max: 500 }, 4: { min: 300, max: 3000 }, 5: { min: 240, max: 2400 },
  6: { min: 1000, max: 10000 }, 7: { min: 1000, max: 10000 }, 8: { min: 0.5, max: 5 }, 9: { min: 0.5, max: 5 },
  11: { min: 120, max: 1200 }, 13: { min: 0.4, max: 4 }, 27: { min: 0.4, max: 4 },
};
