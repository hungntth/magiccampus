// Tests of the generated handbook / contract tables and their lookups (client static data of the evolution windows).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PET_CONTRACT_MAX_LEVEL } from './petAdvanced.js';
import { hasFeatherTable } from './petEvolution.js';
import {
  contractBonusPercent, handbookRemaining, petContractRowOf, petHandbookByCreature, petHandbookBySeries, petHandbookEntries, petHandbookOf,
  PET_HANDBOOK_SERIES,
} from './petHandbook.js';

test('handbook rows cover the ten series and every evolved creature has a Vu Hoa table where the server has one', () => {
  assert.equal(petHandbookEntries().length, 93);
  for (const s of PET_HANDBOOK_SERIES) assert.ok(petHandbookBySeries(s).length > 0, `series ${s}`);
  for (const h of petHandbookEntries().filter((e) => e.evolutionId > 0)) {
    assert.ok(h.evolved, `entry ${h.id} has the evolved creature`);
    assert.equal(petHandbookByCreature(h.relateId)?.id, h.id);
  }
  assert.ok(hasFeatherTable(petHandbookOf(91)?.evolutionId ?? 0));
});

test('contract table has levels 1..50 and the bonus percent follows the row (hunters add the extra column)', () => {
  for (let lv = 1; lv <= PET_CONTRACT_MAX_LEVEL; lv++) assert.equal(petContractRowOf(lv)?.level, lv);
  assert.equal(contractBonusPercent(1, 0), 0);
  assert.equal(contractBonusPercent(1, 1), 0.27);
  assert.equal(contractBonusPercent(1, 1, true), 0.4);
});

test('handbook remaining energy never goes negative', () => {
  assert.equal(handbookRemaining({ activeNum: 1500 }, 1200), 300);
  assert.equal(handbookRemaining({ activeNum: 1500 }, 1600), 0);
});
