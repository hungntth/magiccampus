// Kiếp Nạn Vô Ưu floor line-ups (Go handlers/nineboss templates.go floorTemplates): every unit is a boss row (bossFlag 1) built at its
// pinned level, its HP / MP replaced by the pin scaled to that level, its skill pool / XPN / crit pinned, then the floor HP / damage
// percentages, the Atula same-round revives and the Mehdi elite kit. The Chu Ma clone and the Hydra split pool ride on the first
// boss as summon plans (mechanics/summon.ts). Pure over the creature accessor.

import type { CreatureTemplate } from '../gamedata/combat-data';
import type { Fighter } from '../combat/battle.types';
import { creatureFighter } from '../combat/fighters';
import { eliteKit } from '../combat/mechanics/boss-floors';
import { LINEUP_SLOTS } from '../combat/npc-battle';
import type { NineFloor } from './nineboss-config';
import { pctOf, scaledPin, unitLevel } from './nineboss-rules';

export type CreatureLookup = (id: number) => CreatureTemplate | undefined;

const CENTRE = 0;

/** One floor unit at `slot` (undefined when the creature row is missing). */
export function floorUnit(cfg: NineFloor, creature: CreatureLookup, enc: number, cid: number, slot: number): Fighter | undefined {
  const tpl = creature(cid);
  if (!tpl) return undefined;
  const pin = cfg.pins[cid];
  const level = unitLevel(pin, enc, cfg.pinLevel);
  const f = creatureFighter(slot, tpl, level, 1);
  if (pin) {
    const sc = scaledPin(pin, level);
    if (sc.hp > 0) f.hpMax = sc.hp;
    if (sc.mp > 0) f.mpMax = sc.mp;
    if (pin.skills && pin.skills.length > 0) f.npc = { ...f.npc, pool: [...pin.skills] };
    if ((pin.defy ?? 0) > 0) f.defy = pin.defy;
    if ((pin.critical ?? 0) > 0) f.critical = pin.critical!;
  }
  if (cfg.hpPct) f.hpMax = pctOf(f.hpMax, cfg.hpPct);
  if (cfg.damagePct) {
    f.attack = Math.trunc((f.attack * cfg.damagePct) / 100);
    f.magicAttack = Math.trunc((f.magicAttack * cfg.damagePct) / 100);
  }
  f.hp = f.hpMax;
  f.mp = f.mpMax;
  if (cfg.sameRoundRevives) f.roundRevives = cfg.sameRoundRevives;
  if (cfg.elite) eliteKit(f);
  return f;
}

/** The floor's enemies: bosses (the first in the centre), the clone / split plan on the first boss, then the fixed line-up. */
export function floorEnemies(cfg: NineFloor, creature: CreatureLookup, enc: number): Fighter[] {
  const out: Fighter[] = [];
  cfg.bosses.forEach((cid, i) => {
    const slot = i === 0 ? CENTRE : LINEUP_SLOTS[out.length];
    const f = floorUnit(cfg, creature, enc, cid, slot);
    if (f) out.push(f);
  });
  const host = out[0];
  if (!host) return [];
  if (cfg.clone) {
    const clone = floorUnit(cfg, creature, enc, cfg.clone.creature, -1);
    if (clone) host.summon = { startRound: cfg.clone.round, perRound: 1, every: 1, refill: false, split: 0, pending: [clone] };
  }
  if (cfg.split && cfg.split.perDeath > 0 && cfg.split.pool > 0) {
    const pending: Fighter[] = [];
    for (let i = 0; i < cfg.split.pool; i++) {
      const u = floorUnit(cfg, creature, enc, cfg.split.creature, -1);
      if (u) pending.push(u);
    }
    host.summon = { startRound: 1, perRound: 0, every: 1, refill: false, split: cfg.split.perDeath, pending };
  }
  for (const p of cfg.lineup) {
    const f = floorUnit(cfg, creature, enc, p.creature, p.slot);
    if (f) out.push(f);
  }
  return out;
}
