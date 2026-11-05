// NPC command selection (M10 E2.1 / E2.5), port of Go domain/combat npc_ai.go SelectCommand in its order: [summon, E2.2] →
// opener queue (npc_ai_opener.go) → 4-slot rotation (npc_ai_rotation.go, Rada 2196) → support heal / buff
// (npc_ai_support.go) → offensive roll at 30 % × SkillChanceScale → basic attack on the front line. Boss rows regain MP
// before choosing (npc_ai_mana.go). Pure; the RNG is injected.

import type { Fighter, Rng } from '../battle.types';
import { canUseSkill } from './battle-buffs';
import { npcSkillCost, selfOnly, supportTarget, type NpcSkill } from './npc-skills';
import { summonDue, summonSlots } from './summon';
import { frontlineTarget, shuffle } from './targets';

export const NPC_AI = {
  SKILL_CHANCE: 0.3, SUPPORT_HEAL_HP: 0.5, SUPPORT_HEAL_CHANCE: 0.6, SUPPORT_BUFF_CHANCE: 0.25, BOSS_MANA_REGEN: 0.1,
} as const;

/** Go RadaRotation (creature 2196, boss row): buff, damage, control, Địa Ngục Kiếm. */
export const CREATURE_ROTATIONS: Readonly<Record<number, number[][]>> = {
  2196: [[6836, 6837], [6835, 6831], [6833, 6834], [6832]],
};

/** Skill rows and default pools the AI reads (CombatData implements it from gamedata). */
export interface NpcEnv {
  skill(id: number): NpcSkill | undefined;
  creaturePool(cid: number): readonly number[];
}

export type NpcCommand =
  | { kind: 'attack'; target?: Fighter }
  | { kind: 'skill'; skill: NpcSkill; target: Fighter }
  | { kind: 'summon' };

const isNpc = (f: Fighter): boolean => f.kind === 'creature';
const living = (fs: Iterable<Fighter>, side: Fighter['side']): Fighter[] => [...fs].filter((f) => f.alive && f.side === side);
const opp = (f: Fighter): Fighter['side'] => (f.side === 'player' ? 'enemy' : 'player');

/** Go npcChance: base × scale, capped at 1; scale 0 = unscaled. */
export function npcChance(f: Fighter, base: number): number {
  const scale = f.npc?.chanceScale ?? 0;
  return scale > 0 ? Math.min(1, base * scale) : base;
}

/** Go resolveSkillPool: the kit pool, else the creature_skill rows. */
export const skillPool = (f: Fighter, env: NpcEnv): readonly number[] => (f.npc?.pool?.length ? f.npc.pool : env.creaturePool(f.refId));

const known = (env: NpcEnv, ids: readonly number[]): NpcSkill[] => ids.map((id) => env.skill(id)).filter((s): s is NpcSkill => !!s);

/** Go restoreBossMana: a boss row regains max(10 % MaxMP, dearest cost, 1) per round; MaxMP is raised to that cost. */
export function restoreBossMana(f: Fighter, env: NpcEnv): void {
  if (!isNpc(f) || !f.alive || f.bossFlag !== 1) return;
  const need = known(env, skillPool(f, env)).reduce((m, s) => Math.max(m, npcSkillCost(s, f.mpMax)), 0);
  if (f.mpMax < need) f.mpMax = need;
  if (f.mpMax <= 0 || f.mp >= f.mpMax) return;
  f.mp = Math.min(f.mpMax, f.mp + Math.max(Math.trunc(f.mpMax * NPC_AI.BOSS_MANA_REGEN), need, 1));
}

/** Go mostHurtAlly: the living ally with the lowest HP ratio under `threshold`. */
function mostHurtAlly(f: Fighter, fighters: Iterable<Fighter>, threshold: number): Fighter | undefined {
  let best: Fighter | undefined;
  let ratio = threshold;
  for (const p of living(fighters, f.side)) {
    const r = p.hpMax > 0 ? p.hp / p.hpMax : 1;
    if (r < ratio) [best, ratio] = [p, r];
  }
  return best;
}

/** Go allyMissingBuff: a random living ally (the caster for self skills) without that buff id. */
function allyMissingBuff(f: Fighter, fighters: Iterable<Fighter>, sk: NpcSkill, rng: Rng): Fighter | undefined {
  const id = sk.buff?.def.id ?? 0;
  const pool = (selfOnly(sk.target) ? [f] : living(fighters, f.side)).filter((p) => p.alive && !p.buffs?.some((b) => b.id === id));
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] : undefined;
}

const affordable = (f: Fighter, sk: NpcSkill): boolean => sk.kind !== 'passive' && sk.kind !== 'unsupported' && f.mp >= npcSkillCost(sk, f.mpMax);
const ownSide = (sk: NpcSkill): boolean => supportTarget(sk.target) || sk.target === 'selfPet';

/** Go openerSkillCommand: heal → most hurt ally (else self), own-side buff → ally missing it, offensive → front line. */
function aimedSkill(f: Fighter, fighters: Iterable<Fighter>, sk: NpcSkill, rng: Rng): NpcCommand | null {
  if (!affordable(f, sk)) return null;
  if (sk.kind === 'heal') return { kind: 'skill', skill: sk, target: mostHurtAlly(f, fighters, 1) ?? f };
  if (ownSide(sk)) {
    const t = sk.buff ? allyMissingBuff(f, fighters, sk, rng) : undefined;
    return t ? { kind: 'skill', skill: sk, target: t } : null;
  }
  const t = frontlineTarget(fighters, opp(f), rng);
  return t ? { kind: 'skill', skill: sk, target: t } : null;
}

function openerCommand(f: Fighter, fighters: Iterable<Fighter>, env: NpcEnv, rng: Rng): NpcCommand | null {
  const queue = f.npc?.opener;
  while (queue && queue.length > 0) {
    const sk = env.skill(queue.shift()!);
    const cmd = sk ? aimedSkill(f, fighters, sk, rng) : null;
    if (cmd) return cmd;
  }
  return null;
}

function rotationCommand(f: Fighter, fighters: Iterable<Fighter>, env: NpcEnv, rng: Rng, round: number): NpcCommand | null {
  const slots = f.npc?.rotation?.length ? f.npc.rotation : f.bossFlag === 1 && isNpc(f) ? CREATURE_ROTATIONS[f.refId] : undefined;
  if (!slots?.length) return null;
  const list = slots[(Math.max(1, round) - 1) % slots.length] ?? [];
  const start = list.length > 1 ? Math.min(list.length - 1, Math.floor(rng() * list.length)) : 0;
  for (let i = 0; i < list.length; i++) {
    const sk = env.skill(list[(start + i) % list.length]);
    if (!sk || !affordable(f, sk)) continue;
    if (sk.kind !== 'heal' && ownSide(sk)) {
      const t = sk.kind === 'state' && sk.buff ? allyMissingBuff(f, fighters, sk, rng) : undefined;
      return { kind: 'skill', skill: sk, target: t ?? f };
    }
    const cmd = aimedSkill(f, fighters, sk, rng);
    if (cmd) return cmd;
  }
  return null;
}

function supportCommand(f: Fighter, fighters: Iterable<Fighter>, pool: NpcSkill[], rng: Rng): NpcCommand | null {
  const usable = pool.filter((s) => supportTarget(s.target) && affordable(f, s));
  const heals = usable.filter((s) => s.kind === 'heal');
  const buffs = usable.filter((s) => s.kind === 'state' && s.buff);
  if (heals.length > 0) {
    const t = mostHurtAlly(f, fighters, NPC_AI.SUPPORT_HEAL_HP);
    if (t && rng() < npcChance(f, NPC_AI.SUPPORT_HEAL_CHANCE)) {
      const sk = heals[Math.min(heals.length - 1, Math.floor(rng() * heals.length))];
      return { kind: 'skill', skill: sk, target: selfOnly(sk.target) ? f : t };
    }
  }
  if (buffs.length === 0 || rng() >= npcChance(f, NPC_AI.SUPPORT_BUFF_CHANCE)) return null;
  for (const sk of shuffle(buffs, rng)) {
    const t = allyMissingBuff(f, fighters, sk, rng);
    if (t) return { kind: 'skill', skill: sk, target: t };
  }
  return null;
}

/** Go trySkillCommand: a shuffled pool, the first affordable offensive skill, aimed at the front line. */
function offensiveCommand(f: Fighter, fighters: Iterable<Fighter>, pool: NpcSkill[], rng: Rng): NpcCommand | null {
  const target = frontlineTarget(fighters, opp(f), rng);
  if (!target) return null;
  for (const sk of shuffle([...pool], rng)) {
    if (ownSide(sk) || sk.kind === 'heal' || !affordable(f, sk)) continue;
    return { kind: 'skill', skill: sk, target };
  }
  return null;
}

/** One NPC's command for this round (Go SelectCommand). A silenced / confused NPC only basic-attacks. */
export function selectNpcCommand(f: Fighter, fighters: ReadonlyMap<number, Fighter>, env: NpcEnv, rng: Rng, round: number): NpcCommand {
  const all = [...fighters.values()];
  // Go summonCommand: a due plan with a free (or refillable) slot spends the turn on the summon.
  if (f.summon && summonDue(f.summon, round) && summonSlots(fighters, f, f.summon.refill).length > 0) return { kind: 'summon' };
  if (canUseSkill(f)) {
    const pool = known(env, skillPool(f, env));
    const scripted = openerCommand(f, all, env, rng) ?? rotationCommand(f, all, env, rng, round);
    if (scripted) return scripted;
    if (pool.length > 0) {
      const support = supportCommand(f, all, pool, rng);
      if (support) return support;
      if (rng() < npcChance(f, NPC_AI.SKILL_CHANCE)) {
        const cmd = offensiveCommand(f, all, pool, rng);
        if (cmd) return cmd;
      }
    }
  }
  return { kind: 'attack', target: frontlineTarget(all, opp(f), rng) };
}
