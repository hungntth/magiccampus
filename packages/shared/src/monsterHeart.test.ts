// Monster heart rules (M13 phase E2): upgrade rates, combine detection and the owner worked example (two white lv0 keys on 11011).

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MONSTER_HEART, boxRatio, buildCombineGroups, emptyMonsterHeartData, heartPropTotals, heartStatLines, monsterHeartBagKey, monsterHeartDiamondColor,
  monsterHeartPanelScale, monsterHeartUpgradeRate, recomputeCombines, type CombineRow, type ContainRow, type HeartRow,
} from './monsterHeart.js';

const heart = (id: number, type: number, color: number, over: Partial<HeartRow> = {}): HeartRow => ({
  id, type, color, exp: color + 1, talent: 10000, propType: 4, propNum: 100000, name: `h${id}`, ...over,
});
const combine = (id: number, over: Partial<CombineRow> = {}): CombineRow => ({
  id, name: 'Mui Ten', holes: [1, 2], types: [1, 1], pt: [4, -1, -1], pn: [70475 * (id % 10), -1, -1], max: id % 10 === 1 ? 8456952 : -1, show: 1, ...over,
});
const contain = (lev: number, num: number): ContainRow => ({ id: 10 + lev, exp: 1, goldNum: 1, num });

test('upgrade rates and tables', () => {
  assert.equal(monsterHeartUpgradeRate(0, 2), 25);
  assert.equal(monsterHeartUpgradeRate(4, 5), 20);
  assert.equal(monsterHeartUpgradeRate(0, 1), 0);
  assert.equal(monsterHeartUpgradeRate(5, 2), 0);
  assert.deepEqual([0, 1, 6, 11, 16, 3].map(monsterHeartDiamondColor), [0, 1, 2, 3, 4, 0]);
  assert.equal(monsterHeartBagKey(1), 'ren');
  assert.equal(monsterHeartBagKey(7), 'te');
  assert.equal(monsterHeartBagKey(8), null);
  assert.deepEqual([4, 59, 63].map(monsterHeartPanelScale), [10000, 100, 100]);
});

test('default state opens only box 1 hole 1', () => {
  const d = emptyMonsterHeartData();
  assert.equal(d.hadActHole[1]![1], MONSTER_HEART.EMPTY_HOLE);
  assert.equal(d.hadActHole[1]![2], MONSTER_HEART.CLOSED_HOLE);
  assert.equal(d.heartBoxLev[5], 1);
});

test('combine detection: complete group, unordered types, colour = lowest + 1, talent = sum', () => {
  const rows = [combine(11011), combine(11012), combine(11021, { types: [1, 2] })];
  const groups = buildCombineGroups(rows);
  assert.equal(groups.size, 1); // 11011 and 11021 share group 110
  const hearts = new Map([[1, heart(1, 1, 0, { talent: 10000 })], [2, heart(2, 1, 1, { talent: 11000 })], [3, heart(3, 2, 0)]]);
  const rowOf = (id: number) => rows.find((r) => r.id === id);
  const data = emptyMonsterHeartData();
  data.hadActHole[1]![1] = 1;
  assert.deepEqual(recomputeCombines(data.hadActHole, (id) => hearts.get(id), groups, rowOf)[1], {});
  data.hadActHole[1]![2] = 2;
  assert.deepEqual(recomputeCombines(data.hadActHole, (id) => hearts.get(id), groups, rowOf)[1], { 1101: { color: 1, talent: 21000 } });
  data.hadActHole[1]![2] = 3; // types [1, 2] map to pid 1102 (colour 1 row exists)
  assert.deepEqual(recomputeCombines(data.hadActHole, (id) => hearts.get(id), groups, rowOf)[1], { 1102: { color: 1, talent: 20000 } });
  const noRow = (id: number) => (id === 11021 ? undefined : rowOf(id));
  assert.deepEqual(recomputeCombines(data.hadActHole, (id) => hearts.get(id), groups, noRow)[1], {});
});

test('worked example: two white lv0 keys on 11011 give attack +14 at box lv1 and +28 at lv6', () => {
  const rows = [combine(11011, { pn: [70475, -1, -1] })];
  const hearts = new Map([[1, heart(1, 1, 0, { propType: 0, propNum: 0, talent: 10000 })]]);
  const data = emptyMonsterHeartData();
  data.hadActHole[1]![1] = 1;
  data.hadActHole[1]![2] = 1;
  data.hadActCombine = recomputeCombines(data.hadActHole, (id) => hearts.get(id), buildCombineGroups(rows), (id) => rows.find((r) => r.id === id));
  assert.deepEqual(data.hadActCombine[1], { 1101: { color: 1, talent: 20000 } });
  const contains = [contain(1, 10000), contain(6, 20000)];
  const look = { heart: (id: number) => hearts.get(id), combine: (id: number) => rows.find((r) => r.id === id), contain: (id: number) => contains.find((c) => c.id === id) };
  assert.equal(boxRatio(look, 1, 1), 1);
  const at = (lev: number): number => {
    data.heartBoxLev[1] = lev;
    return Math.round(heartPropTotals(heartStatLines(data, look)).get(4) ?? 0);
  };
  assert.equal(at(1), 14); // 14.095
  assert.equal(at(6), 28); // 28.19
});

test('placed hearts use propnum / scale; the combine max caps the first line', () => {
  const rows = [combine(11011, { pn: [70475, -1, -1], max: 5000 })];
  const hearts = new Map([[1, heart(1, 1, 0, { propType: 59, propNum: 250, talent: 10000 })]]);
  const data = emptyMonsterHeartData();
  data.hadActHole[1]![1] = 1;
  data.hadActHole[1]![2] = 1;
  data.hadActCombine = { 1: { 1101: { color: 1, talent: 20000 } }, 2: {}, 3: {}, 4: {}, 5: {} };
  const look = { heart: (id: number) => hearts.get(id), combine: (id: number) => rows.find((r) => r.id === id), contain: () => undefined };
  const lines = heartStatLines(data, look);
  assert.equal(lines.filter((l) => l.source === 'heart').length, 2);
  assert.equal(lines.find((l) => l.source === 'heart')!.value, 2.5);
  assert.equal(lines.find((l) => l.source === 'combine')!.value, 0.5); // capped 5000 / 10000
});
