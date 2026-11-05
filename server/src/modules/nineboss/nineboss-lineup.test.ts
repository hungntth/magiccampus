// Tests for the Kiếp Nạn Vô Ưu floor line-ups: slots, pinned HP / level scaling, kits (clone, split, revives, elite) and the skill
// pools against the legacy seed dumps (skipped when absent), through the E2 NPC skill builder.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseFile, toDocs } from '../../../tools/seed-parser';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { buildSkillTable } from '../gamedata/skill-data';
import { BattleAction } from '@mc/shared';
import type { Fighter } from '../combat/battle.types';
import { buildNpcSkill, type Row } from '../combat/mechanics/npc-skills';
import { board, env, mk, seq } from '../combat/mechanics/test-kit';
import { resolveRound } from '../combat/round';
import { NINE_FLOORS, NINE_KIT_SKILLS, nineFloor } from './nineboss-config';
import { floorEnemies } from './nineboss-lineup';

const template = (id: number): CreatureTemplate => ({
  id, name: `c${id}`, useLevel: 100, life: 10000, growBase: 1,
  att: { str: 100, agi: 100, sta: 100, int: 100, eng: 100 }, apt: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 },
  propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode: '0', element: 0,
});
const lookup = (id: number): CreatureTemplate => template(id);
const floor = (n: number) => nineFloor(n)!;

describe('nine boss line-ups', () => {
  it('unit counts and slots per floor (boss in the centre, no slot used twice)', () => {
    const counts = NINE_FLOORS.map((f) => floorEnemies(f, lookup, 160).length);
    assert.deepEqual(counts, [6, 10, 8, 7, 5, 4, 8, 2, 10]);
    for (const f of NINE_FLOORS) {
      const enemies = floorEnemies(f, lookup, 160);
      assert.equal(enemies[0].slot, 0);
      assert.equal(new Set(enemies.map((e) => e.slot)).size, enemies.length);
      assert.ok(enemies.every((e) => e.bossFlag === 1 && e.side === 'enemy'));
    }
  });

  it('HP is the pin at the pin level and scales down along level^3 below it', () => {
    const at160 = floorEnemies(floor(5), lookup, 160);
    assert.equal(at160[0].hpMax, 44_070_400);
    assert.equal(at160[0].mpMax, 1_000_000);
    assert.equal(at160[0].level, 160);
    const at130 = floorEnemies(floor(5), lookup, 130);
    assert.equal(at130[0].level, 130);
    assert.equal(at130[0].hpMax, Math.round(44_070_400 * (130 ** 3 / 160 ** 3)));
    assert.equal(at130.find((e) => e.refId === 1310)!.level, 131); // the lv161 Thánh Đạo Sư keeps its +1
  });

  it('pinned skill pools reach the NPC kit; units without a pin keep the creature_skill pool', () => {
    const f1 = floorEnemies(floor(1), lookup, 150);
    assert.deepEqual(f1[0].npc?.pool, [5964, 5963]);
    const f3 = floorEnemies(floor(3), lookup, 160);
    assert.equal(f3.find((e) => e.refId === 1288)!.npc?.pool, undefined);
  });

  it('floor 3: Chu Ma carries HP x1.5, damage x3, XPN 40, crit 90 and a once-only clone summon from round 11', () => {
    const plain = floorEnemies({ ...floor(3), hpPct: undefined, damagePct: undefined }, lookup, 160)[0];
    const [boss] = floorEnemies(floor(3), lookup, 160);
    assert.equal(boss.hpMax, 16_999_321);
    assert.equal(boss.attack, Math.trunc(plain.attack * 3));
    assert.equal(boss.defy, 40);
    assert.equal(boss.critical, 90);
    assert.equal(boss.summon?.startRound, 11);
    assert.equal(boss.summon?.perRound, 1);
    assert.equal(boss.summon?.pending.length, 1);
    assert.equal(boss.summon?.pending[0].refId, 1305);
    assert.equal(boss.summon?.pending[0].hpMax, 16_999_321);
  });

  it('floor 6: Hydra split plan with a pool of 60 clones, 3 per death, never through the AI; damage x1.5', () => {
    const [hydra] = floorEnemies(floor(6), lookup, 160);
    assert.equal(hydra.summon?.split, 3);
    assert.equal(hydra.summon?.perRound, 0);
    assert.equal(hydra.summon?.pending.length, 60);
    assert.ok(hydra.summon!.pending.every((u) => u.refId === 1301 && u.hpMax === 15_064_064 && u.bossFlag === 1));
    const plain = floorEnemies({ ...floor(6), damagePct: undefined }, lookup, 160)[0];
    assert.equal(hydra.attack, Math.trunc(plain.attack * 1.5));
    // separate objects: killing one clone must not touch the others
    assert.notEqual(hydra.summon!.pending[0], hydra.summon!.pending[1]);
  });

  it('floor 7: eight Atula, every one with 60 same-round revives', () => {
    const enemies = floorEnemies(floor(7), lookup, 150);
    assert.equal(enemies.length, 8);
    assert.ok(enemies.every((e) => e.refId === 1306 && e.roundRevives === 60 && e.hpMax === 38_611_079));
  });

  it('floor 8: Mehdi 1304 in the centre and Fernando 1303 beside him with the elite kit', () => {
    const [mehdi, fernando] = floorEnemies(floor(8), lookup, 150);
    assert.deepEqual([mehdi.refId, mehdi.slot, fernando.refId], [1304, 0, 1303]);
    for (const f of [mehdi, fernando]) {
      assert.equal(f.hpMax, 50_625_000);
      assert.equal(f.combo, 99);
      assert.equal(f.counter, 100);
      assert.equal(f.npc?.elite, true);
      assert.equal(f.npc?.chanceScale, 3);
    }
    assert.deepEqual(mehdi.npc?.pool, [6008, 6007, 6006, 6011, 6010]);
  });

  it('a missing boss template gives no battle; a missing escort is skipped', () => {
    assert.deepEqual(floorEnemies(floor(2), (id) => (id === 1274 ? undefined : template(id)), 160), []);
    assert.equal(floorEnemies(floor(2), (id) => (id === 1275 ? undefined : template(id)), 160).length, 9);
  });
});

describe('nine boss kits in the round engine', () => {
  const tank = (): Fighter => mk(10, 'player', { hp: 1e12, hpMax: 1e12, attack: 1, speed: 1 });
  const defend = new Map([[10, { action: BattleAction.DEFENCE, targetSlot: 0 }]]);
  const play = (fs: Map<number, Fighter>, from: number, to: number): void => {
    for (let r = from; r <= to; r++) resolveRound(fs, defend, r, seq([0.99], 0.99), undefined, env({}));
  };

  it('floor 3: the Chu Ma Phan Than 1305 appears in round 11 and not before', () => {
    const fs = board(tank(), ...floorEnemies(floor(3), lookup, 160));
    play(fs, 1, 10);
    assert.equal([...fs.values()].some((f) => f.refId === 1305), false);
    play(fs, 11, 11);
    const clone = [...fs.values()].find((f) => f.refId === 1305);
    assert.ok(clone && clone.alive && clone.side === 'enemy' && clone.bossFlag === 1);
  });

  it('floor 6: a dead Phan Than is replaced by 3 from the pool at the next round start', () => {
    const fs = board(tank(), ...floorEnemies(floor(6), lookup, 160));
    const clones = [...fs.values()].filter((f) => f.refId === 1301);
    clones[0].alive = false;
    clones[0].hp = 0;
    play(fs, 2, 2);
    assert.equal([...fs.values()].filter((f) => f.refId === 1301 && f.alive).length, 2 + 3);
    assert.equal(fs.get(0)?.summon?.pending.length, 57);
  });

  it('floor 7: a dead Atula returns at the next round start while another lives', () => {
    const fs = board(tank(), ...floorEnemies(floor(7), lookup, 150));
    const a = fs.get(3)!;
    a.alive = false;
    a.hp = 0;
    play(fs, 2, 2);
    assert.equal(a.alive, true);
    assert.equal(a.roundRevives, 59);
  });
});

const SEEDS = path.resolve(process.env.SEED_DIR ?? path.join(__dirname, '../../../../../mcgame/supabase/seeds'));
const seedRows = (file: string): Row[] => {
  const p = path.join(SEEDS, file);
  return existsSync(p) ? parseFile(readFileSync(p, 'utf8')).flatMap((ins) => toDocs(ins) as Row[]) : [];
};

describe('nine boss kits', { skip: !existsSync(path.join(SEEDS, 'data_tbl_skill.sql')) && 'legacy seeds not found' }, () => {
  const skills = buildSkillTable(seedRows('data_tbl_skill.sql'));
  const buffs = new Map(seedRows('data_tbl_buff.sql').map((r) => [Number(r.id), r]));
  const kind = (id: number): string => {
    const t = skills.get(id);
    return t ? buildNpcSkill(t, (b) => buffs.get(b)).kind : 'missing';
  };

  it('every pinned skill exists in data_tbl_skill', () => {
    assert.deepEqual(NINE_KIT_SKILLS.filter((id) => kind(id) === 'missing'), []);
  });

  it('the AI can run every pinned skill (damage / heal / state; passives are skipped by the AI)', () => {
    const odd = NINE_KIT_SKILLS.filter((id) => !['damage', 'heal', 'state', 'passive'].includes(kind(id)));
    assert.deepEqual(odd.map((id) => [id, kind(id)]), []);
  });
});
