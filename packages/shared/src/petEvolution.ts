// M12 Phase B pet evolution wire types and pure feather / contract progression rules.

import { PET_FEATHER_STEPS } from './petFeatherSteps.js';

export interface PetEvolutionInfo { envo: boolean; round: number; stage: number; }
export interface PetHandbookEntry { pid: number; actived: boolean; activedNum: number; }
export type ActivePetObject = Record<string, PetHandbookEntry>;
export interface PetContract { hp: number; hpExp: number; speed: number; speedExp: number; physics: number; physicsExp: number; magic: number; magicExp: number; }
export const EMPTY_PET_CONTRACT: PetContract = { hp: 0, hpExp: 0, speed: 0, speedExp: 0, physics: 0, physicsExp: 0, magic: 0, magicExp: 0 };
export type PetContractType = 1 | 2 | 3 | 4;
/** Login extension owned by the evolution / handbook feature. */
export interface PetEvolutionLoginInfo {
  activePetObject?: ActivePetObject;
  contractPet?: PetContract;
}

export interface FeatherResult { success: boolean; round: number; stage: number; protect: boolean; }
/** toPetEnvolution reply (= onEnvolution push). */
export interface PetEvolveReply { pid: number; tid: number; envo: PetEvolutionInfo; }
/** toPetFeather (num 1) / toPetFeatherNextStep (num 100) reply (= onFeather / OnFeatherNextStep push). */
export interface PetFeatherReply extends FeatherResult { pid: number; num?: number; }

export const FEATHER_ROUND_MAX = 3; // Cảnh Giới 0..2
export const FEATHER_STAGE_MAX = 9; // cấp 0..9 inside a round; only round 2 can rest at stage 9 (the cap)
/** GamePredef PET_ENVOLUTION_FEATHER_PARAM: Năng Lượng Tự Nhiên per cost unit. */
export const PET_ENVOLUTION_FEATHER_PARAM = 5;
/** Item id of Bùa Cầu Nguyện (the feather protection charm). */
export const FEATHER_PROTECT_ITEM = 3911;

/** [round][stage 0..8] success percent: PetEvolutionPanel.PET_ENVOLUTION_FEATHER_STEP_RAN (= Go evolution_table.go featherSuccessRate). */
export const FEATHER_SUCCESS: readonly (readonly number[])[] = [
  [35, 29, 24, 30, 24, 20, 25, 20, 20],
  [29, 24, 23, 24, 21, 18, 20, 18, 16],
  [30, 24, 19, 24, 20, 16, 24, 18, 12],
];
/** GamePredef.as:3237 PET_ENVOLUTION_FEATHER_COST (x PET_ENVOLUTION_FEATHER_PARAM Năng Lượng Tự Nhiên per try). */
export const PET_ENVOLUTION_FEATHER_COST: readonly (readonly number[])[] = [
  [10, 10, 10, 20, 20, 20, 30, 30, 30],
  [15, 15, 15, 30, 30, 30, 45, 45, 45],
  [20, 20, 20, 40, 40, 40, 60, 60, 60],
];
/** GamePredef.as:3238 PET_ENVOLUTION_FEATHER_COST_GOLD (the "tăng 1 điểm" jump; the client literal 0x1900 is 6400). */
export const PET_ENVOLUTION_FEATHER_COST_GOLD: readonly (readonly number[])[] = [
  [600, 500, 400, 1900, 1800, 1500, 3900, 3700, 3100],
  [1100, 1000, 800, 3500, 3400, 2800, 7700, 7500, 6400],
  [1600, 1500, 1300, 5700, 5600, 4700, 12000, 11500, 10000],
];
/** GamePredef.as:3239 PET_ENVOLUTION_FEATHER_COST_PROTECT: Bùa Cầu Nguyện charms (non-milestone stages only). */
export const PET_ENVOLUTION_FEATHER_COST_PROTECT: readonly (readonly number[])[] = [
  [0, 1, 2, 0, 1, 4, 0, 2, 9],
  [0, 1, 3, 0, 1, 8, 0, 3, 16],
  [0, 1, 4, 0, 2, 12, 0, 3, 18],
];

/** Natural-energy cost of one feather try at a (normalised, non-cap) state. */
export const featherNpCost = (info: Pick<PetEvolutionInfo, 'round' | 'stage'>): number =>
  PET_ENVOLUTION_FEATHER_PARAM * (PET_ENVOLUTION_FEATHER_COST[info.round]?.[info.stage] ?? 0);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.trunc(n) || 0));
}

/** Go featherPet normalisation: clamps the state; a stored stage 9 in round 0/1 is healed to stage 0 of the next round. */
export function normalizeFeather(info: PetEvolutionInfo): PetEvolutionInfo {
  let round = clamp(info.round, 0, FEATHER_ROUND_MAX - 1);
  let stage = clamp(info.stage, 0, FEATHER_STAGE_MAX);
  if (stage >= FEATHER_STAGE_MAX && round < FEATHER_ROUND_MAX - 1) { round++; stage = 0; }
  return { envo: info.envo, round, stage };
}

/** Round 2 stage 9: nothing left to feather. */
export const featherAtCap = (info: Pick<PetEvolutionInfo, 'round' | 'stage'>): boolean =>
  info.round >= FEATHER_ROUND_MAX - 1 && info.stage >= FEATHER_STAGE_MAX;

/** Go advanceFeather: reaching stage 9 of round 0/1 rolls straight over to stage 0 of the next round. */
export function advanceFeather(info: PetEvolutionInfo, steps: number): PetEvolutionInfo {
  let round = info.round;
  let stage = info.stage + steps;
  if (stage >= FEATHER_STAGE_MAX) {
    stage = FEATHER_STAGE_MAX;
    if (round < FEATHER_ROUND_MAX - 1) { round++; stage = 0; }
  }
  return { envo: info.envo, round, stage };
}

/** Charms a protected try uses: only non-milestone stages (stage % 3 != 0) can be protected. */
export const featherProtectNeed = (info: Pick<PetEvolutionInfo, 'round' | 'stage'>): number =>
  info.stage % 3 === 0 ? 0 : (PET_ENVOLUTION_FEATHER_COST_PROTECT[info.round]?.[info.stage] ?? 0);

function checkFeather(info: PetEvolutionInfo): void {
  if (!info.envo || info.round < 0 || info.round >= FEATHER_ROUND_MAX || info.stage < 0 || info.stage > FEATHER_STAGE_MAX) {
    throw new RangeError('bad evolution state');
  }
}

/**
 * One feather try without charging anything (Go FeatherPet). `protect` = the protection charms were paid for this try:
 * a failure then keeps the stage; unprotected failures drop to the milestone floor(stage / 3) * 3. The realm never drops.
 * The cap (round 2 stage 9) stays put and reports a failure.
 */
export function featherAttempt(info: PetEvolutionInfo, success: boolean, protect: boolean): FeatherResult {
  checkFeather(info);
  if (featherAtCap(info)) return { success: false, round: info.round, stage: info.stage, protect: false };
  const protectedTry = protect && info.stage % 3 !== 0;
  if (success) {
    const next = advanceFeather(info, 1);
    return { success: true, round: next.round, stage: next.stage, protect: protectedTry };
  }
  if (protectedTry) return { success: false, round: info.round, stage: info.stage, protect: true };
  return { success: false, round: info.round, stage: Math.floor(info.stage / 3) * 3, protect: false };
}

/** Gold jump ("Tăng 1 điểm"): to stage (floor(stage / 3) + 1) * 3; stage 9 of round 0/1 carries into the next round. */
export function featherNextStep(info: PetEvolutionInfo): FeatherResult {
  checkFeather(info);
  if (featherAtCap(info)) return { success: false, round: info.round, stage: info.stage, protect: false };
  const target = (Math.floor(info.stage / 3) + 1) * 3;
  const next = advanceFeather(info, target - info.stage);
  return { success: true, round: next.round, stage: next.stage, protect: false };
}

/** Whether the evolved creature has a Vu Hoa table (Go ErrFeatherUnavailable otherwise). */
export const hasFeatherTable = (tid: number): boolean => PET_FEATHER_STEPS[tid] !== undefined;

/** Vu Hoa aptitude by stat key (feather table attr order 0 str, 1 sta, 2 agi, 3 int, 4 eng). */
export interface FeatherAptitudes { str: number; sta: number; agi: number; int: number; eng: number; }
const NO_FEATHER_APT: FeatherAptitudes = { str: 0, sta: 0, agi: 0, int: 0, eng: 0 };

/** Total Vu Hoa aptitude of an evolved creature `tid` at its feather state; zeros for unevolved pets / unknown creatures. */
export function featherAptitudes(tid: number, info: PetEvolutionInfo | null | undefined): FeatherAptitudes {
  const table = info?.envo ? PET_FEATHER_STEPS[tid] : undefined;
  if (!table || !info) return NO_FEATHER_APT;
  const { round, stage } = normalizeFeather(info);
  const at = (attr: number): number => table[attr]?.[round]?.[stage] ?? 0;
  return { str: at(0), sta: at(1), agi: at(2), int: at(3), eng: at(4) };
}
