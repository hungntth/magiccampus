// DTO builders: Pet row + creature template -> the shared PetView / PetProperty / PetWrapper (Flash `data` block).

import type { PetEquKey, PetProperty, PetSceneView, PetSkillInfoMap, PetSkillKey, PetView, PetWrapper } from '@mc/shared';
import type { PetTemplate } from '../gamedata/pet-data';
import type { Pet } from './pet.schema';
import { petStats, toPetProperty, type PetBonuses, type PetStats } from './pet-stats';
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
    out[id] = { id, name: s.name, iconCode: s.iconCode, type: s.type, info: s.description || String(buff?.description ?? '') };
  }
  return out;
}

export function statsOfPet(row: Pet, tpl: PetTemplate, bonuses?: PetBonuses): PetStats {
  return petStats({
    att: tpl.att, apt: tpl.apt, level: row.level, growRate: row.growRate, growRateAdd: row.growRateAdd,
    aptEx: {
      str: row.aptEx?.strength ?? 0, agi: row.aptEx?.agility ?? 0, sta: row.aptEx?.stamina ?? 0,
      int: row.aptEx?.intelligence ?? 0, eng: row.aptEx?.energy ?? 0,
    },
    bonuses,
  });
}

export function propertyOfPet(row: Pet, tpl: PetTemplate, bonuses?: PetBonuses): PetProperty {
  return toPetProperty(statsOfPet(row, tpl, bonuses), row.attrPoints, row.growRate, row.growRateAdd);
}

export function petView(row: Pet, tpl: PetTemplate, extras: PetExtras = {}): PetView {
  const s = statsOfPet(row, tpl, extras.bonuses);
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
    attLastPoint: row.attrPoints,
    aptStrength: tpl.apt.str, aptAgility: tpl.apt.agi, aptStamina: tpl.apt.sta,
    aptIntelligence: tpl.apt.int, aptEnergy: tpl.apt.eng,
    aptStrengthEx: row.aptEx?.strength ?? 0, aptAgilityEx: row.aptEx?.agility ?? 0, aptStaminaEx: row.aptEx?.stamina ?? 0,
    aptIntelligenceEx: row.aptEx?.intelligence ?? 0, aptEnergyEx: row.aptEx?.energy ?? 0,
    creatureName: tpl.name,
    classId: tpl.classId,
    qLevel: tpl.qLevel,
    useLv: tpl.useLevel,
    resCode: tpl.resCode,
    iconCode: tpl.iconCode,
    colorCode: tpl.colorCode,
    property: toPetProperty(s, row.attrPoints, row.growRate, row.growRateAdd),
    ...(extras.skillInfo ? { skillInfo: extras.skillInfo } : {}),
  };
}

export const petWrapper = (row: Pet, tpl: PetTemplate, extras: PetExtras = {}): PetWrapper => ({
  id: row._id, data: petView(row, tpl, extras),
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
