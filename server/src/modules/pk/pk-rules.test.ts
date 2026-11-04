// Tests for the PK eligibility gate: target apvp, forced maps, safe map / area, distance, party, battle, HP.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSafeAreas, PK_NOTES } from '@mc/shared';
import { pkEligibility, type PkMapFacts, type PkSide } from './pk-rules';

const side = (cid: number, over: Partial<PkSide> = {}): PkSide => ({
  cid, mapId: 2, x: 1000, y: 1000, hp: 100, inBattle: false, partyId: null, partyLeader: true, ...over,
});
const map = (over: Partial<PkMapFacts> = {}): PkMapFacts => ({ pk: -1, safeFlag: 0, safeAreas: [], ...over });
const note = (v: ReturnType<typeof pkEligibility>): string | null => (v.ok ? null : v.note);

test('allowed: target apvp on, same map, in range', () => {
  assert.deepEqual(pkEligibility(side(1), side(2, { x: 1100 }), true, map()), { ok: true });
});

test('target apvp off is refused on a normal map, allowed on a forced PvP map (pk > 0)', () => {
  assert.equal(note(pkEligibility(side(1), side(2), false, map())), PK_NOTES.TARGET_OFF);
  assert.equal(note(pkEligibility(side(1), side(2), false, map({ pk: 0 }))), PK_NOTES.TARGET_OFF);
  assert.deepEqual(pkEligibility(side(1), side(2), false, map({ pk: 1 })), { ok: true });
  assert.deepEqual(pkEligibility(side(1), side(2), false, map({ pk: 2 })), { ok: true });
});

test('the attacker own apvp is never an input (Go parity)', () => {
  assert.deepEqual(pkEligibility(side(1), side(2), true, map()), { ok: true });
});

test('safe_flag maps refuse PK even when forced', () => {
  assert.equal(note(pkEligibility(side(1), side(2), true, map({ safeFlag: 1, pk: 1 }))), PK_NOTES.SAFE_MAP);
});

test('target inside a safe area is refused, outside is fine, even on a forced map', () => {
  const safeAreas = parseSafeAreas('400,25-1290,490|2570,1337-3423,1775');
  const inside = side(2, { x: 800, y: 300 });
  assert.equal(note(pkEligibility(side(1, { x: 800, y: 320 }), inside, true, map({ safeAreas }))), PK_NOTES.SAFE_AREA);
  assert.equal(note(pkEligibility(side(1, { x: 800, y: 320 }), inside, false, map({ safeAreas, pk: 2 }))), PK_NOTES.SAFE_AREA);
  assert.deepEqual(pkEligibility(side(1), side(2), true, map({ safeAreas })), { ok: true });
});

test('the attacker standing in a safe area does not matter, only the target position', () => {
  const safeAreas = parseSafeAreas('400,25-1290,490');
  assert.deepEqual(pkEligibility(side(1, { x: 500, y: 480 }), side(2, { x: 500, y: 550 }), true, map({ safeAreas })), { ok: true });
});

test('distance: 150 px is the limit, measured between the two positions', () => {
  assert.deepEqual(pkEligibility(side(1), side(2, { x: 1150 }), true, map()), { ok: true });
  assert.equal(note(pkEligibility(side(1), side(2, { x: 1151 }), true, map())), PK_NOTES.TOO_FAR);
  assert.equal(note(pkEligibility(side(1), side(2, { x: 1100, y: 1120 }), true, map())), PK_NOTES.TOO_FAR);
});

test('different maps are refused', () => {
  assert.equal(note(pkEligibility(side(1), side(2, { mapId: 3 }), true, map())), PK_NOTES.OTHER_MAP);
});

test('battle: either side already fighting is refused', () => {
  assert.equal(note(pkEligibility(side(1, { inBattle: true }), side(2), true, map())), PK_NOTES.IN_BATTLE);
  assert.equal(note(pkEligibility(side(1), side(2, { inBattle: true }), true, map())), PK_NOTES.TARGET_IN_BATTLE);
});

test('party: same party refused, a follower cannot attack, a follower can be attacked', () => {
  assert.equal(note(pkEligibility(side(1, { partyId: 7 }), side(2, { partyId: 7, partyLeader: false }), true, map())), PK_NOTES.SAME_PARTY);
  assert.equal(note(pkEligibility(side(1, { partyId: 7, partyLeader: false }), side(2), true, map())), PK_NOTES.FOLLOW_LEADER);
  assert.deepEqual(pkEligibility(side(1, { partyId: 7 }), side(2, { partyId: 8, partyLeader: false }), true, map()), { ok: true });
});

test('dead characters and self targets are refused', () => {
  assert.equal(note(pkEligibility(side(1, { hp: 0 }), side(2), true, map())), PK_NOTES.SELF_DEAD);
  assert.equal(note(pkEligibility(side(1), side(2, { hp: 0 }), true, map())), PK_NOTES.TARGET_DEAD);
  assert.equal(pkEligibility(side(1), side(1), true, map()).ok, false);
});
