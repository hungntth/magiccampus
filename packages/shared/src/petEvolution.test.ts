// M12 Phase B pure evolution progression pins (Go feather.go advanceFeather / FeatherPet / FeatherPetNextStep).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceFeather, FEATHER_SUCCESS, featherAptitudes, featherAtCap, featherAttempt, featherNextStep, featherNpCost,
  featherProtectNeed, normalizeFeather, PET_ENVOLUTION_FEATHER_COST, PET_ENVOLUTION_FEATHER_COST_GOLD,
  PET_ENVOLUTION_FEATHER_COST_PROTECT,
} from './petEvolution.js';

const at = (round: number, stage: number) => ({ envo: true, round, stage });

test('feather keeps milestones, protection, and realm carry', () => {
  assert.deepEqual(featherAttempt(at(0, 5), false, false), { success: false, round: 0, stage: 3, protect: false });
  assert.deepEqual(featherAttempt(at(1, 5), false, true), { success: false, round: 1, stage: 5, protect: true });
});

test('reaching stage 9 in round 0 or 1 rolls to stage 0 of the next round; only round 2 rests at stage 9', () => {
  assert.deepEqual(featherAttempt(at(0, 8), true, false), { success: true, round: 1, stage: 0, protect: false });
  assert.deepEqual(featherAttempt(at(1, 8), true, false), { success: true, round: 2, stage: 0, protect: false });
  assert.deepEqual(featherAttempt(at(2, 8), true, false), { success: true, round: 2, stage: 9, protect: false });
  assert.deepEqual(advanceFeather(at(0, 7), 2), at(1, 0));
  assert.deepEqual(advanceFeather(at(2, 7), 2), at(2, 9));
});

test('a milestone stage cannot be protected and never drops; failures never lose the realm', () => {
  assert.equal(featherProtectNeed(at(0, 3)), 0);
  assert.equal(featherProtectNeed(at(0, 5)), 4);
  assert.equal(featherProtectNeed(at(2, 8)), 18);
  assert.deepEqual(featherAttempt(at(2, 6), false, true), { success: false, round: 2, stage: 6, protect: false });
  assert.deepEqual(featherAttempt(at(2, 8), false, false), { success: false, round: 2, stage: 6, protect: false });
});

test('feather gold jump, carry and cap', () => {
  assert.deepEqual(featherNextStep(at(0, 4)), { success: true, round: 0, stage: 6, protect: false });
  assert.deepEqual(featherNextStep(at(0, 7)), { success: true, round: 1, stage: 0, protect: false });
  assert.deepEqual(featherNextStep(at(2, 6)), { success: true, round: 2, stage: 9, protect: false });
  assert.deepEqual(featherNextStep(at(2, 9)), { success: false, round: 2, stage: 9, protect: false });
  assert.equal(featherAtCap(at(2, 9)), true);
  assert.equal(featherAtCap(at(1, 9)), false);
});

test('a stored stage 9 below round 2 is healed to the next round', () => {
  assert.deepEqual(normalizeFeather(at(0, 9)), at(1, 0));
  assert.deepEqual(normalizeFeather(at(2, 9)), at(2, 9));
  assert.deepEqual(normalizeFeather(at(7, -3)), at(2, 0));
});

test('rate and cost tables are defined for every try state (rounds 0..2 x stage 0..8)', () => {
  for (let round = 0; round < 3; round++) {
    for (let stage = 0; stage < 9; stage++) {
      assert.ok(FEATHER_SUCCESS[round][stage] > 0, `rate ${round}/${stage}`);
      assert.ok(featherNpCost(at(round, stage)) > 0, `np ${round}/${stage}`);
      assert.ok(PET_ENVOLUTION_FEATHER_COST_GOLD[round][stage] > 0, `gold ${round}/${stage}`);
      assert.equal(PET_ENVOLUTION_FEATHER_COST_PROTECT[round].length, 9);
    }
  }
  assert.deepEqual(FEATHER_SUCCESS[2], [30, 24, 19, 24, 20, 16, 24, 18, 12]); // Go evolution_table.go:46
  assert.equal(featherNpCost(at(1, 4)), 5 * PET_ENVOLUTION_FEATHER_COST[1][4]);
  assert.equal(PET_ENVOLUTION_FEATHER_COST_GOLD[1][8], 6400); // Flash literal 0x1900
});

test('Vu Hoa aptitudes come from the table by attr order (Luc, Nhan, Xao, Tri, Than)', () => {
  assert.deepEqual(featherAptitudes(1407, { envo: false, round: 0, stage: 9 }), { str: 0, sta: 0, agi: 0, int: 0, eng: 0 });
  assert.deepEqual(featherAptitudes(1407, at(0, 4)), { str: 60, sta: 60, agi: 73, int: 66, eng: 95 });
  assert.deepEqual(featherAptitudes(1407, at(2, 9)), { str: 1614, sta: 1883, agi: 1883, int: 1614, eng: 1973 });
  assert.deepEqual(featherAptitudes(1, at(0, 4)), { str: 0, sta: 0, agi: 0, int: 0, eng: 0 }); // not an evolved creature
});

test('2332 Kim Lan is 2293 with Luc and Tri swapped', () => {
  const a = featherAptitudes(2293, at(1, 5));
  const b = featherAptitudes(2332, at(1, 5));
  assert.equal(b.str, a.int);
  assert.equal(b.int, a.str);
  assert.equal(b.sta, a.sta);
  assert.equal(b.agi, a.agi);
  assert.equal(b.eng, a.eng);
});
