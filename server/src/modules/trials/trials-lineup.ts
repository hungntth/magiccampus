// Vùng Đất Rèn Luyện line-ups (Go handlers/trials templates.go + vdrl_rules.go FloorDeathRule): every unit is a boss row built at the floor
// level, then overwritten by its pin scaled to that level (HP / MP / attack / defence / skills); bosses roll their pool at scale 3 (the first
// boss in the centre slot, Khakass with every boss pool), escorts at scale 2; the first boss carries the floor's summon plan; floors 2 / 4
// get their death rule. Pure over the creature accessor.

import type { TrialsFloorDef } from '@mc/shared';
import type { Fighter } from '../combat/battle.types';
import { creatureFighter } from '../combat/fighters';
import { guardedRevive, twinRevive, type DeathRule } from '../combat/mechanics/revive';
import { LINEUP_SLOTS } from '../combat/npc-battle';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { bossSkillPool, stageLineup, type TrialsFloorCfg } from './trials-config';
import { BOSS_CHANCE_SCALE, ESCORT_CHANCE_SCALE, scalePin, type UnitPin } from './trials-pins';

export type CreatureLookup = (id: number) => CreatureTemplate | undefined;

const CENTRE = 0;

/** One unit at `slot` (-1 = pending summon): the creature at the floor level with its pin (scaled) applied. */
export function trialsUnit(
  def: TrialsFloorDef, creature: CreatureLookup, id: number, slot: number, pin: UnitPin | undefined, pool: readonly number[] | undefined, scale: number,
): Fighter | undefined {
  const tpl = creature(id);
  if (!tpl) return undefined;
  const f = creatureFighter(slot, tpl, def.level, 1);
  if (pin) {
    const p = scalePin(pin, def.level);
    if (p.hp > 0) f.hpMax = p.hp;
    if (p.mp > 0) f.mpMax = p.mp;
    if (p.attack > 0) f.attack = p.attack;
    if (p.magicAttack > 0) f.magicAttack = p.magicAttack;
    if (p.defense > 0) f.defense = p.defense;
    if (p.magicDefense > 0) f.magicDefense = p.magicDefense;
    if (p.skills.length > 0) f.npc = { ...f.npc, pool: [...p.skills] };
  }
  if (pool && pool.length > 0) f.npc = { ...f.npc, pool: [...pool] };
  f.npc = { ...f.npc, chanceScale: scale };
  f.hp = f.hpMax;
  f.mp = f.mpMax;
  return f;
}

/** Go floorTemplates: bosses (first = centre), then the fixed escorts in order, capped at the 10 enemy slots. */
export function stageEnemies(def: TrialsFloorDef, cfg: TrialsFloorCfg, stage: number, creature: CreatureLookup): Fighter[] {
  const { bosses, escorts } = stageLineup(cfg, stage);
  const out: Fighter[] = [];
  bosses.forEach((id, i) => {
    const f = trialsUnit(def, creature, id, i === 0 ? CENTRE : LINEUP_SLOTS[out.length], cfg.pins[id], bossSkillPool(cfg, id), BOSS_CHANCE_SCALE);
    if (f) out.push(f);
  });
  if (out.length === 0) return [];
  for (const id of escorts) {
    if (out.length >= LINEUP_SLOTS.length) break;
    const f = trialsUnit(def, creature, id, LINEUP_SLOTS[out.length], cfg.pins[id], undefined, ESCORT_CHANCE_SCALE);
    if (f) out.push(f);
  }
  const s = cfg.summon;
  if (s && s.count > 0 && !(stage === 0 && cfg.guardWave)) {
    const pending: Fighter[] = [];
    for (let i = 0; i < s.count; i++) {
      const u = trialsUnit(def, creature, s.creature, -1, s.pin, undefined, ESCORT_CHANCE_SCALE);
      if (u) pending.push(u);
    }
    if (pending.length > 0) out[0].summon = { startRound: s.startRound, perRound: s.perRound, every: s.every, refill: s.refill, split: 0, pending };
  }
  return out;
}

/** Go FloorDeathRule: floor 4 twins, floor 2 guarded revive; the guard-wave stage and other floors have none. */
export function floorDeathRule(cfg: TrialsFloorCfg, stage: number, twinRounds: number): DeathRule | undefined {
  const { bosses } = stageLineup(cfg, stage);
  if (cfg.twins && bosses.length >= 2) return twinRevive(bosses[0], bosses[1], twinRounds);
  if (cfg.reviveGuards && cfg.reviveGuards.length > 0 && bosses.length > 0) return guardedRevive(bosses[0], cfg.reviveGuards);
  return undefined;
}

/** Floor rule text shown to each fighter at battle start (the client cannot show the mechanics). */
export function battleHint(cfg: TrialsFloorCfg, stage: number, text: { guard: string; deeven: string; twins: string; khakass: string }): string {
  if (stage === 0 && cfg.guardWave) return text.guard;
  if (cfg.reviveGuards && cfg.reviveGuards.length > 0) return text.deeven;
  if (cfg.twins) return text.twins;
  if (cfg.copiesBossSkills) return text.khakass;
  return '';
}
