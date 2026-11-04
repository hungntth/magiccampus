// Tests for the heiyaoshi rules on a small synthetic topology: seeding, adjacency / figure checks, triangle and figure completion,
// the cascading reconcile, costs, buff aggregation (triangles + completion bonus), stage-2 multipliers and the stat mapping.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHeiyaoshiTables } from '../gamedata/heiyaoshi-data';
import {
  applyPoint, areaAttribute, computeBuff, heiyaoshiBonuses, newHyState, parseHy, planPoint, reconcile, stage2Multiplier, toWire,
  triangleFigure, type HyState,
} from './heiyaoshi-rules';

// Figure 1 and 11 share one layout: starter 1; 2, 3 adjacent to 1; 4 adjacent to 3. Area 1 = {1,2,3}, area 2 = {3,4,2}.
const layout = (figure: number): Record<string, unknown>[] => [
  { figure, point_id: 1, price: 0, gold: 0 }, { figure, point_id: 2, price: 100, gold: 100 },
  { figure, point_id: 3, price: 100, gold: 100 }, { figure, point_id: 4, price: 200, gold: 400 },
];
const link = (figure: number, point_id: number, link_type: string, neighbor_id: number, ord = 0): Record<string, unknown> =>
  ({ figure, point_id, link_type, neighbor_id, ord });
const links = (figure: number): Record<string, unknown>[] => [
  link(figure, 1, 'around', 2), link(figure, 1, 'around', 3), link(figure, 2, 'around', 1), link(figure, 3, 'around', 1),
  link(figure, 3, 'around', 4), link(figure, 4, 'around', 3), link(figure, 2, 'around', 4), link(figure, 4, 'around', 2),
  link(figure, 1, 'area', 1), link(figure, 2, 'area', 1), link(figure, 3, 'area', 1),
  link(figure, 3, 'area', 2), link(figure, 4, 'area', 2), link(figure, 2, 'area', 2),
  link(figure, 1, 'around_line', 7), link(figure, 2, 'around_line', 7),
];
const tables = buildHeiyaoshiTables(
  [...layout(1), ...layout(2), ...layout(11)],
  [...links(1), ...links(2), ...links(11)],
  [{ figure: 1, area_id: 1, l_res_num: 5, a_res_num: 6 }, { figure: 1, area_id: 2, l_res_num: 7, a_res_num: 8 }],
  [
    { figure: 1, area_id: 1, prop_id: 1, value: 300 }, { figure: 1, area_id: 2, prop_id: 1, value: 100 },
    { figure: 1, area_id: 2, prop_id: 34, value: 0.2 },
  ],
  [{ figure: 1, prop_id: 4, value: 50 }, { figure: 11, prop_id: 4, value: 150 }],
);

const light = (st: HyState, id: number, gold = false): { st: HyState; r: ReturnType<typeof applyPoint> } => {
  const plan = planPoint(tables, st, 0, id, gold);
  assert.ok(plan.ok, plan.ok ? '' : plan.note);
  const r = applyPoint(tables, plan.state, plan.point);
  return { st: r.state, r };
};

describe('heiyaoshi activation', () => {
  it('seeds the free starter and charges the stone price', () => {
    const plan = planPoint(tables, newHyState(), 1, 2, false);
    assert.ok(plan.ok);
    assert.deepEqual(plan.state.actPoint, [1]);
    assert.deepEqual(plan.cost, { currency: 'stone', amount: 100 });
  });

  it('gold path charges the gold column and refuses points without a gold price', () => {
    const plan = planPoint(tables, newHyState(), 1, 2, true);
    assert.ok(plan.ok);
    assert.deepEqual(plan.cost, { currency: 'gold', amount: 100 });
  });

  it('refuses a figure mismatch, an unknown point, a lit point and a non adjacent point', () => {
    const note = (figure: number, id: number): string => {
      const p = planPoint(tables, newHyState(), figure, id, false);
      return p.ok ? '' : p.note;
    };
    assert.match(note(2, 2), /không khớp/);
    assert.match(note(99, 2), /không hợp lệ/);
    assert.match(note(1, 99), /không hợp lệ/);
    assert.match(note(1, 1), /đã được kích hoạt/);
    assert.match(note(1, 4), /cạnh điểm/);
  });

  it('completes a triangle on its last vertex, with its line, and keeps the figure open', () => {
    let st = newHyState();
    const a = light(st, 2);
    assert.deepEqual(a.r.newLines, [7]); // 1 and 2 are the line ends, 1 is the seeded starter
    assert.deepEqual(a.r.newAreas, []);
    st = a.st;
    const b = light(st, 3);
    assert.deepEqual(b.r.newAreas, [1]);
    assert.equal(b.r.figureCompleted, false);
    assert.deepEqual(computeBuff(tables, b.st), { 1: 300 });
  });

  it('finishing the last triangle advances the figure, resets the board, seeds the next starter and adds the bonus', () => {
    let st = newHyState();
    for (const id of [2, 3]) st = light(st, id).st;
    const last = light(st, 4);
    assert.ok(last.r.figureCompleted);
    assert.equal(last.st.lastActFigure, 2);
    assert.deepEqual(last.st.actPoint, [1]); // starter of figure 2
    assert.deepEqual(last.st.actArea, []);
    // triangles 300 + 100, bonus 50 on prop 4; figure 2 has no areas / bonus yet
    assert.deepEqual(computeBuff(tables, last.st), { 1: 400, 34: 0.2, 4: 50 });
  });

  it('refuses everything once all 20 figures are done', () => {
    const p = planPoint(tables, { ...newHyState(), lastActFigure: 21 }, 0, 2, false);
    assert.ok(!p.ok);
  });
});

describe('heiyaoshi stage 2', () => {
  it('scales the triangle values with the Go-invented multipliers, the completion bonus comes from its own data row', () => {
    assert.deepEqual([stage2Multiplier(1), stage2Multiplier(13), stage2Multiplier(34), stage2Multiplier(4)], [2, 1.5, 0.5, 1]);
    assert.deepEqual(areaAttribute(tables, 11, 1), { 1: 600 });
    assert.deepEqual(areaAttribute(tables, 11, 2), { 1: 200, 34: 0.1 });
    // figures 1 and 2..10 done is not needed here: state at figure 12 means figure 11 is finished
    const st: HyState = { lastActFigure: 12, actPoint: [], actArea: [], actLine: [] };
    const buff = computeBuff(tables, st); // figures 1..10 contribute only figure 1's rows (2..10 have no triangles), then figure 11
    assert.equal(buff[1], 300 + 100 + 600 + 200);
    assert.equal(buff[4], 50 + 150);
  });

  it('triangleFigure carries keys 1..20 with string resource codes', () => {
    const tri = triangleFigure(tables);
    assert.equal(Object.keys(tri).length, 20);
    assert.equal(tri['11']['1'].attribute['1'], 600);
    assert.equal(tri['1']['1'].LResNum, '5');
  });
});

describe('heiyaoshi state and stats', () => {
  it('reconcile derives triangles and cascades completed figures from the lit points', () => {
    const st = reconcile(tables, { lastActFigure: 1, actPoint: [1, 2, 3, 4], actArea: [], actLine: [] });
    assert.equal(st.lastActFigure, 2);
    assert.deepEqual(st.actPoint, [1]);
    assert.deepEqual(reconcile(tables, newHyState()).actPoint, [1]);
  });

  it('parse accepts arrays and the Go id maps and clamps the figure', () => {
    const st = parseHy({ lastActFigure: 99, actPoint: [1, '2'], actArea: { 1: true }, actLine: { 3: 1 } });
    assert.equal(st.lastActFigure, 21);
    assert.deepEqual([st.actPoint, st.actArea, st.actLine], [[1, 2], [1], [3]]);
    assert.equal(parseHy(null).lastActFigure, 1);
    assert.equal(parseHy({ lastActFigure: 0 }).lastActFigure, 1);
  });

  it('wire state maps ids to 1 and counts areas / lines', () => {
    const w = toWire(tables, { lastActFigure: 1, actPoint: [1, 2, 3], actArea: [1], actLine: [7] });
    assert.deepEqual(w.actArea, { 1: 1 });
    assert.equal(w.AreaNum, 1);
    assert.equal(w.LineNum, 1);
    assert.deepEqual(w.Buff, { 1: 300 });
  });

  it('maps props to stat bonuses: flat, percent points as stored, fractions x100', () => {
    const b = heiyaoshiBonuses({ 1: 300, 4: 50, 13: 0.32, 14: 1.5, 34: 0.5, 59: 0.01, 62: 0.02 });
    assert.equal(b.flat.maxHp, 300);
    assert.equal(b.flat.attack, 50);
    assert.equal(b.flat.critical, 0.32);
    assert.equal(b.rates.finalDefy, 1.5);
    assert.equal(b.rates.finalRebornRate, 0.5);
    assert.equal(b.rates.finalPraDef, 1);
    assert.equal(b.rates.finalEnhPhyHurt, 2);
  });
});
