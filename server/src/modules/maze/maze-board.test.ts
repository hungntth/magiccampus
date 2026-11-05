// Mê Trận pure rules: board generation (25 % empty, weights), neighbours, jump candidates, wire state, door labels, event effects,
// skip / fail rules, sub-panel rules (shop, lottery, quiz steps) and the battle plan.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAZE_END_CELL } from '@mc/shared';
import { doorLabel, generateBoard, jumpCandidates, neighbor, newRun, roomDoors, wireState } from './maze-board';
import { applyEvent, arrive, battlePlan, canSkip, dropCost, goddessBuff, hpAfterPercent, lossHp, moveThrough, rollLottery, rollQuiz, rollShop, shouldFail, validQuizStep } from './maze-events';
import { DEFAULT_EVENT_WEIGHTS, DOOR_POINT, CLICK_RADIUS } from './maze-config';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const fresh = (seed = 1) => newRun(seeded(seed), DEFAULT_EVENT_WEIGHTS, 3, { map: 1, x: 10, y: 20 });
const name = (e: number): string => `E${e}`;

test('neighbours stay on the 6x9 grid', () => {
  assert.equal(neighbor(0, 1), null);
  assert.equal(neighbor(0, 3), null);
  assert.equal(neighbor(0, 2), 6);
  assert.equal(neighbor(0, 4), 1);
  assert.equal(neighbor(5, 4), null);
  assert.equal(neighbor(53, 2), null);
  assert.equal(neighbor(53, 1), 47);
  assert.equal(neighbor(9, 9), null);
});

test('jump candidates are distance 1-2 and inside the grid', () => {
  assert.deepEqual([...jumpCandidates(0)].sort((a, b) => a - b), [1, 2, 6, 7, 12]);
  assert.equal(jumpCandidates(14).length, 12);
});

test('board: start / end empty, about 25 % empty, only weighted types', () => {
  const board = generateBoard(seeded(7), DEFAULT_EVENT_WEIGHTS);
  assert.equal(board.length, 54);
  assert.equal(board[0], 0);
  assert.equal(board[53], 0);
  assert.ok(board.slice(1, 53).every((t) => t >= 0 && t <= 14));
  let empty = 0;
  for (let s = 1; s <= 200; s++) empty += generateBoard(seeded(s), DEFAULT_EVENT_WEIGHTS).slice(1, 53).filter((t) => t === 0).length;
  const rate = empty / (200 * 52);
  assert.ok(rate > 0.2 && rate < 0.3, `empty rate ${rate}`);
  const only12 = generateBoard(seeded(3), { 12: 1 });
  assert.ok(only12.slice(1, 53).every((t) => t === 0 || t === 12));
  assert.deepEqual(generateBoard(seeded(3), {}).filter(Boolean), []);
});

test('wire state carries counters, visited 0..52, currentIndex and buffs', () => {
  const run = fresh();
  run.visited[3] = true;
  run.visited[53] = true; // never sent
  run.buffs = [2688, 2690];
  const s = wireState(run);
  assert.equal(s.actNum, 25);
  assert.equal(s.skipNum, 3);
  assert.equal(s.recoverNum, 3);
  assert.equal(s['0'], true);
  assert.equal(s['3'], true);
  assert.equal(s['53'], undefined);
  assert.equal(s['1'], undefined);
  assert.equal(s.currentIndex, 0);
  assert.deepEqual(s.mazeBuff, { 1: 2688, 2: 2690 });
});

test('doors: gate per neighbour with labels, event NPC while pending, all within the click radius', () => {
  const run = fresh();
  run.board[1] = 11;
  run.board[6] = 0;
  run.visited[6] = false;
  let doors = roomDoors(run, name);
  assert.deepEqual(doors.map((d) => d.id), [900002, 900004]);
  assert.equal(doors.find((d) => d.dir === 4)!.name, 'Phải (ô 2): E11');
  assert.equal(doors.find((d) => d.dir === 2)!.name, 'Xuống (ô 7): Ô Trống');
  run.pending = 8;
  doors = roomDoors(run, name);
  const ev = doors.find((d) => d.id === 900010)!;
  assert.equal(ev.nid, 1916);
  assert.equal([ev.x, ev.y].join(','), '600,610');
  for (const d of doors) assert.ok(Math.hypot(d.x - 720, d.y - 490) <= CLICK_RADIUS, `door ${d.id} within ${CLICK_RADIUS}`);
  for (const [x, y] of Object.values(DOOR_POINT)) assert.ok(Math.hypot(x - 720, y - 490) <= CLICK_RADIUS);
  run.cur = 47;
  run.visited[53] = false;
  assert.equal(doorLabel(run, 2, 53, name), 'Xuống (ô 54): Điểm Cuối');
  run.visited[41] = true;
  assert.equal(doorLabel(run, 1, 41, name), 'Lên (ô 42): Đã Đi Qua');
});

test('moving spends a point, reveals an event once and finishes on the end cell', () => {
  const run = fresh();
  run.board[1] = 12;
  const rng = seeded(5);
  const r = moveThrough(run, 4, rng, [2007, 2008, 2009]);
  assert.deepEqual(r, { finished: false });
  assert.equal(run.actNum, 24);
  assert.equal(run.cur, 1);
  assert.equal(run.pending, 12);
  assert.ok([2007, 2008, 2009].includes(run.templateId));
  assert.equal(moveThrough(run, 1, rng, []), null, 'no neighbour above row 0');
  run.pending = 0;
  arrive(run, 0, rng, []);
  run.board[0] = 9;
  run.pending = 0;
  arrive(run, 1, rng, []); // already visited: no new event
  assert.equal(run.pending, 0);
  run.cur = 47;
  assert.deepEqual(moveThrough(run, 2, rng, []), { finished: true });
  assert.equal(run.cur, MAZE_END_CELL);
});

test('fail rule: no points, nothing pending, not at the end, no battle', () => {
  const run = fresh();
  run.actNum = 0;
  assert.equal(shouldFail(run), true);
  run.pending = 4;
  assert.equal(shouldFail(run), false);
  run.pending = 0;
  run.battle = { type: 11, startHp: 5 };
  assert.equal(shouldFail(run), false);
  run.battle = null;
  run.cur = 53;
  assert.equal(shouldFail(run), false);
});

test('skip rule: not for 4 5 7 8 9, needs a skip', () => {
  const run = fresh();
  for (const t of [4, 5, 7, 8, 9]) assert.equal(canSkip({ pending: t, skipNum: 3 }), false);
  for (const t of [1, 2, 3, 6, 10, 11, 12, 13, 14]) assert.equal(canSkip({ pending: t, skipNum: 1 }), true);
  assert.equal(canSkip({ pending: 11, skipNum: 0 }), false);
  assert.equal(canSkip({ pending: 0, skipNum: 3 }), false);
  assert.ok(run);
});

test('event effects', () => {
  const run = fresh();
  run.cur = 14;
  const rng = seeded(11);
  const jump = applyEvent(run, 1, rng, []);
  assert.equal(jump.kind, 'move');
  assert.ok(jumpCandidates(14).includes(run.cur));
  run.cur = 3;
  const warp = applyEvent(run, 2, seeded(2), []);
  assert.equal(warp.kind, 'move');
  assert.ok(run.cur === 0 || run.cur === 53);
  run.actNum = 10;
  for (let i = 0; i < 30; i++) {
    run.actNum = 10;
    applyEvent(run, 4, seeded(i + 1), []);
    assert.ok(run.actNum >= 11 && run.actNum <= 13);
    run.actNum = 10;
    applyEvent(run, 3, seeded(i + 40), []);
    assert.ok(run.actNum >= 7 && run.actNum <= 9);
  }
  run.actNum = 2;
  for (let i = 0; i < 20; i++) {
    run.actNum = 2;
    applyEvent(run, 3, seeded(i + 90), []);
    assert.ok(run.actNum >= 0);
  }
  assert.deepEqual(applyEvent(run, 5, rng, []), { kind: 'hp', percent: 20 });
  assert.deepEqual(applyEvent(run, 6, rng, []), { kind: 'hp', percent: -20 });
  assert.deepEqual(applyEvent(run, 8, rng, []), { kind: 'shop' });
  assert.deepEqual(applyEvent(run, 9, rng, []), { kind: 'lottery' });
  assert.deepEqual(applyEvent(run, 10, rng, []), { kind: 'quiz' });
  assert.deepEqual(applyEvent(run, 14, rng, []), { kind: 'battle', event: 14 });
  assert.deepEqual(applyEvent(run, 99, rng, []), { kind: 'none' });
});

test('goddess grants one distinct buff, none when all four are held', () => {
  const run = fresh();
  const got = new Set<number>();
  for (let i = 0; i < 4; i++) got.add(goddessBuff(run, seeded(i + 1))!);
  assert.equal(got.size, 4);
  assert.deepEqual([...run.buffs].sort(), [2688, 2689, 2690, 2691]);
  assert.equal(goddessBuff(run, seeded(9)), null);
  assert.equal(run.buffs.length, 4);
});

test('shop: two distinct offers at 30-70 % of list, min 1', () => {
  for (let s = 1; s < 50; s++) {
    const shop = rollShop(seeded(s));
    assert.equal(shop.length, 2);
    assert.notEqual(shop[0].itemId, shop[1].itemId);
    for (const o of shop) {
      assert.ok(o.after >= 1 && o.after <= Math.ceil(o.before * 0.7), `${o.after} of ${o.before}`);
      assert.ok(o.after >= Math.ceil(o.before * 0.3));
      assert.equal(o.sid, o.itemId);
    }
  }
});

test('lottery: 5 distinct cards, drop costs 5/10/15/20, at most 4, no repeat', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, rate: i % 3 === 0 ? 0 : 5 }));
  const lot = rollLottery(pool, seeded(4))!;
  assert.equal(new Set(lot.planIds).size, 5);
  assert.equal(rollLottery(pool.slice(0, 4), seeded(1)), null);
  assert.equal(dropCost(lot, 1), 5);
  lot.dropped.push(1);
  assert.equal(dropCost(lot, 1), null);
  assert.equal(dropCost(lot, 2), 10);
  lot.dropped.push(2);
  assert.equal(dropCost(lot, 3), 15);
  lot.dropped.push(3);
  assert.equal(dropCost(lot, 4), 20);
  lot.dropped.push(4);
  assert.equal(dropCost(lot, 5), null);
  assert.equal(dropCost(lot, 0), null);
  assert.equal(dropCost(null, 1), null);
  lot.finished = true;
  lot.dropped = [];
  assert.equal(dropCost(lot, 1), null);
});

test('quiz: 5 distinct ids and monotonic step validation', () => {
  const q = rollQuiz(Array.from({ length: 30 }, (_, i) => i + 1), seeded(3))!;
  assert.equal(new Set(q.ids).size, 5);
  assert.equal(rollQuiz([1, 2, 3], seeded(1)), null);
  assert.equal(validQuizStep(q, 1, 1), true);
  assert.equal(validQuizStep(q, 1, 2), false);
  assert.equal(validQuizStep(q, 0, 0), false);
  assert.equal(validQuizStep(q, 6, 5), false);
  q.answerNum = 2;
  q.rightNum = 1;
  assert.equal(validQuizStep(q, 3, 1), true);
  assert.equal(validQuizStep(q, 3, 0), false);
  assert.equal(validQuizStep(q, 4, 3), true, 'a dropped call may skip one step');
  assert.equal(validQuizStep(q, 3, 3), false);
  q.done = true;
  assert.equal(validQuizStep(q, 5, 5), false);
});

test('battle plan and HP rules', () => {
  for (let s = 1; s < 40; s++) {
    const p11 = battlePlan(11, seeded(s))!;
    assert.equal(p11.creatureId, 1389);
    assert.ok(p11.count >= 1 && p11.count <= 3);
    const p12 = battlePlan(12, seeded(s))!;
    assert.ok(p12.count >= 3 && p12.count <= 5 && p12.creatureId === 1390);
    const p13 = battlePlan(13, seeded(s))!;
    assert.ok(p13.count >= 4 && p13.count <= 6 && p13.creatureId === 1392);
  }
  assert.deepEqual(battlePlan(14, seeded(1)), { creatureId: 1391, count: 1, levelBonus: 2 });
  assert.equal(battlePlan(5, seeded(1)), null);
  assert.equal(lossHp(1000, 1000), 800);
  assert.equal(lossHp(100, 1000), 1);
  assert.equal(lossHp(5000, 1000), 1000, 'never above max');
  assert.equal(hpAfterPercent(500, 1000, 20), 700);
  assert.equal(hpAfterPercent(900, 1000, 20), 1000);
  assert.equal(hpAfterPercent(100, 1000, -20), 1);
});
