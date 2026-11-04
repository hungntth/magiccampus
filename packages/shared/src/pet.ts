// Pets (M4 phase A): wire types for the pet list, pet pushes and the pet login fields, plus the pet exp table.
// Flash keys are kept (petName, aptStrengthEx, skill1..15, equ1..8, attLastPoint ...); resource codes are strings.

import type { PetSkillInfoMap } from './petGear.js';

export const PetState = { BATTLE: 1, FOLLOW: 2, REST: 3 } as const;
export type PetStateValue = (typeof PetState)[keyof typeof PetState];

export const PetLimits = { defaultSlots: 6, maxSlots: 180, maxLevel: 160, maxLife: 10000, nameMax: 20 } as const;
export const PET_ATTR_POINTS_PER_LEVEL = 5;
/** Growth colour bands (Flash PET_GROWRATE_NUM): index 0..4 by the largest band the growth rate reaches. */
export const PET_GROWRATE_BANDS: readonly number[] = [1.1, 1.3, 1.6, 2.0, 2.5];

/**
 * Cumulative pet exp: reaching level L needs PET_LEVEL_EXP[L - 1] (160 entries). Copied from Flash
 * GamePredef.as PET_LEVEL_EXP; identical to Go pet.go petLevelExpTable (diffed 2026-11-04).
 */
export const PET_LEVEL_EXP: readonly number[] = [
  1, 37, 179, 463, 888, 1581, 2680, 4325,
  6616, 9255, 12886, 19322, 31213, 49015, 69805, 93850,
  121427, 152817, 188310, 228201, 272794, 358506, 453418, 558086,
  673075, 798961, 936328, 1085772, 1247900, 1423324, 1612670, 1936457,
  2284377, 2657466, 3056773, 3483360, 3938305, 4422698, 4937643, 5484258,
  6063673, 6979240, 7947201, 8969301, 10047304, 11182993, 12378169, 13634650,
  14954273, 16338895, 17790387, 19954965, 22220163, 24588721, 27063404, 29647001,
  32342325, 35152212, 38079523, 41127141, 44297972, 48820569, 53520251, 58401098,
  63467221, 68722762, 74171894, 79818817, 85667765, 91722998, 100062792, 108688613,
  117606251, 126821534, 136340327, 146168532, 156312093, 166776986, 177569228, 188694871,
  200160005, 215493572, 240567939, 272316033, 304987655, 338598703, 373165165, 408703121,
  445228737, 482758269, 521308060, 569351388, 618672921, 669292812, 721231319, 774508801,
  829145723, 885162653, 942580260, 1001419317, 1061700697, 1182295769, 1305790007, 1432224766,
  1561641599, 1694082252, 1829588662, 1968202959, 2109967465, 2254924690, 2403117335, 2664859140,
  2932340298, 3205635566, 3484820024, 3769969072, 4061158427, 4358464126, 4661962520, 4971730275,
  5307724846, 5779444415, 6260985265, 6752441643, 7299495631, 7857572191, 8426774140, 9055573472,
  9696648077, 10350109337, 11118523915, 12006372005, 13017819030, 14157084269, 15428440856, 16836215782,
  18384789894, 20078597895, 21922128344, 23919923656, 25879326819, 28052816023, 30354474074, 32854459997,
  35493089857, 38274713134, 41230694030, 44325896939, 47563908041, 51019197363, 54628101576, 58459554672,
  62446393595, 66587287311, 70885904916, 75343749163, 79969730199, 84768446197, 89719586902, 94838109102,
];

/** Flash PetLogic.expToLv: the first index whose threshold is above exp is the level; exp <= 0 is level 1; capped. */
export function petLevelOfExp(exp: number): number {
  if (!(exp > 0)) return 1;
  for (let i = 0; i < PET_LEVEL_EXP.length; i++) if (exp < PET_LEVEL_EXP[i]) return Math.max(1, i);
  return PET_LEVEL_EXP.length;
}

/** Flash PetLogic.lvToExp: cumulative exp that starts level `level` (0 for level <= 0). */
export function petExpOfLevel(level: number): number {
  if (level <= 0) return 0;
  return PET_LEVEL_EXP[Math.min(level, PET_LEVEL_EXP.length) - 1];
}

/** Panel `property` (final stats + free points + growth), replaced wholesale by onRefreshPetProp. */
export interface PetProperty {
  finalHp: number; finalMp: number; finalSp: number;
  finalAttack: number; finalMAttack: number; finalDefence: number; finalMDefence: number;
  finalHit: number; finalCritical: number; finalDodge: number; finalSpeed: number;
  finalStrength: number; finalAgility: number; finalStamina: number; finalIntelligence: number; finalEnergy: number;
  lastPoint: number; // free attribute points
  growRate: number; growRateAdd: number;
}

export type PetSkillKey = `skill${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`;
export type PetEquKey = `equ${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

/** The pet `data` block (Flash keys). skillN: -1 locked, 0 empty, > 0 skill id; equN: item id or 0. */
export interface PetView extends Record<PetSkillKey, number>, Record<PetEquKey, number> {
  id: number;
  characterId: number;
  tid: number; // creature template
  petName: string;
  level: number; // H5: sent as well; the Flash client derives it from exp
  exp: number; // cumulative
  growRate: number;
  growRateAdd: number;
  state: number; // PetState
  binded: number; // 0 / 1
  following: boolean;
  currentHp: number;
  currentMp: number;
  life: number; // 0..10000
  close: number; // intimacy, always 0
  element: number;
  upgradeNum: number;
  attLastPoint: number; // free attribute points
  aptStrength: number; aptAgility: number; aptStamina: number; aptIntelligence: number; aptEnergy: number; // creature per-mille
  aptStrengthEx: number; aptAgilityEx: number; aptStaminaEx: number; aptIntelligenceEx: number; aptEnergyEx: number;
  // H5: creature template facts the Flash client reads from TBL_CREATURE (creatureData).
  creatureName: string;
  classId: number;
  qLevel: number;
  useLv: number;
  resCode: string;
  iconCode: string;
  colorCode: string;
  property: PetProperty;
  /** H5: display facts of the learned skill ids (skillN > 0), keyed by skill id. */
  skillInfo?: PetSkillInfoMap;
}

export interface PetWrapper {
  id: number;
  data: PetView;
}

/** initViewPetMngP reply: every pet keyed by id. */
export type InitViewPetMngPResult = Record<number, PetWrapper>;

/** changePetProperty arg (strings like the Flash client; "" = 0). */
export interface ChangePetPropertyArg {
  addStrength: string; addAgility: string; addStamina: string; addIntelligence: string; addEnergy: string;
}

/** Keys of `onUpdatePet(petId, key, value)`; values are numbers except petName. */
export type PetUpdateKey =
  | 'state' | 'binded' | 'petName' | 'life' | 'exp' | 'level' | 'currentHp' | 'currentMp' | 'attLastPoint'
  | 'aptStrengthEx' | 'aptAgilityEx' | 'aptStaminaEx' | 'aptIntelligenceEx' | 'aptEnergyEx' | PetSkillKey | PetEquKey;

/** Following pet on the map: `showPetObj` (PlayerData, SceneCharacter) and the `onCreatePet` petData. */
export interface PetSceneView {
  id: number;
  cid: number;
  tid: number;
  name: string;
  level: number;
  resCode: string;
  colorCode: string;
  iconCode: string;
  element: number;
}

/** onCreatePet push arg; onCancelPet carries just the owner cid. */
export interface OnCreatePetPush {
  cid: number; // owner
  petData: PetSceneView;
}

/** Pet part of the login payload. petList holds the unwrapped `data` blocks keyed by pet id. */
export interface PetLoginInfo {
  petMaxNum: number;
  showPetId: number; // following pet id, -1 when none
  petList: Record<number, PetView>;
  showPetObj?: PetSceneView;
}

/** Flash Basic.colorByGrowRate: first band index with rate <= band (0 white .. 4 orange), else 4. */
export function petGrowColor(growRate: number): number {
  const i = PET_GROWRATE_BANDS.findIndex((b) => growRate <= b);
  return i < 0 ? 4 : i;
}
