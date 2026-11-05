// Tests for the client static Menh Hon table (petSoulStatic.ts over the generated petSoulData.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { petSoulDef, petSoulExchangeList, petSoulNext } from './petSoulStatic.js';

test('petSoulDef reads the seed rows', () => {
  const d = petSoulDef(1);
  assert.ok(d);
  assert.equal(d.name, 'Sức Sống');
  assert.equal(d.level, 1);
  assert.equal(d.propVal, 2000);
  assert.equal(d.upExp, 100);
  assert.equal(petSoulDef(-5), undefined);
});

test('petSoulNext follows the family ladder and stops at its end', () => {
  assert.equal(petSoulNext(1)?.id, 2);
  // 10 levels per family: id 10 is the last of the first family, id 11 starts another one.
  assert.equal(petSoulNext(10), undefined);
  assert.equal(petSoulNext(999999), undefined);
});

test('exchange list is the level 1 classic purple / orange gems', () => {
  const list = petSoulExchangeList();
  assert.ok(list.length >= 40);
  assert.ok(list.every((d) => d.type === 1 && d.level === 1 && d.reqChip > 0));
  assert.equal(list[0]!.id <= list[list.length - 1]!.id, true);
  assert.ok(list.some((d) => d.id === 31 && d.reqChip === 5));
});
