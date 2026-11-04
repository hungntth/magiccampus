// Refinement rules and the preview memory: costs per kind, material templates, rolls, and confirm-without-preview semantics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REFINE_COST, levelCost, soulStoneTid } from '@mc/shared';
import {
  currentBind, currentSoul, materialTid, nameRefusal, refineCost, rollBindValues, rollNewElement, rollSoulFull, rollSoulValue,
  soulMaxNum,
} from './refine-rules';
import { RefinePending, type SessionHooks, type SessionRef } from './refine-pending';

const seq = (...v: number[]): (() => number) => {
  let i = 0;
  return () => v[i++ % v.length];
};

test('costs per refinement', () => {
  assert.equal(refineCost('element'), 30000);
  assert.equal(refineCost('bind'), 30000);
  assert.equal(refineCost('soul', 1), 50000);
  assert.equal(refineCost('soul', 2), 100000);
  assert.equal(refineCost('name'), 10000);
  assert.equal(REFINE_COST.name, 10000);
  assert.equal(levelCost(50), 25000);
  assert.equal(levelCost(0), 10);
});

test('material template per refinement', () => {
  const tpl = { require_item1: 24, require_item2: 18, require_item3: 25, req_level: 50 };
  assert.equal(materialTid('element', tpl), 24);
  assert.equal(materialTid('bind', tpl), 18);
  assert.equal(materialTid('name', tpl), 25);
  assert.equal(materialTid('soul', tpl), 1659);
  assert.deepEqual([60, 61, 80, 81, 100, 101].map(soulStoneTid), [1659, 1660, 1660, 1661, 1661, 1662]);
  assert.equal(materialTid('element', {}), 0);
});

test('new element is never the current one and covers the other five', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 5; i++) seen.add(rollNewElement(3, () => i / 5));
  assert.ok(!seen.has(3));
  assert.equal(seen.size, 5);
});

test('bind rolls 1..bind_prop_num per line; none without a bonus', () => {
  assert.deepEqual(rollBindValues({ bind_prop_num: 5 }, seq(0, 0.999)), [1, 5]);
  assert.deepEqual(rollBindValues({ bind_prop_num: 0 }, seq(0.5)), [0, 0]);
  assert.equal(currentBind({ bindMainPropNum1: 2 }, { bind_prop_num: 5 }, 1), 2);
  assert.equal(currentBind({}, { bind_prop_num: 5 }, 2), 5);
});

test('soul reads instance then template and rolls prop 1..8, value 1..max', () => {
  assert.deepEqual(currentSoul({ activeProp: 3, activePropNum: 7 }, { active_prop_type: 1, active_prop_num: 3 }), { prop: 3, num: 7 });
  assert.deepEqual(currentSoul({}, { active_prop_type: 1, active_prop_num: 3 }), { prop: 1, num: 3 });
  assert.deepEqual(currentSoul({}, {}), { prop: 0, num: 0 });
  assert.equal(soulMaxNum({ active_prop_num: 0 }), 10);
  assert.equal(soulMaxNum({ active_prop_num: 4 }), 4);
  assert.deepEqual(rollSoulFull(10, seq(0, 0)), { prop: 1, num: 1 });
  assert.deepEqual(rollSoulFull(10, seq(0.999, 0.999)), { prop: 8, num: 10 });
  assert.equal(rollSoulValue(3, seq(0.999)), 3);
});

test('maker signature needs a bound item of colour >= 4', () => {
  assert.match(nameRefusal(false, 5, 25) ?? '', /khóa/);
  assert.match(nameRefusal(true, 3, 0) ?? '', /tím/);
  assert.equal(nameRefusal(true, 4, 0), null);
  assert.equal(nameRefusal(true, 0, 16), null); // quality 16 = colour 4
});

const hooks = (): SessionHooks & { gone: ((s: SessionRef) => void | Promise<void>)[] } => {
  const gone: ((s: SessionRef) => void | Promise<void>)[] = [];
  return { gone, onDisconnect: (h) => void gone.push(h), onCharacterLeave: (h) => void gone.push(h) };
};

test('confirm without a preview finds nothing; a preview is consumed once and kinds are independent', () => {
  const p = new RefinePending(hooks());
  assert.equal(p.take(1, 'element'), undefined);
  p.set(1, { kind: 'element', equipId: 5, element: 2 });
  p.set(1, { kind: 'bind', equipId: 5, b1: 1, b2: 2 });
  assert.deepEqual(p.take(1, 'element'), { kind: 'element', equipId: 5, element: 2 });
  assert.equal(p.take(1, 'element'), undefined); // a second confirm has nothing to apply
  assert.equal(p.get(1, 'bind')?.kind, 'bind');
  assert.equal(p.get(2, 'bind'), undefined); // per character
});

test('previews are lost on disconnect or leaving the world', () => {
  const h = hooks();
  const p = new RefinePending(h);
  p.onModuleInit();
  p.set(7, { kind: 'soul', equipId: 1, prop: 2, num: 3 });
  p.set(7, { kind: 'element', equipId: 1, element: 4 });
  p.set(8, { kind: 'element', equipId: 2, element: 4 });
  for (const hook of h.gone) void hook({ characterId: 7 });
  assert.equal(p.get(7, 'soul'), undefined);
  assert.equal(p.get(7, 'element'), undefined);
  assert.equal(p.get(8, 'element')?.kind, 'element');
});
