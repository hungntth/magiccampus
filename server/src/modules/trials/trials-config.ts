// Vùng Đất Rèn Luyện floor tables (Go application/trials config.go + pins_floors.go): per floor the boss / escort creatures, the pin table,
// the mid-battle summon (Deeven copies, Khakass's Orlando), the Luân Hồi guard wave (floor 3 has two stages) and the death-rule markers
// (Deeven guarded revive, Catos / Pollux twins, Khakass copying every boss pool). Level / time / lives / maps are in shared TRIALS_FLOORS.

import {
  CATOS_SKILLS, CR, DEEVEN_COPY_PIN, DEEVEN_PINS, DEEVEN_SKILLS, HAKA_SKILLS, KHAKASS_ORLANDO_PIN, KHAKASS_PINS, KHAKASS_SKILLS, LUAN_HOI_PINS,
  ORLANDO_SKILLS, POLLUX_SKILLS, THANATOS_PINS, THANATOS_SKILLS, VAN_MENH_PINS, type UnitPin,
} from './trials-pins';

export interface SummonCfg {
  creature: number;
  count: number;
  startRound: number;
  perRound: number;
  every: number;
  refill: boolean;
  pin: UnitPin;
}

export interface TrialsFloorCfg {
  floor: number;
  bosses: readonly number[];
  /** Boss creature -> its own skill pool (the boss-roll pool; Khakass adds every other floor's). */
  bossSkills: Readonly<Record<number, readonly number[]>>;
  escorts: readonly number[];
  pins: Readonly<Record<number, UnitPin>>;
  summon?: SummonCfg;
  /** Floor 3 stage 0: [boss, ...escorts] of the four Luân Hồi monsters. */
  guardWave?: readonly number[];
  reviveGuards?: readonly number[];
  twins?: boolean;
  copiesBossSkills?: boolean;
}

export const TRIALS_CFG: readonly TrialsFloorCfg[] = [
  {
    floor: 1, bosses: [CR.THANATOS], bossSkills: { [CR.THANATOS]: THANATOS_SKILLS },
    escorts: [CR.KY_UC_THANATOS, CR.BI_AI, CR.THU_HAN, CR.TUYET_VONG, CR.PHAN_NO, CR.PHAN_THAN_THANATOS, CR.PHAN_THAN_THANATOS],
    pins: THANATOS_PINS,
  },
  {
    floor: 2, bosses: [CR.DEEVEN], bossSkills: { [CR.DEEVEN]: DEEVEN_SKILLS },
    escorts: [CR.CHIEN_SI_BAO_PHONG, CR.SU_GIA_BAO_PHONG, CR.BAO_PHONG_CHI_NO, CR.BAO_PHONG_CHI_YEN, CR.HO_VE_BAO_PHONG_VL, CR.THU_VE_BAO_PHONG, CR.HO_VE_BAO_PHONG],
    pins: DEEVEN_PINS,
    summon: { creature: CR.DEEVEN, count: 24, startRound: 2, perRound: 2, every: 1, refill: true, pin: DEEVEN_COPY_PIN },
    reviveGuards: [CR.CHIEN_SI_BAO_PHONG, CR.SU_GIA_BAO_PHONG, CR.BAO_PHONG_CHI_NO, CR.BAO_PHONG_CHI_YEN],
  },
  {
    floor: 3, bosses: [CR.ORLANDO], bossSkills: { [CR.ORLANDO]: ORLANDO_SKILLS, [CR.HAKA_LEEDS]: HAKA_SKILLS },
    escorts: [CR.PHAN_THAN_SU_GIA, CR.PHAN_THAN_THU_VE, CR.PHAN_THAN_SU_GIA_2, CR.PHAN_THAN_PHU_THUY, CR.PHAN_THAN_NU_VUONG],
    pins: LUAN_HOI_PINS,
    guardWave: [CR.HAKA_LEEDS, CR.THU_VE_UU_LINH, CR.PHU_THUY_HAC_AM, CR.NU_VUONG_THAM_UYEN],
  },
  {
    floor: 4, bosses: [CR.CATOS, CR.POLLUX], bossSkills: { [CR.CATOS]: CATOS_SKILLS, [CR.POLLUX]: POLLUX_SKILLS },
    escorts: [CR.EVILTA_MP, CR.EVILTA_VL, CR.MURPHYS_MP, CR.MURPHYS_VL],
    pins: VAN_MENH_PINS, twins: true,
  },
  {
    floor: 5, bosses: [CR.KHAKASS], bossSkills: { [CR.KHAKASS]: KHAKASS_SKILLS },
    escorts: [CR.THI_TUNG, CR.THI_GIA, CR.THU_HO],
    pins: KHAKASS_PINS, copiesBossSkills: true,
    summon: { creature: CR.ORLANDO_SUMMON, count: 1, startRound: 3, perRound: 1, every: 1, refill: false, pin: KHAKASS_ORLANDO_PIN },
  },
];

export const trialsCfg = (floor: number): TrialsFloorCfg | undefined => TRIALS_CFG[floor - 1];

/** Go Floor.Stages: the guard-wave floor has two (4 monsters, then the guardian boss). */
export const stageCount = (cfg: TrialsFloorCfg): number => (cfg.guardWave && cfg.guardWave.length > 0 ? 2 : 1);

/** Go Floor.Lineup: stage 0 of a guard-wave floor fields the wave, otherwise bosses + escorts. */
export function stageLineup(cfg: TrialsFloorCfg, stage: number): { bosses: readonly number[]; escorts: readonly number[] } {
  if (stage === 0 && cfg.guardWave && cfg.guardWave.length > 0) return { bosses: cfg.guardWave.slice(0, 1), escorts: cfg.guardWave.slice(1) };
  return { bosses: cfg.bosses, escorts: cfg.escorts };
}

/** Go Floor.BossSkillPool: the boss's own pool; Khakass copies every other floor's boss pools after his own. */
export function bossSkillPool(cfg: TrialsFloorCfg, creature: number): number[] {
  const own = cfg.bossSkills[creature] ?? [];
  if (!cfg.copiesBossSkills) return [...own];
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (ids: readonly number[]): void => {
    for (const id of ids) if (id > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  add(own);
  for (const other of TRIALS_CFG) {
    if (other.floor === cfg.floor) continue;
    for (const b of other.bosses) add(other.bossSkills[b] ?? []);
  }
  return out;
}

/** Display name of the stage's boss (trainer menu button, stage-clear note). */
export function stageBossName(cfg: TrialsFloorCfg, stage: number, floorName: string): string {
  return stage === 0 && cfg.guardWave && cfg.guardWave.length > 0 ? '4 quái vật Luân Hồi' : floorName;
}

/** Every skill id any pool references (the boss-kits walk test). */
export const TRIALS_SKILL_IDS: readonly number[] = [...new Set(TRIALS_CFG.flatMap((c) => [
  ...Object.values(c.pins).flatMap((p) => p.skills),
  ...Object.values(c.bossSkills).flat(),
  ...(c.summon ? c.summon.pin.skills : []),
]))];
