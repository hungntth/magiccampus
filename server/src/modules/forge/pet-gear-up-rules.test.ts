// Pet gear upgrade helpers: colour note text, lines written on the instance, current bind fallback.

import test from 'node:test';
import assert from 'node:assert/strict';
import { petEquColorNote, petEquCurrentBind, petGearLineSet, petGearLines, PET_EQU_TEXT } from './pet-gear-up-rules';

const ring = { main_prop1: 6, main_prop_num1: 5090, main_prop2: 7, main_prop_num2: 4382, prop1: 21, prop_num1: 119, prop2: 0, prop_num2: 0, bind_prop_num: 6 };

test('lines scale by the display colour and an empty line stays zero', () => {
  assert.deepEqual(petGearLines(ring, 0), {
    mainProp1: 6, mainPropNum1: 5090, mainProp2: 7, mainPropNum2: 4382, prop1: 21, propNum1: 119, prop2: 0, propNum2: 0,
  });
  const orange = petGearLines(ring, 4);
  assert.equal(orange.mainPropNum1, Math.round(5090 * 3.5));
  assert.equal(orange.propNum2, 0);
  const set = petGearLineSet(ring, 2);
  assert.equal(set['properties.petGear'], 1);
  assert.equal(set['properties.mainPropNum1'], Math.round(5090 * 1.5));
});

test('colour note names the new colour; a failure uses the failure text', () => {
  assert.equal(petEquColorNote(false, 3), PET_EQU_TEXT.colorFail);
  assert.match(petEquColorNote(true, 4), /Cam<\/font>$/);
  assert.match(petEquColorNote(true, 1), /Xanh lá/);
});

test('current bind falls back to the template value and skips empty main lines', () => {
  assert.deepEqual(petEquCurrentBind(ring, {}), [6, 6]);
  assert.deepEqual(petEquCurrentBind(ring, { bindMainPropNum1: 11, bindMainPropNum2: 0 }), [11, 0]);
  assert.deepEqual(petEquCurrentBind({ ...ring, main_prop2: 0 }, { bindMainPropNum2: 9 }), [6, 0]);
});
