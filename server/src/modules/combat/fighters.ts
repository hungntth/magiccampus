// Builds battle fighters (player from the M1 effective stats, enemies from creature templates) and the wire participants.
// Pure helpers over already-loaded data; the combat service does the loading.

import { BATTLE_PET_SLOT_OFFSET, BattleParticipantType, type BattleParticipant, type BattleStart } from '@mc/shared';
import type { CreatureTemplate, MapCreatureRow } from '../gamedata/combat-data';
import type { BattlePet } from '../pet/pet-battle.service';
import type { CharStats } from '../stats/character-stats.service';
import type { Fighter } from './battle.types';
import { capToPlayer, creatureStatsAt, spawnLevel, withDefaults, type CreatureCombat } from './creature-stats';
import { bossDefenseFloor } from './mechanics/boss-floors';

/** The solo player: current HP/MP from the document, everything else from the effective stats (gear + buffs). */
export function playerFighter(slot: number, st: CharStats, resCode: string): Fighter {
  const p = st.property;
  const r = st.rates;
  const maxHp = st.maxHp;
  const maxMp = st.maxMp;
  return {
    slot, side: 'player', kind: 'character', refId: st.doc._id, name: st.doc.name, level: st.doc.level,
    hp: Math.min(st.doc.currentHp, maxHp), hpMax: maxHp, mp: Math.min(st.doc.currentMp, maxMp), mpMax: maxMp,
    sp: 0, spMax: p.finalSp, resCode, bossFlag: 0, alive: st.doc.currentHp > 0, expBase: -1,
    classId: st.doc.classId, gender: st.doc.gender,
    attack: p.finalAttack, magicAttack: p.finalMAttack, defense: p.finalDefence, magicDefense: p.finalMDefence,
    hit: p.finalHit, dodge: p.finalDodge, critical: p.finalCritical, criticalDmg: 200 + (r.finalCriticalDamage ?? 0),
    speed: p.finalSpeed, combo: r.finalCombo ?? 0, counter: r.finalCounter ?? 0, resiCritical: r.finalResiCritical ?? 0,
    resiDefy: r.finalResiDefy ?? 0, praDef: r.finalPraDef ?? 0, praMagDef: r.finalPraMagDef ?? 0,
    reduceHurt1: r.finalReduceHurt1 ?? 0, reduceHurt2: r.finalReduceHurt2 ?? 0,
    enhPhyHurt: r.finalEnhPhyHurt ?? 0, enhMagicHurt: r.finalEnhMagicHurt ?? 0,
    defy: r.finalDefy ?? 0, rebornRate: r.finalRebornRate ?? 0, breakReborn: r.finalBreakReborn ?? 0,
  };
}

/** The owner's pet: player side at owner slot + 5, full HP/MP (H5: pet HP is never persisted), stats from the pet's final values. */
export function petFighter(ownerSlot: number, pet: BattlePet): Fighter {
  return petFighterAt(ownerSlot + BATTLE_PET_SLOT_OFFSET, 'player', pet);
}

/** A pet at an explicit slot and side (simulated PPVE / arena line-ups); everything else as petFighter. */
export function petFighterAt(slot: number, side: Fighter['side'], pet: BattlePet): Fighter {
  const s = pet.stats;
  return {
    slot, side, kind: 'pet', refId: pet.petId, name: pet.name, level: pet.level,
    hp: s.maxHp, hpMax: s.maxHp, mp: s.maxMp, mpMax: s.maxMp, sp: s.maxSp, spMax: s.maxSp, resCode: pet.resCode, bossFlag: 0,
    alive: true, expBase: -1, ownerCid: pet.ownerCid, tid: pet.tid, colorCode: pet.colorCode, iconCode: pet.iconCode,
    element: pet.element, skills: pet.skills, skillList: pet.skillList,
    attack: s.attack, magicAttack: s.magicAttack, defense: s.defense, magicDefense: s.magicDefense, hit: s.hit, dodge: s.dodge,
    critical: s.critical, criticalDmg: 200, speed: s.speed, combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0,
    praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0, enhPhyHurt: 0, enhMagicHurt: 0,
  };
}

function enemyOf(slot: number, tpl: CreatureTemplate, s: CreatureCombat, bossFlag: number, expBase: number): Fighter {
  const f: Fighter = {
    ...s, slot, side: 'enemy', kind: 'creature', refId: tpl.id, name: tpl.name, hp: s.hpMax, mp: s.mpMax, sp: 0, spMax: 0,
    resCode: tpl.resCode, bossFlag, alive: true, expBase, element: tpl.element,
  };
  bossDefenseFloor(f); // M10 E2.10: every boss row (Go buildEnemyParticipant)
  return f;
}

/** An enemy at an explicit level (quest battles, hitNpc line-ups: no player-level cap). */
export function creatureFighter(slot: number, tpl: CreatureTemplate, level: number, bossFlag = 0, expBase = -1): Fighter {
  return enemyOf(slot, tpl, withDefaults(creatureStatsAt(tpl, level)), bossFlag, expBase);
}

/** An enemy with already-scaled stats (PPVE floors scale creature stats by floor and by the configured team). */
export function scaledCreatureFighter(slot: number, tpl: CreatureTemplate, stats: CreatureCombat, bossFlag = 0): Fighter {
  return enemyOf(slot, tpl, stats, bossFlag, -1);
}

/** Random-encounter enemy from a spawn row: row level (with fallbacks), capped to the player's level + 5. */
export function spawnFighter(slot: number, row: MapCreatureRow, tpl: CreatureTemplate, mapLevel: number, playerLevel: number): Fighter {
  const level = spawnLevel(row.level, tpl.useLevel, mapLevel);
  const s = withDefaults(capToPlayer(creatureStatsAt(tpl, level), playerLevel, row.bossFlag > 0));
  const expBase = row.exp > 0 ? Math.floor(row.exp * (row.expMulti > 0 ? row.expMulti : 1)) : -1;
  return enemyOf(slot, tpl, s, row.bossFlag, expBase);
}

const PARTICIPANT_TYPE = {
  character: BattleParticipantType.CHARACTER, creature: BattleParticipantType.CREATURE, pet: BattleParticipantType.PET,
} as const;

export function toParticipant(f: Fighter): BattleParticipant {
  const p: BattleParticipant = {
    id: f.refId, type: PARTICIPANT_TYPE[f.kind],
    battleId: f.slot, name: f.name, level: f.level, hp: f.hp, hpMax: f.hpMax, mp: f.mp, mpMax: f.mpMax, sp: f.sp,
    spMax: f.spMax, resCode: f.resCode, bossFlag: f.bossFlag,
  };
  if (f.kind === 'character') {
    p.classId = f.classId;
    p.gender = f.gender;
  } else if (f.kind === 'pet') {
    Object.assign(p, { cid: f.ownerCid, tid: f.tid, colorCode: f.colorCode, iconCode: f.iconCode, element: f.element, skills: [...(f.skillList ?? [])] });
  }
  return p;
}

/** The onBattleStart payload of a board: every participant keyed by slot. Shared by live battles and the simulated pet fights. */
export function buildBattleStart(battleFieldId: string, nid: number, fighters: Iterable<Fighter>, bossFlag: number): BattleStart {
  const cList: BattleStart['cList'] = {};
  for (const f of fighters) cList[String(f.slot)] = toParticipant(f);
  return { battleFieldId, nid, cList, bossFlag, sneakFlag: 0, guest: false, airBattle: false };
}
