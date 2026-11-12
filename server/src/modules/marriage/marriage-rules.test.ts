// Tests for marriage-rules: seek / proposal / NPC gates, couple ordering, board + rank sorting and paging, bond history, the NPC
// proposal book and the hall tier picks.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARRIAGE, RelationType, type CharMarriageRow, type MarriageSekRow } from '@mc/shared';
import {
  NPC_REFUSAL_TEXT, ProposalBook, TierPicks, checkNpcPair, checkRequest, checkSeek, normalizeContent, orderCouple, pageRank, priorBond,
  requestRefusalText, sortCharList, sortRank, sortSeek, type Person, type RankInput,
} from './marriage-rules';

const NOW = Date.UTC(2026, 10, 12, 5, 0, 0);
const man: Person = { id: 1, name: 'An', level: 40, gender: 0 };
const woman: Person = { id: 2, name: 'Binh', level: 35, gender: 1 };
const base = { from: man, to: woman, fromMarried: false, toMarried: false, sent: [], now: NOW };

test('checkSeek: level 30 then married', () => {
  assert.equal(checkSeek(29, false), 'level');
  assert.equal(checkSeek(30, false), null);
  assert.equal(checkSeek(50, true), 'married');
  assert.equal(checkSeek(10, true), 'level');
});

test('checkRequest follows the Go order of gates', () => {
  assert.equal(checkRequest(base), null);
  assert.equal(checkRequest({ ...base, from: { ...man, level: 29 }, fromMarried: true }), 'level');
  assert.equal(checkRequest({ ...base, to: { ...woman, gender: 0 }, fromMarried: true }), 'gender');
  assert.equal(checkRequest({ ...base, fromMarried: true, toMarried: true }), 'married');
  assert.equal(checkRequest({ ...base, toMarried: true }), 'targetMarried');
  const today = (toId: number) => ({ toId, addDate: NOW - 5_000 });
  assert.equal(checkRequest({ ...base, sent: [today(2)] }), 'oncePerTarget');
  assert.equal(checkRequest({ ...base, sent: [3, 4, 5, 6, 7].map(today) }), 'dailyCap');
  assert.equal(checkRequest({ ...base, sent: [3, 4, 5, 6].map(today) }), null);
  // the target's level is not checked (Go parity)
  assert.equal(checkRequest({ ...base, to: { ...woman, level: 1 } }), null);
});

test('refusal texts are the Go notices', () => {
  assert.equal(requestRefusalText('oncePerTarget'), 'Trong 1 ngày chỉ có thể cầu hôn 1 người 1 lần.');
  assert.equal(requestRefusalText('dailyCap'), 'Trong 1 ngày chỉ có thể cầu hôn tối đa 5 người.');
  assert.equal(requestRefusalText('married'), 'Bạn hoặc đối phương đã kết hôn.');
  assert.equal(requestRefusalText('targetMarried'), 'Đối phương đã kết hôn.');
});

test('checkNpcPair: levels, gender, married', () => {
  assert.equal(checkNpcPair(man, woman, false, false), null);
  assert.equal(checkNpcPair(man, { ...woman, level: 29 }, false, false), 'level');
  assert.equal(checkNpcPair(man, { ...woman, gender: 0 }, false, false), 'gender');
  assert.equal(checkNpcPair(man, woman, true, false), 'married');
  assert.equal(checkNpcPair(man, woman, false, true), 'targetMarried');
  assert.equal(NPC_REFUSAL_TEXT.level, 'Cả hai người phải đạt cấp 30 trở lên mới có thể kết hôn.');
});

test('orderCouple puts gender 0 first as the male', () => {
  assert.deepEqual(orderCouple(man, woman), { male: man, female: woman });
  assert.deepEqual(orderCouple(woman, man), { male: man, female: woman });
});

const sek = (cid: number, flag: number, addDate: number): MarriageSekRow => ({
  cid, name: `c${cid}`, classId: 1, gender: 0, exp: 0, online: false, flag, content: '', addDate, pop: 0,
});

test('sortSeek: flag desc then newest first', () => {
  const sorted = sortSeek([sek(1, 0, 100), sek(2, 1, 50), sek(3, 0, 300)]);
  assert.deepEqual(sorted.map((r) => r.cid), [2, 3, 1]);
});

test('sortCharList: everything by addDate desc', () => {
  const ad: CharMarriageRow = { type: 0, cid: 1, content: '', flag: 0, addDate: 10 };
  const req: CharMarriageRow = {
    id: 5, type: 1, cid: 2, targetId: 1, name: 'x|y', classId: 1, gender: 1, exp: 0, online: false, content: '', addDate: 20, flag: 0,
  };
  assert.deepEqual(sortCharList([ad, req]).map((r) => r.type), [1, 0]);
});

const rank = (i: number, intimacy: number, marriedAt: number): RankInput => ({
  maleName: `m${i}`, femaleName: `f${i}`, type: 1, intimacy, marriedAt, time: `t${i}`,
});

test('sortRank: intimacy desc then married earlier first', () => {
  const sorted = sortRank([rank(1, 10, 300), rank(2, 50, 400), rank(3, 10, 100)]);
  assert.deepEqual(sorted.map((r) => r.maleName), ['m2', 'm3', 'm1']);
});

test('pageRank: 48 per page, total and start', () => {
  const rows = Array.from({ length: 50 }, (_, i) => rank(i, 100 - i, i));
  const p0 = pageRank(sortRank(rows), 0);
  assert.equal(p0.data.length, MARRIAGE.rankPage);
  assert.equal(p0.num, 50);
  assert.equal(p0.start, 0);
  assert.deepEqual(p0.data[0], { maleName: 'm0', femaleName: 'f0', type: 1, luxtime: 100, time: 't0' });
  const p1 = pageRank(sortRank(rows), 1);
  assert.equal(p1.data.length, 2);
  assert.equal(p1.start, 48);
  assert.equal(pageRank([], 3).data.length, 0);
  assert.equal(pageRank(sortRank(rows), -2).start, 0);
});

test('priorBond: tutor / brother refuse, friend beats enemy, none = 0', () => {
  assert.deepEqual(priorBond([]), { ok: true, prior: 0 });
  assert.deepEqual(priorBond([undefined, RelationType.FRIEND]), { ok: true, prior: 1 });
  assert.deepEqual(priorBond([RelationType.ENEMY, undefined]), { ok: true, prior: 3 });
  assert.deepEqual(priorBond([RelationType.ENEMY, RelationType.FRIEND]), { ok: true, prior: 1 });
  assert.deepEqual(priorBond([RelationType.TUTOR]), { ok: false });
  assert.deepEqual(priorBond([RelationType.FRIEND, RelationType.BROTHER]), { ok: false });
});

test('ProposalBook: one per target, 60 s, take consumes, forget drops both roles', () => {
  const b = new ProposalBook();
  b.set({ fromId: 1, fromName: 'A', toId: 2, toName: 'B' }, 1000);
  b.set({ fromId: 3, fromName: 'C', toId: 2, toName: 'B' }, 2000); // replaces
  assert.equal(b.peek(2)?.fromId, 3);
  assert.equal(b.take(2, 2000 + MARRIAGE.npcProposalMs + 1), null); // expired and consumed
  assert.equal(b.take(2, 2000), null);
  b.set({ fromId: 1, fromName: 'A', toId: 2, toName: 'B' }, 5000);
  assert.equal(b.take(2, 5000 + MARRIAGE.npcProposalMs)?.fromId, 1); // exactly at the edge is still live
  b.set({ fromId: 1, fromName: 'A', toId: 2, toName: 'B' }, 5000);
  b.forget(1);
  assert.equal(b.peek(2), undefined);
  b.set({ fromId: 1, fromName: 'A', toId: 2, toName: 'B' }, 5000);
  b.forget(2);
  assert.equal(b.peek(2), undefined);
});

test('TierPicks: valid 30 minutes, 0 when missing or expired', () => {
  const t = new TierPicks();
  assert.equal(t.get(1, 0), 0);
  t.set(1, 2, 1000);
  assert.equal(t.get(1, 1000 + MARRIAGE.tierPickMs), 2);
  assert.equal(t.get(1, 1000 + MARRIAGE.tierPickMs + 1), 0);
  t.set(1, 3, 5);
  t.forget(1);
  assert.equal(t.get(1, 6), 0);
});

test('normalizeContent trims, drops control characters and caps the length', () => {
  assert.equal(normalizeContent('  xin chào\n\tbạn '), 'xin chào  bạn');
  assert.equal(normalizeContent(42), '');
  assert.equal(normalizeContent('x'.repeat(300)).length, MARRIAGE.contentMax);
});
