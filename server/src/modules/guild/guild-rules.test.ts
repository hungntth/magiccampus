// Guild server rules: create gates (level, single wallet, name, membership), kick / appoint permissions per rank flag,
// contribution parking and restore, contribMoney args.

import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRankRows, parseRankUpdate } from '@mc/shared';
import {
  canAppoint, canKick, chooseCreateWallet, createGate, memberNote, mergeParked, parkContribution, parseContribMoney,
} from './guild-rules';

const ok = { level: 50, moneyBind: 0, money: 1_000_000, isMember: false, hasApplication: false, nameTaken: false };

test('create wallet: bound first, never summed', () => {
  assert.equal(chooseCreateWallet(1_000_000, 5_000_000), 'moneyBind');
  assert.equal(chooseCreateWallet(500_000, 1_000_000), 'money');
  assert.equal(chooseCreateWallet(600_000, 600_000), null);
});

test('create gates in order', () => {
  assert.equal(createGate(ok), null);
  assert.match(createGate({ ...ok, level: 49 }) ?? '', /cấp 50/);
  assert.match(createGate({ ...ok, money: 999_999 }) ?? '', /Bạc không đủ/);
  assert.match(createGate({ ...ok, moneyBind: 600_000, money: 600_000 }) ?? '', /Bạc không đủ/);
  assert.match(createGate({ ...ok, isMember: true }) ?? '', /đã gia nhập/);
  assert.match(createGate({ ...ok, hasApplication: true }) ?? '', /đã gia nhập/);
  assert.match(createGate({ ...ok, nameTaken: true }) ?? '', /đã tồn tại/);
});

test('kick needs canDel and a strictly lower, non-applicant target', () => {
  const rows = defaultRankRows();
  assert.equal(canKick(rows, 1, 6), true);
  assert.equal(canKick(rows, 1, 1), false);
  assert.equal(canKick(rows, 1, -1), false);
  assert.equal(canKick(rows, 2, 6), true);
  assert.equal(canKick(rows, 2, 2), false);
  assert.equal(canKick(rows, 3, 6), false); // rank 3 has no canDel by default
  const granted = parseRankUpdate({ canDel3: 1 }, rows)!;
  assert.equal(canKick(granted, 3, 6), true);
  assert.equal(canKick(granted, 3, 2), false);
  assert.equal(canKick(rows, 6, 6), false);
});

test('appoint needs canDuty, target below actor, rank not above own', () => {
  const rows = defaultRankRows();
  assert.equal(canAppoint(rows, 1, 6, 2), true);
  assert.equal(canAppoint(rows, 1, 6, 1), false);
  assert.equal(canAppoint(rows, 2, 6, 3), true);
  assert.equal(canAppoint(rows, 2, 6, 2), false);
  assert.equal(canAppoint(rows, 2, 1, 6), false);
  assert.equal(canAppoint(rows, 3, 6, 4), false); // no canDuty
  assert.equal(canAppoint(rows, 1, -1, 6), false);
});

test('contribution parking keeps 90 % and merges', () => {
  assert.deepEqual(parkContribution({ normal: 1000, donate: 55 }), { normal: 900, donate: 49 });
  assert.deepEqual(parkContribution({ normal: 0, donate: 0 }), { normal: 0, donate: 0 });
  assert.deepEqual(parkContribution({ normal: -5, donate: 9 }), { normal: 0, donate: 8 });
  assert.deepEqual(mergeParked(null, { normal: 3, donate: 4 }), { normal: 3, donate: 4 });
  assert.deepEqual(mergeParked({ normal: 1, donate: 2 }, { normal: 3, donate: 4 }), { normal: 4, donate: 6 });
});

test('contribMoney args and member note', () => {
  assert.deepEqual(parseContribMoney({ s: 8000, g: 1 }), { silver: 8000, gold: 1 });
  assert.deepEqual(parseContribMoney({ s: 0, g: 2 }), { silver: 0, gold: 2 });
  assert.equal(parseContribMoney({ s: 1500, g: 0 }), 's');
  assert.equal(parseContribMoney({ s: 0, g: 0 }), 's');
  assert.equal(parseContribMoney({ s: 1000, g: -1 }), 'g');
  assert.equal(parseContribMoney(null), 's');
  assert.equal(memberNote('Ann', 3, 120), 'Ann|3|120');
});
