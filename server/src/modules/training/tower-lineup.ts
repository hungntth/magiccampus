// Ảo Ma Tháp floor line-up (Go handlers/hmtxl tower_battle.go): the floor's Ma Ảnh (763 + (n - 1) % 6, attributes x 0.1 + 0.9 x
// (n - 1) / 399, boss row in the centre slot) plus n / 100 (max 3) shuffled escorts 769-774 at the same level (60 + (n - 1) x 140 / 399),
// unscaled. A missing creature row is skipped; no guardian means no battle (empty list). Pure over the creature accessor.

import { HMT_TOWER, hmtEscortCount, hmtFloorLevel, hmtGuardianCreature, hmtGuardianFactor } from '@mc/shared';
import type { Fighter } from '../combat/battle.types';
import { creatureFighter } from '../combat/fighters';
import { LINEUP_SLOTS } from '../combat/npc-battle';
import type { CreatureTemplate } from '../gamedata/combat-data';

/** Template with its five base attributes multiplied by `f` (the guardian scaling). */
export function scaledTemplate(tpl: CreatureTemplate, f: number): CreatureTemplate {
  const a = tpl.att;
  return { ...tpl, att: { str: a.str * f, agi: a.agi * f, sta: a.sta * f, int: a.int * f, eng: a.eng * f } };
}

export function towerEnemies(
  floor: number, creature: (id: number) => CreatureTemplate | undefined, shuffle: <T>(items: T[]) => T[],
): Fighter[] {
  const level = hmtFloorLevel(floor);
  const base = creature(hmtGuardianCreature(floor));
  if (!base) return [];
  const out: Fighter[] = [creatureFighter(LINEUP_SLOTS[0], scaledTemplate(base, hmtGuardianFactor(floor)), level, 1)];
  const want = hmtEscortCount(floor);
  for (const id of shuffle([...HMT_TOWER.ESCORT_CREATURES])) {
    if (out.length > want) break;
    const tpl = creature(id);
    const slot = LINEUP_SLOTS[out.length];
    if (tpl && slot !== undefined) out.push(creatureFighter(slot, tpl, level));
  }
  return out;
}
