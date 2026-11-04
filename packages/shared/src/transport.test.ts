// Tests for the transport scroll cost plan, destination rule and rename-card name validation.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSeniorScroll, isTransportScroll, planTransport, transportDestinationError, validateNewName } from './transport.js';

const owned = (...pairs: [number, number][]): Map<number, number> => new Map(pairs);

test('planTransport consumes regular scrolls before senior ones', () => {
  assert.deepEqual(planTransport(owned([2947, 1], [1363, 2]), false, 0), { kind: 'scroll', tid: 1363 });
  assert.deepEqual(planTransport(owned([2947, 1]), false, 0), { kind: 'scroll', tid: 2947 });
});

test('planTransport group transport only uses senior scrolls', () => {
  assert.deepEqual(planTransport(owned([1036, 5]), true, 99), { kind: 'gold', cost: 5 });
  assert.deepEqual(planTransport(owned([1036, 5], [2950, 1]), true, 0), { kind: 'scroll', tid: 2950 });
});

test('planTransport gold fallback costs 3 (normal) / 5 (leader) and needs the balance', () => {
  assert.deepEqual(planTransport(owned(), false, 3), { kind: 'gold', cost: 3 });
  assert.deepEqual(planTransport(owned(), false, 2), { kind: 'none', cost: 3 });
  assert.deepEqual(planTransport(owned(), true, 4), { kind: 'none', cost: 5 });
  assert.deepEqual(planTransport(owned([1036, 0]), true, 5), { kind: 'gold', cost: 5 });
});

test('scroll id helpers', () => {
  assert.ok(isTransportScroll(1036) && isTransportScroll(4942));
  assert.ok(!isTransportScroll(2126));
  assert.ok(isSeniorScroll(2947) && !isSeniorScroll(1036));
});

test('transportDestinationError accepts t > 0 maps other than the current one', () => {
  assert.equal(transportDestinationError({ t: 1 }, 3, 1), null);
  assert.match(transportDestinationError(undefined, 999, 1) ?? '', /chính xác/);
  assert.match(transportDestinationError({ t: 0 }, 5, 1) ?? '', /Không thể/);
  assert.match(transportDestinationError({ t: 1 }, 1, 1) ?? '', /đang ở/);
  assert.match(transportDestinationError({ t: 1 }, 0, 1) ?? '', /chính xác/);
  assert.match(transportDestinationError({ t: 1 }, 1.5, 1) ?? '', /chính xác/);
});

test('validateNewName trims and enforces 2..12 characters', () => {
  assert.deepEqual(validateNewName('  Lý Tiểu Long '), { ok: true, name: 'Lý Tiểu Long' });
  assert.equal(validateNewName('A').ok, false);
  assert.equal(validateNewName('   ').ok, false);
  assert.equal(validateNewName('x'.repeat(12)).ok, true);
  assert.equal(validateNewName('x'.repeat(13)).ok, false);
  assert.equal(validateNewName(42).ok, false);
});

test('validateNewName rejects the Flash special characters', () => {
  for (const bad of ['a-b', 'a&b', 'a/b', 'a\\b', "a'b", 'a"b', 'a|b', 'a%b', 'a<b', 'a>b', 'a@b', 'a*b', 'a\nb']) {
    const r = validateNewName(bad);
    assert.equal(r.ok, false, bad);
  }
  assert.equal(validateNewName('Hùng_99').ok, true);
});
