// Title medals: description reader, grant length and re-grant expiry (legacy effect_desc_title.go / item_duration.go / grant.go).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { descTitleKey, nextTitleExpiry, resolveMedalGrant, titleKey } from './title-medal';

describe('descTitleKey', () => {
  it('reads the quoted title of item 795 (escaped quotes and CRLF)', () => {
    assert.equal(descTitleKey('Bạn được tặng danh hiệu \\"Xuất Vân Chi \r\nHồng\\"'), titleKey('Xuất Vân Chi Hồng'));
  });
  it('reads "Nhấp đôi để nhận danh hiệu X" and curly quotes', () => {
    assert.equal(descTitleKey('Nhấp đôi để nhận danh hiệu Yên Giáp'), 'yên giáp');
    assert.equal(descTitleKey('Bạn sẽ nhận được danh hiệu Kết Hôn Pha Lê!'), null); // "được" is not a grant verb
    assert.equal(descTitleKey('Bạn sẽ được tặng danh hiệu “Phú Gia Pháp Thuật”!'), 'phú gia pháp thuật');
  });
  it('refuses hedged heads and two titles', () => {
    assert.equal(descTitleKey('Có thể đổi danh hiệu X'), null);
    assert.equal(descTitleKey('Tặng danh hiệu A và danh hiệu B'), null);
    assert.equal(descTitleKey('Huy chương chứng minh năng lực chiến đấu'), null);
  });
});

describe('resolveMedalGrant', () => {
  const now = Date.UTC(2026, 10, 7);
  it('name label wins over t', () => {
    assert.deepEqual(resolveMedalGrant('Huy Chương X (7 Ngày)', '', 43200, 2, now), { seconds: 7 * 86400, expired: false });
  });
  it('description phrase, then t minutes; forever titles ignore t', () => {
    assert.equal(resolveMedalGrant('A', 'duy trì 30 ngày', -1, 2, now).seconds, 30 * 86400);
    assert.equal(resolveMedalGrant('A', '', 60, 2, now).seconds, 3600);
    assert.equal(resolveMedalGrant('A', '', 60, 1, now).seconds, 0);
    assert.equal(resolveMedalGrant('A', '', -1, 1, now).seconds, 0);
  });
  it('12-digit t is the medal deadline (ICT)', () => {
    assert.equal(resolveMedalGrant('A', '', 201509022359, 1, now).expired, true);
    const g = resolveMedalGrant('A', '', 202611080700, 2, now); // 2026-11-08 00:00 UTC
    assert.deepEqual(g, { seconds: 86400, expired: false });
    assert.equal(resolveMedalGrant('A', '', 202611080700, 1, now).seconds, 0);
  });
});

describe('nextTitleExpiry', () => {
  const now = 1_000_000;
  it('new, expired restart, stacking, permanent', () => {
    assert.deepEqual(nextTitleExpiry(undefined, 10, now), { expiresAt: new Date(now + 10_000), first: true });
    assert.deepEqual(nextTitleExpiry(new Date(now - 1), 10, now), { expiresAt: new Date(now + 10_000), first: false });
    assert.deepEqual(nextTitleExpiry(new Date(now + 5_000), 10, now), { expiresAt: new Date(now + 15_000), first: false });
    assert.deepEqual(nextTitleExpiry(new Date(now + 5_000), 0, now), { expiresAt: null, first: false });
    assert.equal(nextTitleExpiry(null, 10, now), 'unchanged');
    assert.equal(nextTitleExpiry(null, 0, now), 'unchanged');
  });
});
