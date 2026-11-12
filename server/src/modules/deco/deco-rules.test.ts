// Pure Hồn Khí rules: state parser (own + Go shapes), activation / equip / expiry, look tiers, hole level-up batch, suit / link bonuses.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DecoHoleRow, DecoShowRow } from '@mc/shared';
import { decoBonuses, decoSuitName, decoTotals, expireShows, planActivate, planEquip, planHoleLevel, planShowLvl, setVisible, suitReply } from './deco-rules';
import { decoLooks } from './deco-look';
import { decoInfoOf, emptyDeco, parseActiveFlagString, parseDeco } from './deco-state';

const show = (id: number, position: number, suitId: number, over: Partial<DecoShowRow> = {}): DecoShowRow => ({
  id, name: `Bo${suitId} P${position}`, desc: '', iconCode: '0', position, suitId, linkSuitId: suitId === 1 ? 2 : suitId === 2 ? 1 : suitId, activeGold: 100, t: 1,
  props: [{ t: position === 1 ? 1 : 4, v: 500 }], res: ['11', '12', '21', '0', '31', '32'], ...over,
});
const SHOWS = [1, 2, 3, 4].map((p) => show(p, p, 2)).concat([1, 2, 3, 4].map((p) => show(p + 4, p, 1)));
const showOf = (id: number) => SHOWS.find((s) => s.id === id);
const suitOf = (suit: number) => SHOWS.filter((s) => s.suitId === suit);
const hole = (id: number, level: number, nextId: number, over: Partial<DecoHoleRow> = {}): DecoHoleRow => ({
  id, position: 1, level, nextId, costNum: 10, costSil: 1000, rate: 100, props: [], ...over,
});
const HOLES = new Map([[1, hole(1, 0, 5)], [5, hole(5, 1, 6, { rate: 50 })], [6, hole(6, 30, 7)], [7, hole(7, 50, 0)], [2, hole(2, 0, 0)]]);
const holeOf = (id: number) => HOLES.get(id);
const NOW = 1_000_000;

test('parseDeco reads the own shape, the Go shape and garbage', () => {
  assert.equal(parseDeco(undefined).pos['3'].hid, 3);
  const go = parseDeco({ positions: { 1: { hid: 55, did: 2, isShow: 1, showLvl: 2, activeFlag: '{r:{},s:{2:1,7:123456}}', r1: 5, r16: 9 } } });
  assert.deepEqual(go.pos['1'].s, { 2: 1, 7: 123456 });
  assert.equal(go.pos['1'].r[0], 5);
  assert.equal(go.pos['1'].r[15], 9);
  assert.equal(go.pos['1'].isShow, 1);
  const own = parseDeco({ pos: { 2: { hid: 2, did: 0, isShow: 0, showLvl: 1, s: { 3: 1 }, r: [0, 4] } } });
  assert.equal(own.pos['2'].r[1], 4);
  assert.deepEqual(parseActiveFlagString('{"r":{},"s":{"4":"1"}}'), { 4: 1 });
});

test('decoInfoOf derives level, clamps the tier and opens rune slots by level', () => {
  const s = parseDeco({ pos: { 1: { hid: 6, showLvl: 3, r: [7] } } });
  const info = decoInfoOf(s, holeOf);
  assert.equal(info['1'].level, 30);
  assert.equal(info['1'].showLvl, 2);
  assert.equal(info['1'].n, 1);
  assert.deepEqual([0, 10, 11, 12, 13].map((i) => info['1'].activeFlag.r[String(i)]), [1, 1, 1, 0, 0]);
});

test('planActivate: gold buy, no-op when live, event-only refusal, wrong position', () => {
  const s = emptyDeco();
  const buy = planActivate(s, show(1, 1, 2, { activeGold: 188 }), 1, NOW);
  assert.ok(buy.ok && buy.gold === 188 && buy.changed && buy.state.pos['1'].s['1'] === 1);
  if (buy.ok) {
    const again = planActivate(buy.state, show(1, 1, 2), 1, NOW);
    assert.ok(again.ok && !again.changed && again.gold === 0);
  }
  assert.equal(planActivate(s, show(1, 1, 2, { activeGold: 0 }), 1, NOW).ok, false);
  assert.equal(planActivate(s, show(2, 2, 2), 1, NOW).ok, false);
  const timed = planActivate(s, show(1, 1, 2, { t: 60 }), 1, NOW);
  assert.ok(timed.ok && timed.state.pos['1'].s['1'] === NOW + 3_600_000);
});

test('planEquip needs a live show; off clears only the same show; visibility and tiers', () => {
  let s = parseDeco({ pos: { 1: { hid: 6, s: { 1: 1, 5: NOW - 1 } } } });
  assert.equal(planEquip(s, showOf(5), 1, true, NOW).ok, false, 'expired show');
  assert.equal(planEquip(s, showOf(2), 2, true, NOW).ok, false, 'not activated');
  const on = planEquip(s, showOf(1), 1, true, NOW);
  assert.ok(on.ok && on.state.pos['1'].did === 1 && on.state.pos['1'].isShow === 1);
  if (!on.ok) return;
  s = on.state;
  const offOther = planEquip(s, showOf(5), 1, false, NOW);
  assert.ok(offOther.ok && offOther.state.pos['1'].did === 1);
  const off = planEquip(s, showOf(1), 1, false, NOW);
  assert.ok(off.ok && off.state.pos['1'].did === 0);
  const hid = setVisible(s, 1, false);
  assert.ok(hid.ok && hid.state.pos['1'].isShow === 0);
  assert.equal(planShowLvl(s, 1, 3, holeOf).ok, false, 'level 30 allows tier 2 only');
  assert.ok(planShowLvl(s, 1, 2, holeOf).ok);
  assert.equal(planShowLvl(s, 1, 0, holeOf).ok, false);
});

test('decoLooks picks the art of the allowed tier and skips hidden / empty positions', () => {
  const s = parseDeco({ pos: { 1: { hid: 6, did: 1, isShow: 1, showLvl: 3, s: { 1: 1 } }, 2: { did: 2, isShow: 0, s: { 2: 1 } } } });
  assert.deepEqual(decoLooks(s, holeOf, showOf), [{ pos: 1, res: '21', mask: '0' }]);
});

test('expireShows drops dead shows, unequips them and reports the positions', () => {
  const s = parseDeco({ pos: { 1: { did: 1, isShow: 1, s: { 1: NOW - 5, 5: 1 } }, 3: { s: { 3: NOW + 5 } } } });
  const r = expireShows(s, NOW);
  assert.ok(r.changed);
  assert.deepEqual(r.positions, [1]);
  assert.deepEqual(r.state.pos['1'].s, { 5: 1 });
  assert.equal(r.state.pos['1'].did, 0);
  assert.equal(expireShows(r.state, NOW).changed, false);
});

test('planHoleLevel: costs per attempt, stops at max / when funds end, refusals', () => {
  const never = () => 0.99;
  const always = () => 0;
  const p = planHoleLevel(1, holeOf, 10, 1000, 1_000_000, always);
  assert.ok(p.ok && p.hid === 7 && p.attempts === 3 && p.successes === 3 && p.silver === 30 && p.money === 3000);
  const fail = planHoleLevel(5, holeOf, 3, 1000, 1_000_000, never);
  assert.ok(fail.ok && fail.hid === 5 && fail.attempts === 3 && fail.successes === 0, 'failures still pay');
  const poor = planHoleLevel(1, holeOf, 10, 15, 1_000_000, always);
  assert.ok(poor.ok && poor.attempts === 1 && poor.silver === 10);
  assert.deepEqual(planHoleLevel(1, holeOf, 1, 5, 99999, always), { ok: false, note: 'Không đủ Bí Ngân!' });
  assert.deepEqual(planHoleLevel(1, holeOf, 1, 50, 5, always), { ok: false, note: 'Không đủ Ngân phiếu!' });
  assert.equal(planHoleLevel(7, holeOf, 1, 50, 99999, always).ok, false, 'max level');
});

test('stat totals: hole rows, live shows, full suit 20 %, linked suits 10 %', () => {
  const full = (suit: number) => Object.fromEntries(suitOf(suit).map((s) => [String(s.id), 1]));
  const holes = new Map([[1, hole(1, 0, 5, { props: [{ t: 1, v: 100 }] })]]);
  const hOf = (id: number) => holes.get(id);
  const one = parseDeco({ pos: { 1: { hid: 1, s: { 1: 1 } } } });
  const t1 = decoTotals(one, NOW, hOf, showOf, suitOf);
  assert.equal(t1.get(1), 600, '100 hole + 500 piece, no suit bonus');
  const s2 = parseDeco({ pos: { 1: { s: full(2) } } });
  const t2 = decoTotals(s2, NOW, hOf, showOf, suitOf);
  assert.equal(t2.get(1), 100 + 500 + Math.floor((500 * 20) / 100), 'hole + piece hp + 20 % of suit hp');
  assert.equal(t2.get(4), 1500 + Math.floor((1500 * 20) / 100));
  const both = parseDeco({ pos: { 1: { s: { ...full(1), ...full(2) } } } });
  const t3 = decoTotals(both, NOW, hOf, showOf, suitOf);
  assert.equal(t3.get(1), 100 + 1000 + 2 * 100 + Math.floor((1000 * 10) / 100), 'two suits: pieces + two suit bonuses + link 10 %');
  const b = decoBonuses(t2);
  assert.equal(b.flat.maxHp, 700);
  assert.equal(b.flat.attack, 1800);
});

test('suitReply: pieces, flags, link data and the suit name fallback', () => {
  const live = new Set([5, 6, 7, 8, 1]);
  const r = suitReply(1, 2, live, suitOf);
  assert.equal(r.actFlag, true);
  assert.equal(r.actLinkSuitFlag, false);
  assert.equal(r.linkFlag, false);
  assert.deepEqual(r.actArr, [5, 6, 7, 8]);
  assert.deepEqual(r.suitProp.map((p) => p.t), [1, 4]);
  assert.ok(Array.isArray(r.suitProp) && r.suitProp.every((p) => typeof p.propVal === 'number'));
  const linked = suitReply(1, 2, new Set([1, 2, 3, 4, 5, 6, 7, 8]), suitOf);
  assert.equal(linked.linkFlag, true);
  assert.ok(Array.isArray(linked.linkProp));
  assert.equal(suitReply(9, 0, live, suitOf).linkProp, 'null');
  assert.equal(decoSuitName([show(1, 1, 2, { name: 'Mũ Mộng Ma' }), show(2, 2, 2, { name: 'Giáp Mộng Ma' })]), 'Mộng Ma');
});
