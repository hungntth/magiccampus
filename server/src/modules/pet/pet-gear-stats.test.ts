// Pet gear stats: unmarked pieces keep the template-only numbers (parity), marked pieces use colour-scaled lines + bind percent,
// sublimation adds its row by position.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { SublimeRow } from '../gamedata/sublimation-data';
import { equipBonuses } from '../inventory/equip-stats';
import { petGearBonuses, type PetGearEntry } from './pet-gear-stats';

const sword = { id: 1265, position: 50, main_prop1: 4, main_prop_num1: 100, main_prop2: 5, main_prop_num2: 80, prop1: 1, prop_num1: 50, bind_prop_num: 4 };
const ring = { id: 2280, position: 57, main_prop1: 6, main_prop_num1: 5090, main_prop2: 7, main_prop_num2: 4382, prop1: 21, prop_num1: 119, bind_prop_num: 6 };
const none = (): SublimeRow | undefined => undefined;
const piece = (tpl: Record<string, unknown>, over: Partial<PetGearEntry> = {}): PetGearEntry => ({ tpl, bound: true, colorCode: 0, star: 0, props: {}, ...over });
const row = (over: Partial<SublimeRow> = {}): SublimeRow => ({
  level: 1, rate: 100, itemNum1: 3, itemNum2: 4, elementNum: 0.0005,
  props: [{ prop: 4, num: 14 }, { prop: 5, num: 11 }, { prop: 1, num: 55 }, { prop: 11, num: 5 }], ...over,
});

test('parity: pieces without the petGear marker give exactly the template-only numbers, whatever colour / bind they carry', () => {
  const plain = equipBonuses([sword, ring]);
  assert.deepEqual(petGearBonuses([piece(sword), piece(ring)], none), plain);
  assert.deepEqual(petGearBonuses([piece(sword, { colorCode: 3, bound: false }), piece(ring, { props: { bindMainPropNum1: 9 } })], none), plain);
  assert.deepEqual(petGearBonuses([], none), equipBonuses([]));
});

test('marked piece: lines scale by colour, bind percent comes from the instance and only for bound gear', () => {
  const props = { petGear: 1, bindMainPropNum1: 10, bindMainPropNum2: 5 };
  const white = petGearBonuses([piece(sword, { props })], none);
  assert.equal(white.flat.attack, 100 + 10); // 10 % of 100
  assert.equal(white.flat.magicAttack, 80 + 4); // 5 % of 80
  assert.equal(white.flat.maxHp, 50);
  const orange = petGearBonuses([piece(sword, { props, colorCode: 4 })], none);
  assert.equal(orange.flat.attack, 350 + 35);
  assert.equal(orange.flat.magicAttack, 280 + 14);
  assert.equal(orange.flat.maxHp, 175);
  const unbound = petGearBonuses([piece(sword, { props, colorCode: 4, bound: false })], none);
  assert.equal(unbound.flat.attack, 350);
  const noBindRoll = petGearBonuses([piece(sword, { props: { petGear: 1 }, colorCode: 2 })], none);
  assert.equal(noBindRoll.flat.attack, 150);
});

test('sublimation adds the row by position and works on unmarked pieces too', () => {
  const lookup = (level: number): SublimeRow | undefined => (level === 2 ? row() : undefined);
  const attackGear = petGearBonuses([piece(sword, { props: { flag: '{"sublimeId":2,"sublimeAdd":0,"sublimeElement":3}' } })], lookup);
  assert.equal(attackGear.flat.attack, 100 + 4 + 14); // + the legacy flat template bind of the unmarked piece
  assert.equal(attackGear.flat.magicAttack, 80 + 4 + 11);
  const defenceGear = petGearBonuses([piece({ ...ring, position: 53 }, { props: { flag: '{"sublimeId":2}' } })], lookup);
  assert.equal(defenceGear.flat.maxHp, 55);
  assert.equal(defenceGear.flat.speed, 5);
  const unknownLevel = petGearBonuses([piece(sword, { props: { flag: '{"sublimeId":9}' } })], lookup);
  assert.deepEqual(unknownLevel, equipBonuses([sword]));
});
