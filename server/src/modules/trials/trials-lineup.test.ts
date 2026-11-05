// Tests for the trials line-ups: units / slots per floor and stage, pins scaled to the floor level, boss / escort kits, the Khakass copied
// pool, Deeven's copies and Khakass's Orlando summon, the death rules, and (against the legacy seeds when present) every pooled skill.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BattleAction, TRIALS, TRIALS_FLOORS } from '@mc/shared';
import { parseFile, toDocs } from '../../../tools/seed-parser';
import type { Fighter } from '../combat/battle.types';
import { buildNpcSkill, type Row } from '../combat/mechanics/npc-skills';
import { board, env, mk, seq } from '../combat/mechanics/test-kit';
import { resolveRound } from '../combat/round';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { buildSkillTable } from '../gamedata/skill-data';
import { bossSkillPool, stageCount, TRIALS_CFG, TRIALS_SKILL_IDS, trialsCfg } from './trials-config';
import { floorDeathRule, stageEnemies } from './trials-lineup';
import { CR, KHAKASS_PINS, scalePin, THANATOS_PINS } from './trials-pins';

const template = (id: number): CreatureTemplate => ({
  id, name: `c${id}`, useLevel: 100, life: 10000, growBase: 1,
  att: { str: 100, agi: 100, sta: 100, int: 100, eng: 100 }, apt: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 },
  propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode: '0', element: 0,
});
const lookup = (id: number): CreatureTemplate => template(id);
const enemies = (floor: number, stage = 0): Fighter[] => stageEnemies(TRIALS_FLOORS[floor - 1], trialsCfg(floor)!, stage, lookup);

describe('trials line-ups', () => {
  it('unit counts per floor / stage; the first boss sits in the centre, no slot twice', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((f) => enemies(f).length), [8, 8, 4, 6, 4]);
    assert.equal(enemies(3, 1).length, 6);
    for (const f of [1, 2, 3, 4, 5]) {
      const list = enemies(f, f === 3 ? 1 : 0);
      assert.equal(list[0].slot, 0);
      assert.equal(new Set(list.map((e) => e.slot)).size, list.length);
      assert.ok(list.every((e) => e.bossFlag === 1 && e.side === 'enemy' && e.level === TRIALS_FLOORS[f - 1].level));
    }
    assert.equal(stageCount(trialsCfg(3)!), 2);
    assert.deepEqual([1, 2, 4, 5].map((f) => stageCount(trialsCfg(f)!)), [1, 1, 1, 1]);
  });

  it('floor 3: stage 0 is Haka Leeds + 3 guards, stage 1 Orlando + 5 phân thân', () => {
    assert.deepEqual(enemies(3, 0).map((e) => e.refId), [1802, 1794, 1796, 1797]);
    assert.deepEqual(enemies(3, 1).map((e) => e.refId), [1803, 1795, 1804, 1805, 1806, 1807]);
    assert.equal(enemies(3, 0)[0].summon, undefined);
  });

  it('HP / attack are the pin scaled to the floor level (HP level^3, damage linear)', () => {
    const [thanatos] = enemies(1);
    assert.equal(thanatos.hpMax, Math.round(36_000_000 * (130 ** 3 / 150 ** 3)));
    assert.equal(thanatos.attack, Math.round(120_000 * (13 / 15)));
    assert.equal(thanatos.defense, Math.round(60_000 * (13 / 15)));
    assert.equal(thanatos.mpMax, Math.round(1_000_000 * (130 ** 3 / 150 ** 3)));
    assert.equal(thanatos.hp, thanatos.hpMax);
    const [khakass] = enemies(5);
    assert.equal(khakass.hpMax, 65_000_000); // floor 5 runs at the pin level
    assert.deepEqual(scalePin(THANATOS_PINS[CR.THANATOS], 150), THANATOS_PINS[CR.THANATOS]);
  });

  it('bosses roll at scale 3 with their pool, escorts at scale 2 with their pin skills', () => {
    const f1 = enemies(1);
    assert.deepEqual([f1[0].npc?.chanceScale, f1[1].npc?.chanceScale], [3, 2]);
    assert.deepEqual(f1[0].npc?.pool, [6384, 6399, 6402, 6400, 6401]);
    assert.deepEqual(f1[2].npc?.pool, [4030, 6403]); // Bi Ai
  });

  it('Khakass copies every other boss pool after his own; other floors do not', () => {
    const pool = bossSkillPool(trialsCfg(5)!, CR.KHAKASS);
    assert.deepEqual(pool.slice(0, 7), [6385, 6386, 6398, 6408, 6409, 6410, 6417]);
    for (const id of [6384, 6429, 6418, 6413, 6414]) assert.ok(pool.includes(id), String(id));
    assert.equal(new Set(pool).size, pool.length);
    assert.deepEqual(bossSkillPool(trialsCfg(1)!, CR.THANATOS), [6384, 6399, 6402, 6400, 6401]);
    assert.deepEqual(enemies(5)[0].npc?.pool, pool);
  });

  it('floor 2: 24 pinned Deeven copies, 2 per round from round 2, refilling dead slots', () => {
    const boss = enemies(2)[0];
    const s = boss.summon!;
    assert.deepEqual([s.startRound, s.perRound, s.every, s.refill, s.split, s.pending.length], [2, 2, 1, true, 0, 24]);
    const copy = s.pending[0];
    assert.equal(copy.refId, 1846);
    assert.equal(copy.hpMax, Math.round(24_626 * (135 ** 3 / 150 ** 3)));
    assert.equal(copy.slot, -1);
    assert.deepEqual(copy.npc?.pool, [6429]);
    assert.notEqual(s.pending[0], s.pending[1]);
  });

  it('floor 5: one Orlando 1851 summoned from round 3; no summon elsewhere', () => {
    const s = enemies(5)[0].summon!;
    assert.deepEqual([s.startRound, s.perRound, s.pending.length, s.pending[0].refId, s.refill], [3, 1, 1, 1851, false]);
    assert.deepEqual([1, 4].map((f) => enemies(f)[0].summon), [undefined, undefined]);
  });

  it('a missing boss template gives no battle, a missing escort is skipped', () => {
    const f = (miss: number) => stageEnemies(TRIALS_FLOORS[0], trialsCfg(1)!, 0, (id) => (id === miss ? undefined : template(id)));
    assert.deepEqual(f(1814), []);
    assert.equal(f(1816).length, 7);
  });
});

describe('trials in the round engine', () => {
  const tank = (): Fighter => mk(10, 'player', { hp: 1e12, hpMax: 1e12, attack: 1, speed: 1 });
  const defend = new Map([[10, { action: BattleAction.DEFENCE, targetSlot: 0 }]]);
  const play = (fs: Map<number, Fighter>, from: number, to: number, rule?: ReturnType<typeof floorDeathRule>): void => {
    for (let r = from; r <= to; r++) resolveRound(fs, defend, r, seq([0.99], 0.99), undefined, env({}), rule);
  };

  it('floor 2: Deeven summons copies in round 2 (two into the free slots) and not in round 1', () => {
    const fs = board(tank(), ...enemies(2));
    play(fs, 1, 1);
    assert.equal([...fs.values()].filter((f) => f.refId === 1846).length, 1);
    play(fs, 2, 2);
    const copies = [...fs.values()].filter((f) => f.refId === 1846 && f.slot !== 0);
    assert.equal(copies.length, 2);
    assert.ok(copies.every((c) => c.alive && c.side === 'enemy' && c.summon === undefined));
  });

  it('floor 2: Deeven comes back once while a storm guide lives, never when none does', () => {
    const cfg = trialsCfg(2)!;
    const rule = floorDeathRule(cfg, 0, TRIALS.TWIN_ROUNDS)!;
    const fs = board(tank(), ...enemies(2));
    const deeven = fs.get(0)!;
    deeven.alive = false;
    deeven.hp = 0;
    assert.deepEqual(rule.revivals(fs, 3).map((f) => f.slot), [0]);
    deeven.alive = false;
    assert.deepEqual(rule.revivals(fs, 4), []); // only once
    const bare = floorDeathRule(cfg, 0, 2)!;
    for (const f of fs.values()) if ([1840, 1847, 1843, 1837].includes(f.refId)) f.alive = false;
    assert.deepEqual(bare.revivals(fs, 3), []);
  });

  it('floor 4: a dead twin returns 2 rounds later while the other lives, not when both are down', () => {
    const rule = floorDeathRule(trialsCfg(4)!, 0, TRIALS.TWIN_ROUNDS)!;
    const fs = board(tank(), ...enemies(4));
    const catos = fs.get(0)!;
    const pollux = [...fs.values()].find((f) => f.refId === 1822)!;
    catos.alive = false;
    assert.deepEqual(rule.revivals(fs, 3), []);
    assert.deepEqual(rule.revivals(fs, 4), []);
    assert.deepEqual(rule.revivals(fs, 5).map((f) => f.refId), [1821]);
    catos.alive = false;
    pollux.alive = false; // both down: neither returns
    assert.deepEqual(rule.revivals(fs, 9), []);
    assert.deepEqual(rule.revivals(fs, 12), []);
  });

  it('floors 1 / 3 / 5 have no death rule', () => {
    assert.deepEqual([1, 3, 5].map((f) => floorDeathRule(trialsCfg(f)!, f === 3 ? 1 : 0, 2)), [undefined, undefined, undefined]);
    assert.equal(floorDeathRule(trialsCfg(3)!, 0, 2), undefined);
  });
});

const SEEDS = path.resolve(process.env.SEED_DIR ?? path.join(__dirname, '../../../../../mcgame/supabase/seeds'));
const seedRows = (file: string): Row[] => {
  const p = path.join(SEEDS, file);
  return existsSync(p) ? parseFile(readFileSync(p, 'utf8')).flatMap((ins) => toDocs(ins) as Row[]) : [];
};

describe('trials kits', { skip: !existsSync(path.join(SEEDS, 'data_tbl_skill.sql')) && 'legacy seeds not found' }, () => {
  const skills = buildSkillTable(seedRows('data_tbl_skill.sql'));
  const buffs = new Map(seedRows('data_tbl_buff.sql').map((r) => [Number(r.id), r]));
  const kind = (id: number): string => {
    const t = skills.get(id);
    return t ? buildNpcSkill(t, (b) => buffs.get(b)).kind : 'missing';
  };

  it('every pooled skill exists and the AI can run it (damage / heal / state / passive)', () => {
    assert.ok(TRIALS_SKILL_IDS.length > 30);
    assert.deepEqual(TRIALS_SKILL_IDS.filter((id) => kind(id) === 'missing'), []);
    assert.deepEqual(TRIALS_SKILL_IDS.filter((id) => !['damage', 'heal', 'state', 'passive'].includes(kind(id))).map((id) => [id, kind(id)]), []);
  });

  it('the creature rows exist in the config', () => {
    assert.equal(TRIALS_CFG.length, 5);
    assert.ok(Object.keys(KHAKASS_PINS).length === 4);
  });
});
