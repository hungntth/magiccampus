// Builds battle fighters (player from the M1 effective stats, enemies from creature templates) and the wire participants.
// Pure helpers over already-loaded data; the combat service does the loading.

import { BattleParticipantType, type BattleParticipant } from '@mc/shared';
import type { CreatureTemplate, MapCreatureRow } from '../gamedata/combat-data';
import type { CharStats } from '../stats/character-stats.service';
import type { Fighter } from './battle.types';
import { capToPlayer, creatureStatsAt, spawnLevel, withDefaults, type CreatureCombat } from './creature-stats';

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
    hit: p.finalHit, dodge: p.finalDodge, critical: p.finalCritical, criticalDmg: 150 + (r.finalCriticalDamage ?? 0),
    speed: p.finalSpeed, combo: r.finalCombo ?? 0, counter: r.finalCounter ?? 0, resiCritical: r.finalResiCritical ?? 0,
    resiDefy: r.finalResiDefy ?? 0, praDef: r.finalPraDef ?? 0, praMagDef: r.finalPraMagDef ?? 0,
    reduceHurt1: r.finalReduceHurt1 ?? 0, reduceHurt2: r.finalReduceHurt2 ?? 0,
    enhPhyHurt: r.finalEnhPhyHurt ?? 0, enhMagicHurt: r.finalEnhMagicHurt ?? 0,
  };
}

function enemyOf(slot: number, tpl: CreatureTemplate, s: CreatureCombat, bossFlag: number, expBase: number): Fighter {
  return {
    ...s, slot, side: 'enemy', kind: 'creature', refId: tpl.id, name: tpl.name, hp: s.hpMax, mp: s.mpMax, sp: 0, spMax: 0,
    resCode: tpl.resCode, bossFlag, alive: true, expBase,
  };
}

/** An enemy at an explicit level (quest battles, phase B: no player-level cap, no spawn row). */
export function creatureFighter(slot: number, tpl: CreatureTemplate, level: number): Fighter {
  return enemyOf(slot, tpl, withDefaults(creatureStatsAt(tpl, level)), 0, -1);
}

/** Random-encounter enemy from a spawn row: row level (with fallbacks), capped to the player's level + 5. */
export function spawnFighter(slot: number, row: MapCreatureRow, tpl: CreatureTemplate, mapLevel: number, playerLevel: number): Fighter {
  const level = spawnLevel(row.level, tpl.useLevel, mapLevel);
  const s = withDefaults(capToPlayer(creatureStatsAt(tpl, level), playerLevel, row.bossFlag > 0));
  const expBase = row.exp > 0 ? Math.floor(row.exp * (row.expMulti > 0 ? row.expMulti : 1)) : -1;
  return enemyOf(slot, tpl, s, row.bossFlag, expBase);
}

export function toParticipant(f: Fighter): BattleParticipant {
  const p: BattleParticipant = {
    id: f.refId, type: f.kind === 'character' ? BattleParticipantType.CHARACTER : BattleParticipantType.CREATURE,
    battleId: f.slot, name: f.name, level: f.level, hp: f.hp, hpMax: f.hpMax, mp: f.mp, mpMax: f.mpMax, sp: f.sp,
    spMax: f.spMax, resCode: f.resCode, bossFlag: f.bossFlag,
  };
  if (f.kind === 'character') {
    p.classId = f.classId;
    p.gender = f.gender;
  }
  return p;
}
