// charElementOf: dominant element of the worn gear (Go GetCharacterElementState).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { charElementOf, charElementStrength } from './charElement.js';

test('no elemental gear is element 0', () => {
  assert.deepEqual(charElementOf([{}, { element: 0 }, { element: 9 }]), { ee: 0, en: 0, ef: false });
});

test('most frequent element wins, ties go to the lower id', () => {
  assert.deepEqual(charElementOf([{ element: 5 }, { element: 3 }, { element: 5 }]), { ee: 5, en: 2, ef: false });
  assert.deepEqual(charElementOf([{ element: 6 }, { element: 2 }]), { ee: 2, en: 1, ef: false });
});

test('rank caps at 12 and maps to the strength words', () => {
  const s = charElementOf(Array.from({ length: 14 }, () => ({ element: 1 })));
  assert.equal(s.en, 12);
  assert.equal(charElementStrength(s), 'Mạnh');
  assert.equal(charElementStrength({ ee: 1, en: 4, ef: false }), 'Vừa');
  assert.equal(charElementStrength({ ee: 1, en: 3, ef: true }), 'MAX');
});
