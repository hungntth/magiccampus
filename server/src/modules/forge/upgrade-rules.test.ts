// Prefix preview, material gates, tier-upgrade colour and resolve outputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  equipColor, equipQuality, prefixCost, prefixMaterialRefusal, prefixOfQuality, previewQuality, resolveOutputs, rollPrefixWeighted,
  sameColors, tierColor, tierResetFields,
} from './upgrade-rules';

test('weighted prefix: 22/22/22/22/12', () => {
  assert.equal(rollPrefixWeighted(() => 0), 1);
  assert.equal(rollPrefixWeighted(() => 0.21), 1);
  assert.equal(rollPrefixWeighted(() => 0.25), 2);
  assert.equal(rollPrefixWeighted(() => 0.6), 3);
  assert.equal(rollPrefixWeighted(() => 0.87), 4);
  assert.equal(rollPrefixWeighted(() => 0.95), 5);
});

test('prefix preview by material level', () => {
  const lo = () => 0; // prefix 1
  assert.deepEqual(previewQuality(18, 4, 3, 4, lo), { quality: 16, starDelta: -1 });
  assert.deepEqual(previewQuality(18, 4, 3, 5, lo), { quality: 20, starDelta: 0 });
  assert.deepEqual(previewQuality(23, 5, 3, 5, lo), { quality: 23, starDelta: 0 }); // orange keeps
  assert.deepEqual(previewQuality(18, 4, 3, 6, lo), { quality: 21, starDelta: 0 });
  assert.deepEqual(previewQuality(25, 5, 5, 6, lo), { quality: 25, starDelta: 0 });
});

test('prefix material gates', () => {
  assert.equal(prefixMaterialRefusal([4, 4, 4], 4), null);
  assert.match(prefixMaterialRefusal([4, 5, 4], 4) ?? '', /cùng cấp/);
  assert.match(prefixMaterialRefusal([3, 3, 3], 4) ?? '', /cấp 4 đến 6/);
  assert.match(prefixMaterialRefusal([4, 4, 4], 5) ?? '', /cam/);
  assert.equal(prefixMaterialRefusal([5, 5, 5], 5), null);
});

test('prefix cost is req_level^2 * 10 with fallbacks', () => {
  assert.equal(prefixCost({ req_level: 60 }), 36000);
  assert.equal(prefixCost({ req_level: 0, item_level: 30 }), 9000);
  assert.equal(prefixCost({}), 10);
});

test('equipment colour / quality / prefix helpers', () => {
  assert.equal(equipColor(0, 16), 4);
  assert.equal(equipColor(5, 0), 5);
  assert.equal(equipQuality({ quality: 18 }, 4), 18);
  assert.equal(equipQuality({ prefix: 3 }, 4), 18);
  assert.deepEqual([5, 10, 16, 20, 25].map(prefixOfQuality), [5, 5, 1, 5, 5]);
});

test('tier upgrade colour: shared material colour, else the next template colour; mixed colours are detected', () => {
  assert.equal(tierColor([3, 3, 3], 1), 3);
  assert.equal(tierColor([0, 0, 0], 2), 2);
  assert.equal(tierColor([0], -1), 0);
  assert.ok(sameColors([2, 2, 2]));
  assert.ok(!sameColors([2, 3, 2]));
});

test('resolve outputs: template materials, colour - 1 unless prefix 5, clamped', () => {
  const tpl = { require_item1: 24, require_num1: 3, require_item2: 18, require_num2: 1, require_item3: 0, require_num3: 0 };
  assert.deepEqual(resolveOutputs(tpl, 4, 2), [{ tid: 24, num: 3, color: 3 }, { tid: 18, num: 1, color: 3 }]);
  assert.deepEqual(resolveOutputs(tpl, 5, 5).map((o) => o.color), [5, 5]);
  assert.deepEqual(resolveOutputs(tpl, 1, 1).map((o) => o.color), [0, 0]);
  assert.deepEqual(resolveOutputs({}, 3, 1), []);
});

test('tier upgrade resets stars, holes, gems and rolls on the next template', () => {
  const r = tierResetFields({ id: 153, color: 1, endure_max: 450 }, [3, 3, 3]);
  assert.deepEqual(r, { templateId: 153, colorCode: 3, star: 0, properties: {}, durability: 450, maxDurability: 450 });
  assert.equal(tierResetFields({ id: 9, color: -1, endure_max: 0 }, [0]).colorCode, 0);
});
