// Unit tests for the shared brotherhood contract: title validation, fee and leave penalty.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BROTHER, BROTHER_TEXT, brotherFee, leaveIntimacy, normalizeBrotherTitle } from './brotherhood.js';

describe('normalizeBrotherTitle', () => {
  it('accepts 1-8 characters and trims', () => {
    assert.equal(normalizeBrotherTitle('  Kim Lan '), 'Kim Lan');
    assert.equal(normalizeBrotherTitle('A'), 'A');
    assert.equal(normalizeBrotherTitle('12345678'), '12345678');
  });
  it('counts code points, not bytes', () => {
    assert.equal(normalizeBrotherTitle('Anh Em Nhà Ta'), null); // 13
    assert.equal(normalizeBrotherTitle('Đồng Tâm'), 'Đồng Tâm');
  });
  it('rejects empty, too long, forbidden and control characters', () => {
    assert.equal(normalizeBrotherTitle('   '), null);
    assert.equal(normalizeBrotherTitle('123456789'), null);
    for (const bad of ['a<b', 'a>b', 'a&b', 'a|b', 'a"b', "a'b", 'a\\b', 'a[b', 'a]b', 'a{b', 'a}b', 'a%b', 'a\nb', 'a\u0000b']) {
      assert.equal(normalizeBrotherTitle(bad), null, JSON.stringify(bad));
    }
    assert.equal(normalizeBrotherTitle(42), null);
    assert.equal(normalizeBrotherTitle(undefined), null);
  });
});

describe('fee and penalty', () => {
  it('charges 2 000 000 per newcomer', () => {
    assert.equal(brotherFee(0), 0);
    assert.equal(brotherFee(2), 4_000_000);
    assert.equal(brotherFee(5), 10_000_000);
  });
  it('drops 2500 intimacy with a floor of 0', () => {
    assert.equal(leaveIntimacy(10_000), 7500);
    assert.equal(leaveIntimacy(2500), 0);
    assert.equal(leaveIntimacy(100), 0);
  });
  it('keeps the Flash prompt numbers in sync with the tuning', () => {
    assert.ok(BROTHER_TEXT.leave.includes(String(BROTHER.leavePenalty)));
    assert.ok(BROTHER_TEXT.leave.includes(String(BROTHER.leaveGold)));
    assert.ok(BROTHER_TEXT.confirmTitle('x').includes(String(BROTHER.titleGold)));
  });
});
