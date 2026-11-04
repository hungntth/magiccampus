// Title rules: ct / cts lists (special filter, expiry, order), special flag, views and the long-buff row 0.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BuffType } from '@mc/shared';
import {
  isSpecialTitle, TITLE_BUFF_ROW, titleListStrings, titleLists, titleLongBuff, titleView,
} from './title-rules';

const tpls: Record<number, Record<string, unknown>> = {
  1: { id: 1, n: 'A', a: '0xd7e4bc|<|>', b: 546, k: 1, s: -1, i: 'x' },
  2: { id: 2, n: 'B', a: '0xff3737|1|2', b: 2822, k: 2, s: 1, i: 'y' },
  3: { id: 3, n: 'C', a: '', b: 0, k: 1, s: 0, i: '' },
  4: { id: 4, n: 'D', a: '', b: 0, k: 3, s: 2, i: '' },
};
const tplOf = (id: number): Record<string, unknown> | undefined => tpls[id];
const NOW = 1_000_000;

describe('isSpecialTitle', () => {
  it('is true for s in 1, 2 only', () => {
    assert.deepEqual([1, 2, 3, 4].map((id) => isSpecialTitle(tplOf(id))), [false, true, false, true]);
    assert.equal(isSpecialTitle(undefined), false);
  });
});

describe('titleLists', () => {
  it('ct = every owned title, cts = owned special ones; unowned specials never appear', () => {
    const l = titleLists([{ titleId: 4 }, { titleId: 1 }, { titleId: 3 }], tplOf, NOW);
    assert.deepEqual(l.ct, [4, 1, 3]);
    assert.deepEqual(l.cts, [4]);
    assert.equal(l.ct.includes(2), false);
  });

  it('hides expired grants and rows without a template, keeps the given (newest-first) order', () => {
    const l = titleLists([
      { titleId: 2, expiresAt: new Date(NOW - 1) }, { titleId: 99 }, { titleId: 2 + 2, expiresAt: new Date(NOW + 5) }, { titleId: 1 },
    ], tplOf, NOW);
    assert.deepEqual(l.ct, [4, 1]);
    assert.deepEqual(l.cts, [4]);
  });

  it('formats like the Flash client: ct "|a|b|", cts "a|b|", empty = "|" / ""', () => {
    assert.deepEqual(titleListStrings({ ct: [1, 3], cts: [4] }), { ct: '|1|3|', cts: '4|' });
    assert.deepEqual(titleListStrings({ ct: [], cts: [] }), { ct: '|', cts: '' });
  });
});

describe('titleView / titleLongBuff', () => {
  it('view carries name, style and the buff description', () => {
    const v = titleView(tpls[1], { description: 'HP + 5%' }, new Date(NOW));
    assert.deepEqual(v, { id: 1, n: 'A', a: '0xd7e4bc|<|>', i: 'x', k: 1, s: -1, bt: 'HP + 5%', exp: NOW });
    assert.equal(titleView(tpls[3], undefined).bt, '');
  });

  it('buff row key is 0, permanent and not removable', () => {
    const b = titleLongBuff(tpls[1], { id: 546, name: 'Buff', icon_code: 4030200150015, description: 'HP + 3%' });
    assert.equal(b.id, TITLE_BUFF_ROW);
    assert.equal(b.id, 0);
    assert.equal(b.bid, 546);
    assert.equal(b.type, BuffType.PERMANENT);
    assert.equal(b.removable, false);
    assert.equal(b.iconCode, '4030200150015');
    assert.equal(b.info, 'HP + 3%');
  });
});
