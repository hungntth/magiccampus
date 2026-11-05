// Unit tests for the pure mail rules: addMail parsing / clipping, COD, escaping, expiry, return / COD state, system input.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_MS, buildSystemFields, canReturn, codPaymentText, effectiveCod, escapeHtml, hasContent, isExpired, parseAddMail, parseIds,
  returnText,
} from './mail-rules';

const obj = (o: Record<string, unknown>) => ({ subject: 's', text: 't', codFlag: -1, money: 0, gold: 0, codMoney: 0, codGold: 0, ...o });

describe('parseAddMail', () => {
  it('parses a plain mail and trims the receiver', () => {
    const r = parseAddMail([' Bob ', obj({ money: 5, gold: 2 }), 'md5']);
    assert.ok(r.ok);
    assert.equal(r.input.receiverName, 'Bob');
    assert.equal(r.input.money, 5);
    assert.equal(r.input.gold, 2);
    assert.equal(r.input.attach, null);
  });
  it('refuses negative or non-numeric amounts', () => {
    assert.deepEqual(parseAddMail(['b', obj({ money: -1 })]), { ok: false, reason: 'amount' });
    assert.deepEqual(parseAddMail(['b', obj({ gold: 'x' })]), { ok: false, reason: 'amount' });
  });
  it('refuses a missing object', () => {
    assert.deepEqual(parseAddMail(['b']), { ok: false, reason: 'args' });
    assert.deepEqual(parseAddMail(['b', []]), { ok: false, reason: 'args' });
  });
  it('clips subject to 100 and text to 1000 characters', () => {
    const r = parseAddMail(['b', obj({ subject: 'a'.repeat(150), text: 'ă'.repeat(1200) })]);
    assert.ok(r.ok);
    assert.equal([...r.input.subject].length, 100);
    assert.equal([...r.input.text].length, 1000);
  });
  it('keeps the attachment only for type 9 / 39 with a positive id', () => {
    const item = parseAddMail(['b', obj({ type: 9, id: 12 })]);
    assert.ok(item.ok && item.input.attach?.type === 9 && item.input.attach.id === 12);
    const pet = parseAddMail(['b', obj({ type: 39, id: 3 })]);
    assert.ok(pet.ok && pet.input.attach?.type === 39);
    const none = parseAddMail(['b', obj({ type: -1, id: 12 })]);
    assert.ok(none.ok && none.input.attach === null);
    const bad = parseAddMail(['b', obj({ type: 9, id: 0 })]);
    assert.ok(bad.ok && bad.input.attach === null);
  });
  it('keeps COD amounts only with codFlag 1', () => {
    const off = parseAddMail(['b', obj({ money: 1, codMoney: 50 })]);
    assert.ok(off.ok && off.input.codMoney === 0);
    const on = parseAddMail(['b', obj({ money: 1, codFlag: 1, codMoney: 50, codGold: 2 })]);
    assert.ok(on.ok && on.input.codMoney === 50 && on.input.codGold === 2);
  });
});

describe('effectiveCod', () => {
  const base = { receiverName: 'b', subject: '', text: '', money: 0, gold: 0, codMoney: 9, codGold: 1, attach: null };
  it('drops the COD of an empty mail', () => {
    assert.deepEqual(effectiveCod(base), { codMoney: 0, codGold: 0 });
  });
  it('keeps it when money, gold or an attachment is carried', () => {
    assert.deepEqual(effectiveCod({ ...base, money: 1 }), { codMoney: 9, codGold: 1 });
    assert.deepEqual(effectiveCod({ ...base, attach: { type: 9, id: 1 } }), { codMoney: 9, codGold: 1 });
  });
});

describe('texts', () => {
  it('escapes HTML of player text', () => {
    assert.equal(escapeHtml('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  });
  it('builds the return and COD payment texts verbatim', () => {
    assert.equal(returnText('Hi', 'Bob'), 'Thư "Hi" gửi cho Bob đã bị trả lại, vật phẩm và tiền được hoàn cho bạn.');
    assert.equal(codPaymentText('Bob', 'Hi'), 'Bob đã nhận thư "Hi" và trả phí cho bạn.');
  });
});

describe('expiry and return', () => {
  const now = 100 * DAY_MS;
  it('unread mail expires after 30 days from creation', () => {
    assert.equal(isExpired({ readAt: null, createdAt: new Date(now - 29 * DAY_MS) }, now), false);
    assert.equal(isExpired({ readAt: null, createdAt: new Date(now - 31 * DAY_MS) }, now), true);
  });
  it('read mail expires 10 days after the read date, whatever its age', () => {
    assert.equal(isExpired({ readAt: new Date(now - 9 * DAY_MS), createdAt: new Date(0) }, now), false);
    assert.equal(isExpired({ readAt: new Date(now - 11 * DAY_MS), createdAt: new Date(now) }, now), true);
  });
  const facts = { readAt: null, createdAt: new Date(0), claimed: false, money: 0, gold: 0, attachment: null, senderId: 5, returned: false };
  it('hasContent ignores claimed mail', () => {
    assert.equal(hasContent({ claimed: false, money: 1, gold: 0, attachment: null }), true);
    assert.equal(hasContent({ claimed: true, money: 1, gold: 0, attachment: null }), false);
    assert.equal(hasContent({ claimed: false, money: 0, gold: 0, attachment: { kind: 'item', itemId: 1 } }), true);
    assert.equal(hasContent({ claimed: false, money: 0, gold: 0, attachment: null }), false);
  });
  it('returns only unclaimed, never-returned player mail with content', () => {
    assert.equal(canReturn({ ...facts, money: 3 }), true);
    assert.equal(canReturn({ ...facts, money: 3, returned: true }), false);
    assert.equal(canReturn({ ...facts, money: 3, senderId: 0 }), false);
    assert.equal(canReturn({ ...facts, money: 3, claimed: true }), false);
    assert.equal(canReturn(facts), false);
  });
});

describe('buildSystemFields', () => {
  const ok = { receiverId: 7, title: 'T', text: '<b>x</b>' };
  it('defaults the sender and keeps raw html', () => {
    const f = buildSystemFields(ok);
    assert.equal(f?.senderName, 'Hệ thống');
    assert.equal(f?.text, '<b>x</b>');
    assert.equal(f?.attachment, null);
    assert.equal(f?.returned, false);
  });
  it('builds a template attachment and validates table / count', () => {
    const f = buildSystemFields({ ...ok, item: { templateId: 4875, table: 29, count: 2, bound: true } });
    assert.deepEqual(f?.attachment, { kind: 'template', templateId: 4875, table: 29, count: 2, bound: true, quality: 0 });
    assert.equal(buildSystemFields({ ...ok, item: { templateId: 1, table: 29, count: 0, bound: false } }), null);
    assert.equal(buildSystemFields({ ...ok, item: { templateId: 1, table: 12 as 29, count: 1, bound: false } }), null);
  });
  it('builds an escrow attachment: exactly one of item / pet, never together with a template', () => {
    assert.deepEqual(buildSystemFields({ ...ok, escrow: { fromRef: 'auction:1', itemId: 9 } })?.attachment, { kind: 'item', itemId: 9 });
    assert.deepEqual(buildSystemFields({ ...ok, escrow: { fromRef: 'auction:1', petId: 4 } })?.attachment, { kind: 'pet', petId: 4 });
    assert.equal(buildSystemFields({ ...ok, escrow: { fromRef: 'a:1', itemId: 9, petId: 4 } }), null);
    assert.equal(buildSystemFields({ ...ok, item: { templateId: 1, table: 29, count: 1, bound: false }, escrow: { fromRef: 'a:1', itemId: 9 } }), null);
  });
  it('refuses bad receivers and amounts', () => {
    assert.equal(buildSystemFields({ ...ok, receiverId: 0 }), null);
    assert.equal(buildSystemFields({ ...ok, money: -1 }), null);
    assert.equal(buildSystemFields({ ...ok, gold: 1.5 })?.gold, 1);
  });
  it('clips the title to 100 characters and the sender to 50', () => {
    const f = buildSystemFields({ ...ok, title: 'x'.repeat(130), senderName: 'y'.repeat(70) });
    assert.equal(f?.subject.length, 100);
    assert.equal(f?.senderName.length, 50);
  });
});

describe('parseIds', () => {
  it('accepts arrays and Flash maps, drops junk, duplicates and the length key', () => {
    assert.deepEqual(parseIds([3, '4', 3, 0, -1, 'x', 1.5]), [3, 4]);
    assert.deepEqual(parseIds({ 0: 7, 1: 8, length: 2 }), [7, 8]);
    assert.deepEqual(parseIds(undefined), []);
  });
});
