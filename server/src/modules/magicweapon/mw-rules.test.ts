// Unit tests for the pure magic weapon rules: upgrade gate / cost / rate with an injected RNG, stat lines of main and sub
// weapons through the equip pipeline, reset / transfer / resolve gates, skills and the sub-line roll.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MW_PRO_RANGE } from '@mc/shared';
import type { ArtifactRow } from '../gamedata/artifact-data';
import { buildArtifactTables, cumulativeSpirit } from '../gamedata/artifact-data';
import { equipBonusesOf } from '../inventory/equip-stats';
import {
  activateGate, effectiveLines, parseFlag, pickSkill, planUpgrade, resetGate, resetMax, resolveRefund, rollLine, rollReset,
  rollUpgrade, skillMap, templateSkillIds, transGate, upgradedLines,
} from './mw-rules';

const MAIN = {
  kind: 8, type: 800, position: 15, main_prop1: 1, main_prop2: 11, main_prop_num1: 912, main_prop_num2: 46, bind_prop_num: 7,
  artifact_skill: '4861|7-2|7-3|7-4',
};
const SUB = { kind: 8, type: 801, position: 16, main_prop1: 0, main_prop2: 0, main_prop_num1: 0, main_prop_num2: 0, artifact_skill: '7-11' };
const row = (level: number, over: Partial<ArtifactRow> = {}): ArtifactRow => ({
  tid: 1350, level, propNum1: 823, propNum2: 41, spirit: 100000 * level, itemNum: 10, rate: 100, ...over,
});
const ok = { main: true, bound: true, star: 0, playerLevel: 60, spirituality: 1e6, crystals: 50 };

describe('planUpgrade', () => {
  it('passes with spirituality and crystals, returns the next row', () => {
    const p = planUpgrade({ ...ok, next: row(1) });
    assert.equal(p.ok, true);
  });

  it('refuses sub weapons, unbound weapons and the top', () => {
    assert.deepEqual(planUpgrade({ ...ok, main: false, next: row(1) }), { ok: false, failType: 1, msg: 'Chỉ thần khí chính mới có thể thăng cấp!' });
    const unbound = planUpgrade({ ...ok, bound: false, next: row(1) });
    assert.equal(unbound.ok === false && unbound.failType, 3);
    const top = planUpgrade({ ...ok, star: 50, playerLevel: 100, next: undefined });
    assert.equal(top.ok === false && top.failType, 2);
  });

  it('level 16 and above need player level 100', () => {
    assert.equal(planUpgrade({ ...ok, spirituality: 1e8, star: 14, next: row(15) }).ok, true);
    const blocked = planUpgrade({ ...ok, spirituality: 1e8, star: 15, playerLevel: 99, next: row(16) });
    assert.equal(blocked.ok === false && blocked.failType, 1);
    assert.equal(planUpgrade({ ...ok, spirituality: 1e8, star: 15, playerLevel: 100, next: row(16) }).ok, true);
  });

  it('checks spirituality and item_num (crystals) before anything is spent', () => {
    const poor = planUpgrade({ ...ok, spirituality: 99999, next: row(1) });
    assert.equal(poor.ok, false);
    const few = planUpgrade({ ...ok, crystals: 9, next: row(1) });
    assert.equal(few.ok === false && few.msg.includes('Pha Lê Thần Giới'), true);
    assert.equal(planUpgrade({ ...ok, spirituality: 100000, crystals: 10, next: row(1) }).ok, true);
  });
});

describe('rollUpgrade', () => {
  it('succeeds when the roll is below the rate percent', () => {
    assert.equal(rollUpgrade(30, () => 0.29), true);
    assert.equal(rollUpgrade(30, () => 0.3), false);
    assert.equal(rollUpgrade(100, () => 0.999), true);
    assert.equal(rollUpgrade(0, () => 0), false);
  });
});

describe('lines and upgrade values', () => {
  it('effective lines fall back to the template and honour instance rolls', () => {
    assert.deepEqual(effectiveLines(MAIN), { prop1: 1, prop2: 11, num1: 912, num2: 46 });
    assert.deepEqual(effectiveLines(MAIN, { mainProp1: 1, mainPropNum1: 1000, mainProp2: 11, mainPropNum2: 50 }), { prop1: 1, prop2: 11, num1: 1000, num2: 50 });
  });

  it('an upgrade never lowers a stat (ladder row 1 is 0.9 x template)', () => {
    const cur = effectiveLines(MAIN);
    const up = upgradedLines(cur, MAIN, row(1));
    assert.equal(up.num1, 912);
    assert.equal(up.num2, 46);
    const high = upgradedLines(cur, MAIN, row(20, { propNum1: 985, propNum2: 49 }));
    assert.deepEqual([high.prop1, high.prop2, high.num1, high.num2], [1, 11, 985, 49]);
  });

  it('cumulative spirituality sums the rows 1..level', () => {
    const t = buildArtifactTables([
      { tid: 1350, level: 1, spirit_num: 100000 }, { tid: 1350, level: 2, spirit_num: 200000 }, { tid: 1350, level: 3, spirit_num: 300000 },
    ], []);
    assert.equal(cumulativeSpirit(t, 1350, 2), 300000);
    assert.equal(cumulativeSpirit(t, 1350, 0), 0);
    assert.equal(cumulativeSpirit(t, 9, 3), 0);
    assert.equal(resolveRefund(300000), 120000);
    assert.equal(resolveRefund(7), 2);
  });
});

describe('stats through the equip pipeline', () => {
  it('a main weapon contributes its main lines once, without the star multiplier, plus bind_prop_num', () => {
    const b = equipBonusesOf([{ tpl: MAIN, star: 10, props: { mainProp1: 1, mainPropNum1: 1000, mainProp2: 11, mainPropNum2: 50 } }]);
    assert.equal(b.flat.maxHp, 1000 + 7);
    assert.equal(b.flat.speed, 50 + 7);
  });

  it('sub weapons carry no stat lines (their flag lines are display only, as in Go)', () => {
    const b = equipBonusesOf([{ tpl: SUB, star: 3, props: { flag: '{"succ0":{"propType":1,"propVal":5000}}', t1: 4898 } }]);
    assert.deepEqual(b.flat, {});
    assert.deepEqual(b.rates, {});
  });

  it('a normal item keeps the star multiplier', () => {
    const b = equipBonusesOf([{ tpl: { kind: 1, main_prop1: 4, main_prop_num1: 100 }, star: 10 }]);
    assert.equal(b.flat.attack, 260);
  });
});

describe('reset prop', () => {
  it('range is template .. template x 2 and the roll stays inside it', () => {
    assert.deepEqual(resetMax(MAIN), { num1: 1824, num2: 92 });
    assert.deepEqual(rollReset(MAIN, () => 0), { num1: 912, num2: 46 });
    const hi = rollReset(MAIN, () => 0.999999);
    assert.ok(hi.num1 <= 1824 && hi.num1 >= 912 && hi.num2 <= 92 && hi.num2 >= 46);
    assert.equal(hi.num1, 1824);
  });

  it('gate: main, bound, level 5+, 40000 spirituality, 5 stones', () => {
    const g = { main: true, bound: true, star: 5, spirituality: 40000, stones: 5 };
    assert.equal(resetGate(g), null);
    assert.notEqual(resetGate({ ...g, main: false }), null);
    assert.notEqual(resetGate({ ...g, bound: false }), null);
    assert.notEqual(resetGate({ ...g, star: 4 }), null);
    assert.notEqual(resetGate({ ...g, spirituality: 39999 }), null);
    assert.notEqual(resetGate({ ...g, stones: 4 }), null);
  });
});

describe('transfer', () => {
  const src = { main: true, id: 1, num1: 1500, worn: false };
  const tgt = { main: true, id: 2, num1: 900 };
  it('allows a weaker target with one stone', () => {
    assert.equal(transGate(src, tgt, 1), null);
  });
  it('refuses same item, sub weapons, worn source, stronger or equal target, no stone', () => {
    assert.notEqual(transGate(src, { ...tgt, id: 1 }, 1), null);
    assert.notEqual(transGate({ ...src, main: false }, tgt, 1), null);
    assert.notEqual(transGate({ ...src, worn: true }, tgt, 1), null);
    assert.notEqual(transGate(src, { ...tgt, num1: 1500 }, 1), null);
    assert.notEqual(transGate(src, tgt, 0), null);
  });
});

describe('skills', () => {
  it('template list skips non-integer entries', () => {
    assert.deepEqual(templateSkillIds('4861|7-2|7-3|7-4'), [4861]);
    assert.deepEqual(templateSkillIds('7-11'), []);
    assert.deepEqual(templateSkillIds(null), []);
  });

  it('main weapon: t-slots plus the base skill at position 1; sub weapon: none', () => {
    assert.deepEqual(skillMap(MAIN), { 1: 4861 });
    assert.deepEqual(skillMap(MAIN, { t1: 4898, t3: 4900 }), { 1: 4898, 3: 4900 });
    assert.deepEqual(skillMap(SUB, { t1: 4898 }), {});
  });

  it('pick excludes the current skill and is uniform over the rest', () => {
    const pool = [10, 20, 30];
    assert.equal(pickSkill(pool, 20, () => 0), 10);
    assert.equal(pickSkill(pool, 20, () => 0.99), 30);
    assert.equal(pickSkill([5], 5), undefined);
  });
});

describe('sub weapon lines', () => {
  it('flag parsing ignores malformed data', () => {
    assert.deepEqual(parseFlag('{"succ0":{"propType":4,"propVal":300}}'), { succ0: { propType: 4, propVal: 300 } });
    assert.deepEqual(parseFlag('nope'), {});
    assert.deepEqual(parseFlag(undefined), {});
  });

  it('activation is sequential, once per line, sub only, level 50', () => {
    const base = { sub: true, playerLevel: 50, index: 0, flag: {} };
    assert.equal(activateGate(base), null);
    assert.notEqual(activateGate({ ...base, sub: false }), null);
    assert.notEqual(activateGate({ ...base, playerLevel: 49 }), null);
    assert.notEqual(activateGate({ ...base, index: 3 }), null);
    assert.notEqual(activateGate({ ...base, index: 1 }), null);
    assert.equal(activateGate({ ...base, index: 1, flag: { succ0: { propType: 1, propVal: 1 } } }), null);
    assert.notEqual(activateGate({ ...base, flag: { succ0: { propType: 1, propVal: 1 } } }), null);
  });

  it('rolled lines stay inside the type range', () => {
    for (const r of [0, 0.3, 0.77, 0.999999]) {
      const line = rollLine(() => r);
      const range = MW_PRO_RANGE[line.propType];
      assert.ok(range && line.propVal >= range.min && line.propVal <= range.max, JSON.stringify(line));
    }
  });
});
