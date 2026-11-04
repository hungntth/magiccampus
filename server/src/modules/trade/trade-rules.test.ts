// Tests for trade-rules: offer parsing, validation and the TradeBook lock/confirm state machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRADE_NOTE, TradeBook, parseOffer, validateOffer, type OwnedItem } from './trade-rules';

const owned = (entries: [number, OwnedItem][]): Map<number, OwnedItem> => new Map(entries);
const bag = (binded = false): OwnedItem => ({ slotType: 0, binded });
const rich = { money: 1000, gold: 10 };

test('parseOffer accepts arrays and Flash slot maps, drops empty slots, rejects bad shapes', () => {
  assert.deepEqual(parseOffer({ money: 5, gold: 1, items: [7, 8] }), { money: 5, gold: 1, items: [7, 8] });
  assert.deepEqual(parseOffer({ money: 0, gold: 0, petIds: [-1], items: { '1': 7, '2': -1, '3': 9 } }), { money: 0, gold: 0, items: [7, 9] });
  assert.deepEqual(parseOffer({}), { money: 0, gold: 0, items: [] });
  assert.equal(parseOffer(null), null);
  assert.equal(parseOffer([1]), null);
  assert.equal(parseOffer({ money: -1 }), null);
  assert.equal(parseOffer({ money: 1.5 }), null);
  assert.equal(parseOffer({ items: ['x'] }), null);
});

test('validateOffer: ok, too many, duplicates, not owned, equipped, bound, balances', () => {
  const rows = owned([[1, bag()], [2, bag()], [3, { slotType: 1, binded: false }], [4, bag(true)], [5, bag()], [6, bag()], [7, bag()]]);
  assert.equal(validateOffer({ money: 1000, gold: 10, items: [1, 2] }, rows, rich), null);
  assert.equal(validateOffer({ money: 0, gold: 0, items: [1, 2, 5, 6, 7] }, rows, rich), null);
  assert.equal(validateOffer({ money: 0, gold: 0, items: [1, 2, 5, 6, 7, 99] }, rows, rich), TRADE_NOTE.TOO_MANY);
  assert.equal(validateOffer({ money: 0, gold: 0, items: [1, 1] }, rows, rich), TRADE_NOTE.TOO_MANY);
  assert.equal(validateOffer({ money: 0, gold: 0, items: [99] }, rows, rich), TRADE_NOTE.NOT_OWNED);
  assert.equal(validateOffer({ money: 0, gold: 0, items: [3] }, rows, rich), TRADE_NOTE.NOT_OWNED);
  assert.equal(validateOffer({ money: 0, gold: 0, items: [4] }, rows, rich), TRADE_NOTE.BOUND);
  assert.equal(validateOffer({ money: 1001, gold: 0, items: [] }, rows, rich), TRADE_NOTE.NO_MONEY);
  assert.equal(validateOffer({ money: 0, gold: 11, items: [] }, rows, rich), TRADE_NOTE.NO_GOLD);
});

test('TradeBook.start refuses self and busy players, and registers both sides', () => {
  const b = new TradeBook();
  assert.equal(b.start(1, 1).ok, false);
  const s = b.start(1, 2);
  assert.equal(s.ok, true);
  assert.equal(b.sessionOf(1), b.sessionOf(2));
  assert.deepEqual(b.start(3, 1), { ok: false, info: TRADE_NOTE.PEER_TRADING });
  assert.deepEqual(b.start(2, 3), { ok: false, info: TRADE_NOTE.SELF_TRADING });
});

test('state machine: confirm needs both locks; first confirm notifies, second executes', () => {
  const b = new TradeBook();
  b.start(1, 2);
  assert.deepEqual(b.confirm(1), { ok: false, info: TRADE_NOTE.NOT_LOCKED });
  b.lock(1, { money: 0, gold: 0, items: [] });
  assert.deepEqual(b.confirm(1), { ok: false, info: TRADE_NOTE.NOT_LOCKED });
  b.lock(2, { money: 5, gold: 0, items: [] });
  const c1 = b.confirm(1);
  assert.ok(c1.ok && c1.first && !c1.both && c1.peer === 2);
  const again = b.confirm(1);
  assert.ok(again.ok && !again.first && !again.both);
  const c2 = b.confirm(2);
  assert.ok(c2.ok && c2.both && !c2.first);
  assert.deepEqual(b.confirm(1), { ok: false, info: TRADE_NOTE.BUSY });
  assert.deepEqual(b.lock(1, { money: 0, gold: 0, items: [] }), { ok: false, info: TRADE_NOTE.BUSY });
});

test('re-lock resets both confirmations', () => {
  const b = new TradeBook();
  const s = b.start(1, 2);
  assert.ok(s.ok);
  b.lock(1, { money: 1, gold: 0, items: [] });
  b.lock(2, { money: 1, gold: 0, items: [] });
  b.confirm(1);
  assert.equal(s.session.a.confirmed, true);
  const r = b.lock(2, { money: 2, gold: 0, items: [] });
  assert.ok(r.ok && r.peer === 1);
  assert.equal(s.session.a.confirmed, false);
  assert.equal(s.session.b.confirmed, false);
  const c = b.confirm(2);
  assert.ok(c.ok && c.first && !c.both); // player 1 must confirm again
});

test('stop removes both sides, is refused while executing, and tolerates no session', () => {
  const b = new TradeBook();
  assert.equal(b.stop(9), null);
  b.start(1, 2);
  const st = b.stop(2);
  assert.ok(st);
  assert.equal(b.sessionOf(1), undefined);
  assert.equal(b.start(1, 3).ok, true);
  b.lock(1, { money: 0, gold: 0, items: [] });
  b.lock(3, { money: 0, gold: 0, items: [] });
  b.confirm(1);
  b.confirm(3);
  assert.equal(b.stop(1), null); // executing
  const s = b.sessionOf(1)!;
  b.end(s);
  assert.equal(b.sessionOf(3), undefined);
});

test('lock without a session fails', () => {
  assert.deepEqual(new TradeBook().lock(1, { money: 0, gold: 0, items: [] }), { ok: false, info: TRADE_NOTE.NO_SESSION });
});
