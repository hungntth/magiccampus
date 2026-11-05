// Unit tests for the phase B per-dungeon pure rules: Quỷ Hút Máu reveal chain, Mê Huyễn spawn visibility and tuning, the Kho
// Báu boss kit and the quest pick-up item choice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fighter } from '../combat/battle.types';
import { nodeItem, nodeQuestIds } from './dungeon-pickup.hooks';
import { KHOBAU_TUNING, tuneKhoBau } from './khobau/khobau.hooks';
import { MH, MH_FLOWERS, mhBossVisible, mhFlowerVisible, tuneMeHuyenLineup, tuneMeHuyenMobs, type MhView } from './mehuyen/mehuyen-layout';
import { qhmRevealedBy, qhmVisible } from './quyhutmau/quyhutmau-layout';

const unit = (p: Partial<Fighter>): Fighter => ({
  slot: 0, side: 'enemy', kind: 'creature', refId: 1, name: 'x', level: 50, hp: 1000, hpMax: 1000, mp: 0, mpMax: 0, sp: 0, spMax: 0,
  attack: 1000, magicAttack: 1000, defense: 1000, magicDefense: 1000, hit: 0, dodge: 100, critical: 0, criticalDmg: 200, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0, enhPhyHurt: 0,
  enhMagicHurt: 0, resCode: '0', bossFlag: 0, alive: true, ...p,
} as Fighter);

test('Quỷ Hút Máu: the legion after the king, the portal after the legion, beaten fights hidden', () => {
  const ids = (b: number[]) => qhmVisible(b).map((s) => s.npc);
  assert.deepEqual(ids([]), [1732, 1733, 1734, 1735, 1736, 1738, 1737, 1739, 1740]);
  assert.ok(ids([1740]).includes(1741) && !ids([1740]).includes(1740));
  assert.ok(ids([1740, 1741]).includes(1743) && ids([1740, 1741, 1743]).includes(1743)); // the portal stays
  assert.deepEqual(qhmRevealedBy(1740).map((s) => s.npc), [1741]);
});

test('Mê Huyễn: the final boss after the cure, flowers between the guards and the cure', () => {
  const v = (p: Partial<MhView>): MhView => ({ active: true, beaten: [], marks: [], cured: false, ...p });
  assert.equal(mhBossVisible(v({}), MH.FINAL_BOSS), false);
  assert.equal(mhBossVisible(v({ cured: true }), MH.FINAL_BOSS), true);
  assert.equal(mhBossVisible(v({ beaten: [MH.WRAITH] }), MH.WRAITH), false);
  const f = MH_FLOWERS[0].id;
  assert.equal(mhFlowerVisible(v({ beaten: [MH.GUARD_A] }), f), false);
  assert.equal(mhFlowerVisible(v({ beaten: [MH.GUARD_A, MH.GUARD_B] }), f), true);
  assert.equal(mhFlowerVisible(v({ beaten: [MH.GUARD_A, MH.GUARD_B], marks: [f] }), f), false);
  assert.equal(mhFlowerVisible(v({ beaten: [MH.GUARD_A, MH.GUARD_B], cured: true }), f), false);
  assert.equal(MH_FLOWERS.length, 12);
});

test('Mê Huyễn tuning: guards scale only 1008, the final fight every unit, fixed lives grow with the level', () => {
  const guard = [unit({ refId: 1008, level: 56 }), unit({ refId: 1007 })];
  tuneMeHuyenLineup(MH.GUARD_A, guard);
  assert.equal(guard[0].hpMax, 616_000);
  assert.equal(guard[0].attack, 350);
  assert.equal(guard[0].defense, 450);
  assert.equal(guard[1].attack, 1000);
  const final = [unit({ refId: 1006, level: 58 }), unit({ refId: 1007 })];
  tuneMeHuyenLineup(MH.FINAL_BOSS, final);
  assert.equal(final[0].hpMax, 1_160_000);
  assert.equal(final[1].hpMax, 450);
  const mobs = [unit({ bossFlag: 0 }), unit({ bossFlag: 1 })];
  tuneMeHuyenMobs(2003, mobs);
  assert.deepEqual(mobs.map((m) => m.hpMax), [5000, 1000]);
});

test('Kho Báu kit: skill roll, Đồng Bì defence / dodge, Xác Ướp speed, halved guardian', () => {
  const dong = unit({ refId: 325 });
  tuneKhoBau(dong, KHOBAU_TUNING[325]);
  assert.deepEqual([dong.defense, dong.dodge, dong.npc?.chanceScale], [2000, 300, 2]);
  const mummy = unit({ refId: 326 });
  tuneKhoBau(mummy, KHOBAU_TUNING[326]);
  assert.equal(mummy.speed, 150);
  const g = unit({ refId: 204 });
  tuneKhoBau(g, KHOBAU_TUNING[204]);
  assert.deepEqual([g.hpMax, g.hp, g.attack, g.npc], [500, 500, 500, undefined]);
});

test('quest pick-ups: qid parsing and the node-named item', () => {
  assert.deepEqual(nodeQuestIds('|1462'), [1462]);
  assert.deepEqual(nodeQuestIds('5548'), [5548]);
  const rows = [{ kind: 1, type: 29, itemId: 7200, num: 1 }, { kind: 1, type: 29, itemId: 7202, num: 1 }, { kind: 2, type: 0, itemId: 9, num: 1 }];
  const names: Record<number, string> = { 7200: 'Ghi Chép Nghiên Cứu 1', 7202: 'Ghi Chép Nghiên Cứu 2' };
  assert.deepEqual(nodeItem('Ghi Chép Nghiên Cứu 2', rows, (id) => names[id] ?? ''), { itemId: 7202, need: 1 });
  assert.deepEqual(nodeItem('Bảo Rương Cổ', rows, (id) => names[id] ?? ''), { itemId: 7200, need: 1 });
});
