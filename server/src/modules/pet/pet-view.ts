// DTO builders: Pet row + creature template -> the shared PetView / PetProperty / PetWrapper (Flash `data` block).

import { featherAptitudes, petSoulInfoWire } from '@mc/shared';
import type {
  PetAptitudeExtras, PetEquKey, PetProperty, PetSceneView, PetSkillInfoMap, PetSkillKey, PetView, PetWrapper,
} from '@mc/shared';
import type { AttrKey } from '../character/character-stats';
import type { PetTemplate } from '../gamedata/pet-data';
import type { Pet } from './pet.schema';
import { petStats, toPetProperty, type PetBonuses, type PetStats } from './pet-stats';
import { creatureClassIds } from './pet-owned';
import { PET_EQU_SLOTS, PET_SKILL_SLOTS } from './pet-rules';
import type { PetBonusLookups } from './pet-bonus';

/** Per-pet extras the async layer resolves: gear / passive bonuses and the learned skills' display facts. */
export interface PetExtras {
  bonuses?: PetBonuses;
  skillInfo?: PetSkillInfoMap;
}

/** Display facts of the learned skill ids (passive skills show the buff text). */
export function skillInfoOf(skillIds: readonly number[], look: PetBonusLookups): PetSkillInfoMap {
  const out: PetSkillInfoMap = {};
  for (const id of skillIds) {
    const s = id > 0 ? look.skill(id) : undefined;
    if (!s) continue;
    const buff = s.buffId > 0 ? look.buff(s.buffId) : undefined;
    out[id] = { id, name: s.name, iconCode: s.iconCode, type: s.type, level: s.level, info: s.description || String(buff?.description ?? '') };
  }
  return out;
}

const APT_NAMES: Readonly<Record<AttrKey, keyof NonNullable<Pet['aptEx']>>> = {
  str: 'strength', agi: 'agility', sta: 'stamina', int: 'intelligence', eng: 'energy',
};
const ATTRS = Object.keys(APT_NAMES) as AttrKey[];

/** The five aptitude layers of a pet (per mille): instance base, Vu Hoa (feather table), Ao Hoa (illusion) and their sum. */
export interface SheetAptitudes {
  base: Record<AttrKey, number>;
  evolution: Record<AttrKey, number>;
  illusion: Record<AttrKey, number>;
  total: Record<AttrKey, number>;
}

/**
 * Aptitude fed to the stat formula = (refined value, else the creature value) + Vu Hoa + Ao Hoa (Go SheetBaseAptitude).
 * A stored refined value of 0 means "never refined" (the schema default), so it falls back to the creature aptitude.
 * Distributed points (aptEx) are NOT aptitude; they stay a separate attribute input.
 */
export function sheetAptitudes(row: Pick<Pet, 'tid' | 'aptRefined' | 'aptIllusion' | 'envoInfo'>, tpl: PetTemplate): SheetAptitudes {
  const evo = featherAptitudes(row.tid, row.envoInfo);
  const base = {} as Record<AttrKey, number>;
  const illusion = {} as Record<AttrKey, number>;
  const evolution = {} as Record<AttrKey, number>;
  const total = {} as Record<AttrKey, number>;
  for (const k of ATTRS) {
    const refined = row.aptRefined?.[APT_NAMES[k]] ?? 0;
    base[k] = refined > 0 ? refined : tpl.apt[k];
    illusion[k] = row.aptIllusion?.[APT_NAMES[k]] ?? 0;
    evolution[k] = evo[k];
    total[k] = base[k] + evolution[k] + illusion[k];
  }
  return { base, evolution, illusion, total };
}

/** The Vu Hoa / Ao Hoa keys of PetView and of the `property` block. */
export function aptitudeExtras(apt: SheetAptitudes): PetAptitudeExtras {
  return {
    aptStrengthEvolution: apt.evolution.str, aptAgilityEvolution: apt.evolution.agi, aptStaminaEvolution: apt.evolution.sta,
    aptIntelligenceEvolution: apt.evolution.int, aptEnergyEvolution: apt.evolution.eng,
    aptStrengthIllusion: apt.illusion.str, aptAgilityIllusion: apt.illusion.agi, aptStaminaIllusion: apt.illusion.sta,
    aptIntelligenceIllusion: apt.illusion.int, aptEnergyIllusion: apt.illusion.eng,
  };
}

export function statsOfPet(row: Pet, tpl: PetTemplate, bonuses?: PetBonuses): PetStats {
  const points = (k: AttrKey): number => row.aptEx?.[APT_NAMES[k]] ?? 0;
  return petStats({
    att: tpl.att, apt: sheetAptitudes(row, tpl).total, level: row.level, growRate: row.growRate, growRateAdd: row.growRateAdd,
    aptEx: { str: points('str'), agi: points('agi'), sta: points('sta'), int: points('int'), eng: points('eng') },
    bonuses,
  });
}

export function propertyOfPet(row: Pet, tpl: PetTemplate, bonuses?: PetBonuses): PetProperty & PetAptitudeExtras {
  return {
    ...toPetProperty(statsOfPet(row, tpl, bonuses), row.attrPoints, row.growRate, row.growRateAdd),
    ...aptitudeExtras(sheetAptitudes(row, tpl)),
  };
}

export function petView(row: Pet, tpl: PetTemplate, extras: PetExtras = {}): PetView {
  const s = statsOfPet(row, tpl, extras.bonuses);
  const apt = sheetAptitudes(row, tpl);
  const ex = (name: keyof NonNullable<Pet['aptEx']>): number => (row.aptEx?.[name] ?? 0) + (row.aptIllusion?.[name] ?? 0);
  const skills = {} as Record<PetSkillKey, number>;
  for (let i = 0; i < PET_SKILL_SLOTS; i++) skills[`skill${i + 1}` as PetSkillKey] = row.skills?.[i] ?? -1;
  const equ = {} as Record<PetEquKey, number>;
  for (let i = 0; i < PET_EQU_SLOTS; i++) equ[`equ${i + 1}` as PetEquKey] = row.equ?.[i] ?? 0;
  return {
    ...skills,
    ...equ,
    id: row._id,
    characterId: row.characterId,
    tid: row.tid,
    petName: row.petName,
    level: row.level,
    exp: row.exp,
    growRate: row.growRate,
    growRateAdd: row.growRateAdd,
    state: row.state,
    binded: row.binded,
    following: row.following,
    currentHp: s.stats.maxHp,
    currentMp: s.stats.maxMp,
    life: row.life,
    close: 0,
    element: row.element,
    upgradeNum: row.upgradeNum,
    starNum: row.starNum ?? 0,
    starGrowAdd: row.starGrowAdd ?? 0,
    ...(row.envoInfo ? { envoInfo: row.envoInfo } : {}),
    attLastPoint: row.attrPoints,
    // Instance aptitude (refined value, else creature); Flash adds property.apt*Evolution and apt*Ex on top. Ex = points + illusion.
    aptStrength: apt.base.str, aptAgility: apt.base.agi, aptStamina: apt.base.sta,
    aptIntelligence: apt.base.int, aptEnergy: apt.base.eng,
    aptStrengthEx: ex('strength'), aptAgilityEx: ex('agility'), aptStaminaEx: ex('stamina'),
    aptIntelligenceEx: ex('intelligence'), aptEnergyEx: ex('energy'),
    ...aptitudeExtras(apt),
    creatureName: tpl.name,
    classId: tpl.classId,
    divine: creatureClassIds(tpl).includes(10),
    qLevel: tpl.qLevel,
    useLv: tpl.useLevel,
    resCode: tpl.resCode,
    iconCode: tpl.iconCode,
    colorCode: tpl.colorCode,
    property: { ...toPetProperty(s, row.attrPoints, row.growRate, row.growRateAdd), ...aptitudeExtras(apt) },
    ...(extras.skillInfo ? { skillInfo: extras.skillInfo } : {}),
    pi: row.battleSetting ?? {},
    soulInfo: petSoulInfoWire(row.soul, row.level),
  };
}

export const petWrapper = (row: Pet, tpl: PetTemplate, extras: PetExtras = {}): PetWrapper => ({
  id: row._id, data: petView(row, tpl, extras), soulInfo: petSoulInfoWire(row.soul, row.level),
});

/** Map view of a following pet (showPetObj / onCreatePet.petData): the keys the Flash Pet object reads, plus ids. */
export function petSceneView(row: Pick<Pet, '_id' | 'characterId' | 'tid' | 'petName' | 'level' | 'element'>, tpl: PetTemplate): PetSceneView {
  return {
    id: row._id,
    cid: row.characterId,
    tid: row.tid,
    name: row.petName,
    level: row.level,
    resCode: tpl.resCode,
    colorCode: tpl.colorCode,
    iconCode: tpl.iconCode,
    element: row.element,
  };
}
