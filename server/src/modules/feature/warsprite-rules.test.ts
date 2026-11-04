// War sprite rules: upgrade plan (stones / gold, max), aggregation war + war * battle / 10000 and the scaled stat bonuses.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFeatureTables } from '../gamedata/feature-data';
import { defaultWsp, parseWsp } from './feature-state';
import { displayProps, planWspUpgrade, wspBonuses, wspTotals } from './warsprite-rules';

const row = (id: number, kind: number, level: number, next: number, props: number[]): Record<string, unknown> => ({
  id, kind, level, next_id: next, cost_num: 10 * (level + 1), cost_gold: 100 * (level + 1), name: 'n',
  p_t1: 1, p_t2: 4, p_t3: 5, p_t4: 61, p_t5: 62, p_t6: 0, p_t7: 0, p_t8: 0,
  p_n1: props[0], p_n2: props[1], p_n3: props[2], p_n4: props[3], p_n5: props[4], p_n6: 0, p_n7: 0, p_n8: 0,
});
const t = buildFeatureTables([], [], [], [
  row(1100, 1, 0, 1101, [0, 0, 0, 0, 0]),
  row(1101, 1, 1, 0, [150, 38, 38, 100, 2]),
  row(2100, 2, 0, 2101, [0, 0, 0, 0, 0]),
  row(2101, 2, 1, 0, [10000, 10000, 10000, 10000, 10000]),
  row(1200, 1, 0, 0, [0, 0, 0, 0, 0]),
]);
const rowOf = (id: number) => t.warSprites.get(id);

describe('planWspUpgrade', () => {
  it('reads the cost of the current row and the next id', () => {
    assert.deepEqual(planWspUpgrade(rowOf(1100), false), { newId: 1101, cost: 10, gold: false, maxed: false });
    assert.deepEqual(planWspUpgrade(rowOf(1100), true), { newId: 1101, cost: 100, gold: true, maxed: false });
  });
  it('refuses the max row and a missing row', () => {
    assert.equal(planWspUpgrade(rowOf(1101), false), 'Đã Max Cấp');
    assert.equal(typeof planWspUpgrade(undefined, false), 'string');
  });
});

describe('state defaults', () => {
  it('starts on the chain roots and ignores junk ids', () => {
    const d = defaultWsp();
    assert.equal(d.wObj['1'], 1100);
    assert.equal(d.bObj['8'], 2800);
    const p = parseWsp({ wObj: { '1': 1101, '2': 'x' }, bObj: null });
    assert.equal(p.wObj['1'], 1101);
    assert.equal(p.wObj['2'], 1200);
  });
});

describe('wspTotals / wspBonuses', () => {
  it('adds war + war * battle / 10000 per prop slot', () => {
    const state = defaultWsp();
    state.wObj['1'] = 1101; // war level 1
    assert.deepEqual(wspTotals(state, rowOf), { 1: 150, 4: 38, 5: 38, 61: 100, 62: 2 });
    state.bObj['1'] = 2101; // battle +10000 = x2
    assert.deepEqual(wspTotals(state, rowOf), { 1: 300, 4: 76, 5: 76, 61: 200, 62: 4 });
  });

  it('scales rates (61 /10000, 62 /100) and applies the flat stats raw', () => {
    const b = wspBonuses({ 1: 300, 4: 76, 5: 76, 61: 200, 62: 4 });
    assert.equal(b.flat.maxHp, 300);
    assert.equal(b.flat.attack, 76);
    assert.equal(b.flat.magicAttack, 76);
    assert.equal(b.rates.finalResiDefy, 0.02);
    assert.equal(b.rates.finalEnhPhyHurt, 0.04);
  });

  it('hides the 5 / 7 mirror lines in the panel', () => {
    assert.deepEqual(displayProps(rowOf(1101)!.props).map((p) => p.t), [1, 4, 61, 62]);
  });
});
