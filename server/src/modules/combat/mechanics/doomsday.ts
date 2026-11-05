// Ngày Diệt Vong (M10 E2.10, world boss), port of Go domain/combat doomsday.go: once, before any actor of round >= Round,
// a living boss with a DoomsdayStrike takes every living opponent's whole HP (no dodge, shield or Miễn Tử). Playback as a
// skill cluster: the cast (sSObj.skill), the hurt wave (hHp 0, cri) and the die wave; one target plays the strike pair.

import { BattleBehavior, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import { step } from '../strike';
import { clearOnDeath } from './battle-buffs';

const B = BattleBehavior;
export const DOOMSDAY_FALLBACK_NAME = 'Ngày Diệt Vong';

export interface DoomsdayStrike {
  round: number;
  skillId: number;
  used?: boolean;
}

/** Go doomsdayActions: the first living enemy boss whose strike is due casts it (skill name from `nameOf`). */
export function doomsdaySteps(fighters: ReadonlyMap<number, Fighter>, round: number, nameOf: (skillId: number) => string | undefined): BattleStep[][] {
  for (const boss of fighters.values()) {
    const d = boss.doomsday;
    if (!boss.alive || boss.side !== 'enemy' || !d || d.used || d.round <= 0 || round < d.round) continue;
    d.used = true;
    const targets = [...fighters.values()].filter((f) => f.alive && f.side !== boss.side && f.hp > 0);
    const name = nameOf(d.skillId) || DOOMSDAY_FALLBACK_NAME;
    const die = (t: Fighter): BattleStep => {
      const cleared = clearOnDeath(t);
      return step(t.slot, boss.slot, t.kind === 'creature' ? B.DIE : B.DEAD, 200, cleared ? { sSObj: { buffClear: 1 } } : {});
    };
    for (const t of targets) {
      t.hp = 0;
      t.alive = false;
    }
    if (targets.length === 1) {
      const t = targets[0];
      return [[step(boss.slot, t.slot, B.MAGIC, 500, { sSObj: { skill: name, uMp: boss.mp }, tSObj: { hHp: 0, cri: 1 } }), step(t.slot, boss.slot, B.HURT, 100)], [die(t)]];
    }
    if (targets.length === 0) return [];
    return [
      [step(boss.slot, targets[0].slot, B.MAGIC, 500, { sSObj: { skill: name, uMp: boss.mp }, tSObj: {} })],
      targets.map((t) => step(t.slot, boss.slot, B.HURT, 100, { sSObj: { hHp: 0, cri: 1 } })),
      targets.map(die),
      [step(boss.slot, boss.slot, B.TURNBACK, 300)],
    ];
  }
  return [];
}
