// Hành Lang Vô Tận floor line-up builder (Go handlers/corridor battle.go BuildFloorTemplates): ten enemies per floor, every one a boss row
// (bossFlag 1) with the floor's fixed stats instead of the creature curve (boss row, minions at their share, attack rescaled by level),
// the creature's own skill kit as NPC pool + openers, the floor's AI roll scale and debuff hit, and the lineup's summon wave on the boss
// (Marita refill, Gnaw, Kiếm Thánh, Quân Thần). Pure over the creature accessor.

import type { CreatureTemplate } from '../gamedata/combat-data';
import type { Fighter } from '../combat/battle.types';
import { creatureFighter } from '../combat/fighters';
import { LINEUP_SLOTS } from '../combat/npc-battle';
import {
  attackForLevel, bossStats, CORRIDOR_BASE_DEFY, CORRIDOR_CLIENT_HP_CAP, CORRIDOR_MAX_ENEMIES, CORRIDOR_SPEED_MULTIPLIER, FLOOR_KITS,
  floorLevel, floorLineup, minionHp, minionStats, scaleBossDamage, type FloorKit, type FloorStats,
} from './corridor-config';
import { CREATURE_KITS } from './corridor-kits';

export type CreatureLookup = (id: number) => CreatureTemplate | undefined;

const INT32_MAX = 2_147_483_647;
const TAG = /\s*【[^】]*】/g;
const CENTRE = 0;
/** Escorts stand beside the boss: enemy Left1 (slot 2) then Right1 (slot 1). */
const ESCORT_SLOTS: readonly number[] = [2, 1];

/** Go DisplayName: drops the data tags ("Kiếm Thánh【HLVT Quái Chính 】" -> "Kiếm Thánh"). */
export function displayName(name: string): string {
  const clean = name.replace(TAG, '').replace(/\|+$/, '').trim();
  return clean || name;
}

/** Go fixedTemplate + applyKit: one unit at `slot` with the row `s` (undefined when the creature row is missing). */
function unit(creature: CreatureLookup, cid: number, level: number, s: FloorStats, kit: FloorKit, slot: number): Fighter | undefined {
  const tpl = creature(cid);
  if (!tpl) return undefined;
  const f = creatureFighter(slot, tpl, level, 1);
  f.name = displayName(tpl.name) || `BOSS #${cid}`;
  f.level = level;
  f.hpMax = Math.min(s.hp, CORRIDOR_CLIENT_HP_CAP);
  f.mpMax = s.mp;
  f.attack = attackForLevel(s.attack, level);
  f.magicAttack = attackForLevel(s.magicAttack, level);
  f.defense = s.defense;
  f.magicDefense = s.magicDefense;
  f.speed = Math.min(s.speed * CORRIDOR_SPEED_MULTIPLIER, INT32_MAX);
  f.hit = s.hit;
  f.dodge = s.dodge;
  f.critical = s.critical;
  f.defy = Math.max(f.defy ?? 0, CORRIDOR_BASE_DEFY);
  const ck = CREATURE_KITS[cid];
  if (ck) f.npc = { ...f.npc, pool: [...ck.skills], opener: [...(ck.opener ?? [])] };
  if (kit.chanceScale > 0) f.npc = { ...f.npc, chanceScale: kit.chanceScale };
  if (kit.debuffHit > 0) f.debuffHit = [kit.debuffHit, 0, 0, 0, 0, 0, 0];
  f.hp = f.hpMax;
  f.mp = f.mpMax;
  return f;
}

/** The floor's enemies: boss (centre) with the summon plan, escorts beside it, then the minions in order; [] when data is missing. */
export function floorEnemies(floor: number, creature: CreatureLookup, partyLevel: number): Fighter[] {
  const lineup = floorLineup(floor);
  const boss = bossStats(floor);
  const minion = minionStats(floor);
  const kit = FLOOR_KITS[floor - 1];
  if (!lineup || !boss || !minion || !kit) return [];
  const level = floorLevel(floor, partyLevel > 0 ? partyLevel : 150);
  const host = unit(creature, lineup.boss, level, boss, kit, CENTRE);
  if (!host) return [];
  host.attack = scaleBossDamage(floor, host.attack);
  host.magicAttack = scaleBossDamage(floor, host.magicAttack);
  const out: Fighter[] = [host];
  const used = new Set<number>([CENTRE]);
  const mate = (cid: number, slot: number): Fighter | undefined => {
    const f = unit(creature, cid, level, minion, kit, slot);
    if (f) f.hpMax = f.hp = Math.min(minionHp(floor, cid), CORRIDOR_CLIENT_HP_CAP);
    return f;
  };
  const nextSlot = (): number => LINEUP_SLOTS.find((s) => !used.has(s)) ?? -1;
  let room = CORRIDOR_MAX_ENEMIES - 1;
  lineup.escorts.forEach((cid, i) => {
    if (room === 0 || i >= ESCORT_SLOTS.length) return;
    const f = mate(cid, ESCORT_SLOTS[i]);
    if (!f) return;
    used.add(f.slot);
    out.push(f);
    room--;
  });
  for (const cid of lineup.minions) {
    if (room === 0) break;
    const f = mate(cid, nextSlot());
    if (!f || f.slot < 0) continue;
    used.add(f.slot);
    out.push(f);
    room--;
  }
  const wave = lineup.summon;
  if (wave && room > 0) {
    const pending: Fighter[] = [];
    for (const cid of wave.units) {
      if (pending.length === room && !wave.refill) break;
      const f = mate(cid, -1);
      if (!f) continue;
      if (wave.hp) f.hpMax = f.hp = Math.min(wave.hp, CORRIDOR_CLIENT_HP_CAP);
      pending.push(f);
    }
    if (pending.length > 0) host.summon = { startRound: wave.startRound, perRound: wave.perRound, every: wave.every, refill: wave.refill, split: 0, pending };
  }
  return out;
}
