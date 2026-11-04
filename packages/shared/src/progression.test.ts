// Tests for the progression helpers: currency resolution, ct/cts joins and title style parsing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CURRENCY_IDS, joinCt, joinCts, parseTitleStyle, resolveCurrency, titleLabel } from './progression.js';

describe('resolveCurrency', () => {
  it('accepts keys and Go numeric ids, rejects the rest', () => {
    assert.equal(resolveCurrency('spirituality'), 'spirituality');
    assert.equal(resolveCurrency('241'), 'spirituality');
    assert.equal(resolveCurrency(CURRENCY_IDS.starPnt), 'starPnt');
    assert.equal(resolveCurrency('gold'), null);
    assert.equal(resolveCurrency(1), null);
    assert.equal(resolveCurrency(undefined), null);
  });
});

describe('ct / cts joins', () => {
  it('uses edge pipes for ct and a trailing pipe for cts', () => {
    assert.equal(joinCt([3, 9]), '|3|9|');
    assert.equal(joinCt([]), '|');
    assert.equal(joinCts([3, 9]), '3|9|');
    assert.equal(joinCts([]), '');
  });
});

describe('title style', () => {
  it('parses color, prefix and suffix', () => {
    assert.deepEqual(parseTitleStyle('0xd7e4bc|≮|≯'), { color: '#d7e4bc', prefix: '≮', suffix: '≯' });
    assert.deepEqual(parseTitleStyle('0xFF00FF|￥|￥').color, '#ff00ff');
  });

  it('falls back to white and empty affixes', () => {
    assert.deepEqual(parseTitleStyle(''), { color: '#ffffff', prefix: '', suffix: '' });
    assert.equal(parseTitleStyle('zzz|a|b').color, '#ffffff');
  });

  it('builds the over-the-head text', () => {
    assert.deepEqual(titleLabel({ n: 'Phú Hào', a: '0xFF00FF|￥|￥' }), { text: '￥Phú Hào￥', color: '#ff00ff' });
  });
});
