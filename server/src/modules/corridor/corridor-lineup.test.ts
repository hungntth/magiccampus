// Tests for the Hành Lang Vô Tận line-ups (Go lineups / config / stats tests): unit counts, slots, fixed stats, the level-bonus rescale,
// summon plans (Marita refill, Gnaw, Kiếm Thánh, Quân Thần), kits / openers and floor kits, plus every kit skill against the legacy seeds.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseFile, toDocs } from '../../../tools/seed-parser';
import { buildSkillTable } from '../gamedata/skill-data';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { buildNpcSkill, type Row } from '../combat/mechanics/npc-skills';
import { attackForLevel, bossStats, FLOOR_KITS, floorLevel, floorLineup, minionHp, minionStats, scaleBossDamage } from './corridor-config';
import { CREATURE_KITS } from './corridor-kits';
import { displayName, floorEnemies } from './corridor-lineup';

const template = (id: number): CreatureTemplate => ({
  id, name: `c${id}`, useLevel: 100, life: 10000, growBase: 1,
  att: { str: 100, agi: 100, sta: 100, int: 100, eng: 100 }, apt: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 },
  propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode: '0', element: 0,
});
const lookup = (id: number): CreatureTemplate => template(id);
const enemies = (floor: number, level = 160) => floorEnemies(floor, lookup, level);

describe('corridor line-ups', () => {
  it('starting enemies per floor (10 units at most, boss in the centre, no slot used twice)', () => {
    const starting = Array.from({ length: 12 }, (_, i) => enemies(i + 1).length);
    assert.deepEqual(starting, [3, 5, 10, 10, 10, 10, 10, 10, 3, 10, 1, 10]);
    for (let f = 1; f <= 12; f++) {
      const e = enemies(f);
      assert.equal(e[0].slot, 0);
      assert.equal(new Set(e.map((x) => x.slot)).size, e.length);
      assert.ok(e.every((x) => x.bossFlag === 1 && x.side === 'enemy'));
    }
    assert.deepEqual(enemies(3).slice(0, 3).map((x) => x.slot), [0, 2, 1]); // escorts at Left1 then Right1
  });

  it('floor 12 is floor 4 roster with its own stat row; floor 13 has nothing', () => {
    assert.equal(floorLineup(12)?.name, 'Sethia');
    assert.equal(enemies(12)[0].refId, 2083);
    assert.equal(enemies(12)[0].hpMax, 1_000_000_000);
    assert.equal(floorLineup(13), undefined);
    assert.deepEqual(enemies(13), []);
  });

  it('boss and minion rows: fixed HP / MP / defence, speed x10, XPN 60, attack rescaled from level 150', () => {
    const [boss, mate] = enemies(2, 120);
    assert.equal(boss.hpMax, 53_030_000);
    assert.equal(boss.mpMax, 1_250_000);
    assert.equal(boss.level, 120);
    assert.equal(boss.speed, 60_300);
    assert.equal(boss.defense, 160770);
    assert.equal(boss.defy, 60);
    assert.equal(boss.attack, scaleBossDamage(2, attackForLevel(151630, 120)));
    assert.equal(mate.hpMax, minionStats(2)!.hp);
    assert.equal(mate.hpMax, 21_212_000);
    assert.equal(mate.speed, Math.trunc(6030 * 0.9) * 10);
    assert.equal(mate.attack, attackForLevel(Math.trunc(151630 * 0.5), 120));
  });

  it('floor 1: level fixed at 150, measured minion HP / MP, Marita refill wave of 60 Oseen / Halu at 3M HP', () => {
    const e = enemies(1, 90);
    assert.ok(e.every((x) => x.level === 150));
    assert.equal(floorLevel(1, 90), 150);
    assert.equal(e[1].hpMax, 25_000_000);
    assert.equal(e[1].mpMax, 15_000_000);
    const plan = e[0].summon!;
    assert.deepEqual([plan.startRound, plan.perRound, plan.refill, plan.pending.length], [1, 3, true, 60]);
    assert.deepEqual(plan.pending.slice(0, 3).map((u) => u.refId), [2046, 2045, 2046]);
    assert.ok(plan.pending.every((u) => u.hpMax === 3_000_000 && u.hp === 3_000_000 && !u.summon));
  });

  it('summon waves: Gnaw 5 (3 / round), Kiếm Thánh 7 (6 / round), Quân Thần 9 (9 / round, alone at the start)', () => {
    const gnaw = enemies(2)[0].summon!;
    assert.deepEqual([gnaw.perRound, gnaw.refill, gnaw.pending.map((u) => u.refId)], [3, false, [2052, 2053, 2052, 2053, 2052]]);
    const kiem = enemies(9)[0].summon!;
    assert.deepEqual([kiem.perRound, kiem.pending.length, kiem.pending[0].refId], [6, 7, 2193]);
    const quan = enemies(11);
    assert.equal(quan.length, 1);
    assert.deepEqual([quan[0].summon!.perRound, quan[0].summon!.pending.map((u) => u.refId)], [9, [2241, 2242, 2241, 2242, 2243, 2245, 2241, 2242, 2244]]);
    assert.equal(enemies(3)[0].summon, undefined);
  });

  it('HP shares: floor 3 captain / guards / soldiers and floor 5 minions follow the boss HP', () => {
    const boss = bossStats(3)!.hp;
    assert.equal(minionHp(3, 2081), Math.trunc(boss * 0.875));
    assert.equal(minionHp(3, 2079), Math.trunc(boss * 0.75));
    assert.equal(minionHp(3, 2082), Math.trunc(boss * 0.25));
    assert.equal(minionHp(5, 2091), Math.trunc(bossStats(5)!.hp * (15 / 35)));
    assert.equal(minionHp(4, 2086), Math.trunc(bossStats(4)!.hp * 0.4));
    assert.equal(minionHp(9, 2194), 36_000_000);
  });

  it('kits: pools and floor 3 openers on the NPC kit, floor scale 2 / 2.5 / 3 / 3 and debuff hit 0 / 10 / 20 / 30', () => {
    const f3 = enemies(3);
    assert.deepEqual(f3[0].npc?.pool, [6638, 6639, 6640, 6645, 6647]);
    assert.deepEqual(f3[0].npc?.opener, [6638]);
    assert.deepEqual(f3.find((x) => x.refId === 2081)?.npc?.opener, [6648, 6646]);
    assert.deepEqual(FLOOR_KITS.map((k) => k.chanceScale), [2, 2, 2, 2.5, 2.5, 2.5, 3, 3, 3, 3, 3, 3]);
    assert.equal(enemies(1)[0].npc?.chanceScale, 2);
    assert.equal(enemies(1)[0].debuffHit, undefined);
    assert.equal(enemies(5)[0].debuffHit?.[0], 10);
    assert.equal(enemies(8)[0].debuffHit?.[0], 20);
    assert.equal(enemies(12)[0].debuffHit?.[0], 30);
    assert.equal(enemies(8)[0].npc?.chanceScale, 3);
  });

  it('boss damage x1.2 on floors 1-7 only; the level bonus cancels out at any level', () => {
    assert.equal(scaleBossDamage(7, 1000), 1200);
    assert.equal(scaleBossDamage(8, 1000), 1000);
    assert.equal(attackForLevel(126360, 150), 126360);
    assert.ok(attackForLevel(126360, 50) > attackForLevel(126360, 150));
  });

  it('data tags are dropped from the display name', () => {
    assert.equal(displayName('Kiếm Thánh【HLVT Quái Chính 】'), 'Kiếm Thánh');
    assert.equal(displayName('Barak'), 'Barak');
    assert.equal(displayName('【tag】'), '【tag】');
  });

  it('every creature of every line-up has a kit', () => {
    for (let f = 1; f <= 12; f++) {
      const l = floorLineup(f)!;
      for (const cid of [l.boss, ...l.escorts, ...l.minions, ...(l.summon?.units ?? [])]) assert.ok(CREATURE_KITS[cid], `creature ${cid} (floor ${f})`);
    }
  });
});

const SEEDS = path.resolve(process.env.SEED_DIR ?? path.join(__dirname, '../../../../../mcgame/supabase/seeds'));

describe('corridor kit skills', { skip: !existsSync(path.join(SEEDS, 'data_tbl_skill.sql')) && 'legacy seeds not found' }, () => {
  const rows = (file: string): Row[] => parseFile(readFileSync(path.join(SEEDS, file), 'utf8')).flatMap((ins) => toDocs(ins) as Row[]);
  const skills = buildSkillTable(rows('data_tbl_skill.sql'));
  const buffs = new Map(rows('data_tbl_buff.sql').map((r) => [Number(r.id), r]));

  it('every pooled skill exists and the engine can run it (or the AI skips it: cleanse / guard / type 13)', () => {
    const bad: number[] = [];
    for (const kit of Object.values(CREATURE_KITS)) {
      for (const id of [...kit.skills, ...(kit.opener ?? [])]) {
        const t = skills.get(id);
        const sk = t ? buildNpcSkill(t, (b) => buffs.get(b)) : undefined;
        if (!sk || (sk.kind === 'unsupported' && ![7, 10, 13].includes(sk.type))) bad.push(id);
      }
    }
    assert.deepEqual([...new Set(bad)], []);
  });

  it('openers are part of their creature pool', () => {
    for (const [cid, kit] of Object.entries(CREATURE_KITS)) for (const id of kit.opener ?? []) assert.ok(kit.skills.includes(id), `${cid}/${id}`);
  });
});
