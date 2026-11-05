// Test helpers for the E2 mechanics tests (fighters, boards, skill templates, a scripted RNG). Not imported by runtime code.

import type { SkillTemplate } from '../../gamedata/skill-data';
import type { Fighter, Rng } from '../battle.types';
import type { NpcEnv } from './npc-ai';
import { buildNpcSkill, type NpcSkill, type Row } from './npc-skills';

export const mk = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5,
  hp: 1000, hpMax: 1000, mp: 100, mpMax: 100, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1,
  attack: 100, magicAttack: 100, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 200, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});

export const board = (...fs: Fighter[]): Map<number, Fighter> => new Map(fs.map((f) => [f.slot, f]));

/** Returns the scripted values in order, then `rest`. */
export const seq = (values: number[], rest = 0.5): Rng => {
  let i = 0;
  return () => (i < values.length ? values[i++] : rest);
};

export const tpl = (o: Partial<SkillTemplate>): SkillTemplate => ({
  id: 1, name: 'sk', type: 3, kind: 0, level: 1, useMp: 0, useSp: 0, iconCode: '0', targetType: 4, reqLevel: 0, base: 10, mult: 1,
  buffId: 0, creKind: '', codeName: '', scriptReqL: '', description: '', useEnv: 0, reqClass: [], reqCl: 0, expSkill: 0, price: 0,
  areaAttack: -1, targetNum: 1, attackNum: 1, buffRate: 0, buffRound: 0, ...o,
});

export const buffRow = (o: Row): Row => ({ id: 900, kind: 3, state: -1, percent_flag: 0, icon_code: '77', description: '', ...o });

/** An env over inline skills: `skills` by id, pools by creature refId. */
export function env(skills: Record<number, { tpl: Partial<SkillTemplate>; buff?: Row }>, pools: Record<number, number[]> = {}): NpcEnv {
  const built = new Map<number, NpcSkill>();
  for (const [id, s] of Object.entries(skills)) {
    built.set(Number(id), buildNpcSkill(tpl({ id: Number(id), ...s.tpl }), () => s.buff));
  }
  return { skill: (id) => built.get(id), creaturePool: (cid) => pools[cid] ?? [] };
}
