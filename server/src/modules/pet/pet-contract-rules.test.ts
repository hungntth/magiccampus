// Khe Uoc rules: exp roll thresholds, level carry / cap, the one / ten attempt loop stop rules and the stat bonus (seeded rolls).
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PetContractRow } from '../gamedata/pet-depth-data';
import { addContractExp, contractBonuses, contractExpGain, contractTrack, runContract, type ContractRowOf } from './pet-contract-rules';

/** Level L needs 100 + 10 * (L - 1) exp and ceil(L / 10) stones (like the seed: 1..10 -> 1 stone, 41..50 -> 5). */
const rowOf: ContractRowOf = (lv) => (lv >= 1 && lv <= 50 ? { reqExp: 100 + 10 * (lv - 1), reqNum: Math.ceil(lv / 10) } : undefined);
const seq = (...v: number[]): (() => number) => { let i = 0; return () => v[i++ % v.length]; };
const base = { level: 0, exp: 0, stones: 99, gold: 1000, autoBuy: false, confirmGold: false, attempts: 1, rowOf };

test('exp roll: x3 below 5, x2 below 20, else x1', () => {
  assert.equal(contractExpGain(0), 60);
  assert.equal(contractExpGain(4), 60);
  assert.equal(contractExpGain(5), 40);
  assert.equal(contractExpGain(19), 40);
  assert.equal(contractExpGain(20), 20);
  assert.equal(contractExpGain(99), 20);
});

test('exp carries the remainder over levels and level 50 holds exp 0', () => {
  assert.deepEqual(addContractExp(0, 0, 60, rowOf), { level: 0, exp: 60, leveled: false });
  assert.deepEqual(addContractExp(0, 90, 20, rowOf), { level: 1, exp: 10, leveled: true });
  assert.deepEqual(addContractExp(0, 0, 100 + 110 + 5, rowOf), { level: 2, exp: 5, leveled: true }); // two levels at once
  assert.deepEqual(addContractExp(49, 500, 5000, rowOf), { level: 50, exp: 0, leveled: true });
  assert.deepEqual(addContractExp(50, 0, 60, rowOf), { level: 50, exp: 0, leveled: false });
});

test('one attempt uses the level stones and adds exp', () => {
  const out = runContract({ ...base, level: 10, exp: 0, roll: () => 99 }); // level 11 needs 2 stones
  assert.deepEqual([out.attempts, out.stonesUsed, out.goldSpent, out.level, out.exp, out.refusal], [1, 2, 0, 10, 20, null]);
});

test('short of stones: refused without autoBuy, confirm with autoBuy on a single attempt, buys when confirmed', () => {
  const short = { ...base, level: 40, stones: 3 }; // level 41 needs 5 stones: 2 missing = 20 gold
  assert.equal(runContract(short).refusal, 'stones');
  const confirm = runContract({ ...short, autoBuy: true, confirmGold: true });
  assert.equal(confirm.needGold, 20);
  assert.equal(confirm.attempts, 0);
  assert.equal(confirm.refusal, null);
  const buy = runContract({ ...short, autoBuy: true, roll: () => 99 });
  assert.deepEqual([buy.attempts, buy.stonesUsed, buy.goldSpent, buy.exp], [1, 3, 20, 20]);
});

test('autoBuy without enough gold is refused as gold', () => {
  const out = runContract({ ...base, level: 40, stones: 0, gold: 49, autoBuy: true }); // 5 stones = 50 gold
  assert.equal(out.refusal, 'gold');
  assert.equal(out.attempts, 0);
});

test('ten attempts: runs ten, then stops on stones, gold or level 50', () => {
  const ten = runContract({ ...base, attempts: 10, roll: () => 99 });
  assert.equal(ten.attempts, 10);
  assert.equal(ten.stonesUsed, 10);
  assert.equal(ten.exp, 200 - 100); // 200 exp: level 1 (100) then 100 carried < 110
  assert.equal(ten.level, 1);
  const stones = runContract({ ...base, attempts: 10, stones: 3, roll: () => 99 });
  assert.equal(stones.attempts, 3); // 1 stone per attempt, then no autoBuy: stop (partial success is kept)
  const gold = runContract({ ...base, level: 40, attempts: 10, stones: 5, gold: 25, autoBuy: true, roll: () => 99 });
  assert.deepEqual([gold.attempts, gold.stonesUsed, gold.goldSpent], [1, 5, 0]); // 2nd try needs 5 more stones = 50 gold > 25: stop
});

test('ten attempts stop at level 50', () => {
  const out = runContract({ ...base, level: 49, exp: 0, attempts: 10, roll: seq(0) }); // x3 = 60 exp per try; 590 needed
  assert.deepEqual([out.level, out.attempts], [50, 10]);
  const near = runContract({ ...base, level: 49, exp: 570, attempts: 10, roll: seq(99) });
  assert.deepEqual([near.level, near.exp, near.attempts], [50, 0, 1]);
});

test('contract track reads level / exp and rejects unknown types', () => {
  assert.deepEqual(contractTrack({ speed: 7, speedExp: 33 }, 2), { key: 'speed', level: 7, exp: 33 });
  assert.equal(contractTrack({}, 5), null);
  assert.deepEqual(contractTrack({}, 4), { key: 'magic', level: 0, exp: 0 });
});

const bonusRow = (level: number): PetContractRow => ({
  level, reqNum: 1, reqExp: 100,
  props: [{ prop: 1, num: 0.8 * level, extra: 0.4 * level }, { prop: 11, num: 0.4 * level, extra: 0.2 * level }, { prop: 4, num: 0.4 * level, extra: 0.2 * level }, { prop: 5, num: 0.4 * level, extra: 0.2 * level }],
});

test('contract bonus: percent of HP / speed / attack / magic attack, Tho San adds the extra', () => {
  const state = { hp: 50, speed: 25, physics: 0, magic: 10 };
  const b = contractBonuses(state, 1, bonusRow);
  assert.equal(b.pct.maxHp, 40);
  assert.equal(b.pct.speed, 10);
  assert.equal(b.pct.attack, undefined); // level 0 gives nothing
  assert.equal(b.pct.magicAttack, 4);
  const hunter = contractBonuses(state, 5, bonusRow);
  assert.equal(hunter.pct.maxHp, 60); // 40 + 20 extra
  assert.equal(hunter.pct.speed, 15);
  assert.deepEqual(contractBonuses({}, 5, bonusRow).pct, {});
});
