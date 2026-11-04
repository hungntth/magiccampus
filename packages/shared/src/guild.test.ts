// Guild shared rules: name gate, contribution formulas, default ranks, permission lookup, rank payload parsing.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuildRank, defaultRankRows, donateContribOf, guildNameError, materialGrant, parseRankUpdate, rankCan, rankRowsToPayload,
} from './guild.js';

test('guild name: client length 2..10 and special characters', () => {
  assert.equal(guildNameError('Ab'), null);
  assert.equal(guildNameError('A'), 'Tên quá ngắn, vui lòng điền lại!');
  assert.equal(guildNameError('12345678901'), 'Tên quá dài, vui lòng điền lại!');
  assert.equal(guildNameError('a|b'), 'Chứa ký tự không hợp lệ, vui lòng điền lại!');
  assert.equal(guildNameError('Bang Hội'), null);
});

test('donate contribution is floor((silver + gold*2000)/8)', () => {
  assert.equal(donateContribOf(8000, 0), 1000);
  assert.equal(donateContribOf(1000, 0), 125);
  assert.equal(donateContribOf(0, 1), 250);
  assert.equal(donateContribOf(3000, 1), 625);
  assert.equal(donateContribOf(1, 0), 0);
});

test('material grants: common, rare, special and rejects', () => {
  assert.deepEqual(materialGrant(16, -1, 80), { guildTid: 2026, guildCount: 10, contrib: 500 });
  assert.deepEqual(materialGrant(16, 2, 8), { guildTid: 2026, guildCount: 32, contrib: 1600 });
  assert.deepEqual(materialGrant(24, 1, 8), { guildTid: 2027, guildCount: 1, contrib: 100 });
  assert.deepEqual(materialGrant(2039, 0, 7), { guildTid: 2039, guildCount: 7, contrib: 700 });
  assert.equal(materialGrant(5, 1, 1), null);
  assert.equal(materialGrant(16, 1, 0), null);
  assert.equal(materialGrant(16, 1, 1.5), null);
});

test('default ranks follow Go DefaultRankSettings', () => {
  const rows = defaultRankRows();
  assert.equal(rows.length, 6);
  assert.equal(rows[2].canDel, 0);
  assert.equal(rows[2].canAdd, 1);
  assert.equal(rows[4].canQuest, 1);
  assert.equal(rows[4].canAdd, 0);
  assert.equal(rows[5].canInfo, 0);
});

test('rankCan: leader always, applicant never, others by flag', () => {
  const rows = defaultRankRows();
  assert.equal(rankCan(rows, GuildRank.LEADER, 'canDel'), true);
  assert.equal(rankCan(rows, GuildRank.APPLICANT, 'canAdd'), false);
  assert.equal(rankCan(rows, 2, 'canDuty'), true);
  assert.equal(rankCan(rows, 3, 'canDel'), false);
  assert.equal(rankCan(rows, 3, 'canInfo'), true);
  assert.equal(rankCan(rows, 6, 'canAdd'), false);
});

test('parseRankUpdate: flat keys, rank 1 and 6 fixed, names clamped, round trip', () => {
  const rows = defaultRankRows();
  const parsed = parseRankUpdate({ name2: '  Pho  ', name3: 'x'.repeat(30), canDel3: 1, canAdd2: 0, canDuty1: 0, canAdd6: 1, name6: '' }, rows);
  assert.ok(parsed);
  assert.equal(parsed[1].name, 'Pho');
  assert.equal(parsed[1].canAdd, 0);
  assert.equal(parsed[1].canDel, 1); // untouched key keeps the current value
  assert.equal(parsed[2].name.length, 14);
  assert.equal(parsed[2].canDel, 1);
  assert.equal(parsed[0].canDuty, 1);
  assert.equal(parsed[5].canAdd, 0);
  assert.equal(parsed[5].name, 'Thành viên');
  const payload = rankRowsToPayload(parsed);
  assert.equal(payload.name2, 'Pho');
  assert.equal(payload.canDel3, 1);
  assert.deepEqual(parseRankUpdate(payload, rows), parsed);
  assert.equal(parseRankUpdate(null, rows), null);
  assert.equal(parseRankUpdate('x', rows), null);
});
