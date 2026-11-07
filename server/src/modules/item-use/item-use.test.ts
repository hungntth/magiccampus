// Item-use tables and pure helpers: money chest / kim phieu / mystery key / point item tables (copied from Go), the award plan, the
// registry order and the description-bag grant mapping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toItemAwardRow } from '../rewards/item-award';
import type { Grant } from '../rewards/grant.service';
import { buildAwardPlan } from './award-plan';
import { entryGrants } from './desc-bag.service';
import type { DescBagTarget } from './desc-bag/index';
import { ItemUseRegistry } from './item-use.registry';
import { KIM_PHIEU_SCROLLS, MONEY_CHESTS } from './tables/money-chest';
import { MYSTERY_KEY_PRIZES, rollMysteryKeyPrize } from './tables/mystery-key';
import { anhLinhAmount, POINT_ITEMS, rollSpirituality, SPIRITUALITY_ITEMS } from './tables/point-items';
import { RETIRED_BAGS } from './tables/retired-bags';

test('money chests: 2271 / 2272 / 2273 and Bach Ngan Le 1132 / 2520 (1063 is equipment, not listed)', () => {
  assert.deepEqual(MONEY_CHESTS, { 2271: 100_000, 2272: 1_000_000, 2273: 10_000_000, 1132: 100_000, 2520: 1_000_000 });
  assert.equal(1063 in MONEY_CHESTS, false);
});

test('kim phieu scrolls: the 13 fixed ids of Go kimPhieuScrollAmounts', () => {
  assert.equal(Object.keys(KIM_PHIEU_SCROLLS).length, 13);
  assert.deepEqual(
    Object.entries(KIM_PHIEU_SCROLLS).map(([id, n]) => [Number(id), n]),
    [[642, 100], [653, 500], [849, 500], [2693, 888], [2790, 5000], [2791, 80000], [3436, 300], [3840, 88], [3841, 188], [3842, 288],
      [3843, 588], [3844, 1888], [5341, 600]],
  );
  assert.equal(1064 in KIM_PHIEU_SCROLLS, false); // stays on its award row
});

test('mystery key: uniform over the 12 listed items', () => {
  assert.deepEqual([...MYSTERY_KEY_PRIZES], [4, 125, 158, 261, 264, 267, 9, 10, 11, 12, 13, 14]);
  assert.equal(rollMysteryKeyPrize(() => 0), 4);
  assert.equal(rollMysteryKeyPrize(() => 0.999999), 14);
  assert.equal(rollMysteryKeyPrize(() => 1), 14); // never past the end
  const seen = new Set(Array.from({ length: 12 }, (_, i) => rollMysteryKeyPrize(() => (i + 0.5) / 12)));
  assert.equal(seen.size, 12);
});

test('retired bag 5708', () => {
  assert.equal(RETIRED_BAGS.has(5708), true);
});

test('Anh Linh description pattern', () => {
  assert.equal(anhLinhAmount('Mở nhận 500 điểm Anh Linh'), 500);
  assert.equal(anhLinhAmount('Mở ra nhận được 1500 điểm Anh Linh.'), 1500);
  assert.equal(anhLinhAmount('Mở nhận 0 điểm Anh Linh'), null);
  assert.equal(anhLinhAmount('Chứa 100 điểm Anh Linh'), null);
});

test('point items and spirituality rolls', () => {
  assert.deepEqual(POINT_ITEMS[3815], { key: 'elementPnt', label: 'Nguyên Tố', amount: 10 });
  assert.equal(POINT_ITEMS[4857].amount, 15000);
  assert.equal(rollSpirituality(SPIRITUALITY_ITEMS[2336], 80, () => 0.5), 400_000);
  const perLevel = SPIRITUALITY_ITEMS[2795];
  assert.equal(rollSpirituality(perLevel, 60, () => 0), 500 * 60);
  assert.equal(rollSpirituality(perLevel, 60, () => 0.999999), 1000 * 60);
  assert.equal(rollSpirituality(perLevel, 0, () => 0), 500); // level floor 1
  const big = SPIRITUALITY_ITEMS[5903];
  assert.ok(rollSpirituality(big, 1, () => 0.3) >= 30_000_000);
  assert.deepEqual([SPIRITUALITY_ITEMS[2795].dailyCap, SPIRITUALITY_ITEMS[2796].dailyCap, SPIRITUALITY_ITEMS[2480].dailyCap], [3, 5, 0]);
});

const row = (type: number, awardId: number, count = 1, quality = 0) =>
  toItemAwardRow({ id: awardId, item_id: 1, award_id: awardId, type, count, rate: 100, quality, payload: '{}' });
const asItem = (r: { awardId: number; count: number }): Grant[] => [{ kind: 'item', table: 29, templateId: r.awardId, qty: r.count, bound: false }];

test('award plan: pets keep their quality as grow rate, titles are listed, exp decides the note, unsupported types are reported', () => {
  const plan = buildAwardPlan([row(29, 10, 2), row(12, 776, 1, 2.1), row(12, 851, 2), row(33, 41), row(31, 0, 5000), row(31, 0, 9), row(37, 3), row(32, 4)], asItem);
  assert.equal(plan.grants.length, 3); // the item row and the two exp rows (all go through the converter)
  assert.deepEqual(plan.pets, [{ templateId: 776, count: 1, growRate: 2.1 }, { templateId: 851, count: 2, growRate: 0 }]);
  assert.deepEqual(plan.titles, [41]);
  assert.equal(plan.expMessage, 5000);
  assert.deepEqual(plan.skipped.map((r) => r.type), [37, 32]);
});

test('registry: template and type handlers keep registration order; the quest chain is ordered', async () => {
  const reg = new ItemUseRegistry();
  const log: string[] = [];
  const mk = (name: string) => async (): Promise<null> => {
    log.push(name);
    return null;
  };
  reg.addTemplate([5, 6], mk('t1'));
  reg.addTemplate([5], mk('t2'));
  reg.addType([501], mk('type'));
  reg.addQuestItem(mk('q1'));
  reg.addQuestItem(mk('q2'));
  assert.equal(reg.templateHandlers(5).length, 2);
  assert.equal(reg.templateHandlers(6).length, 1);
  assert.equal(reg.templateHandlers(7).length, 0);
  assert.equal(reg.typeHandlers(501).length, 1);
  assert.equal(reg.typeHandlers(502).length, 0);
  for (const fn of reg.questItemHandlers()) await fn({} as never);
  assert.deepEqual(log, ['q1', 'q2']);
});

const target = (kind: DescBagTarget['kind'], extra: Partial<DescBagTarget> = {}): DescBagTarget => ({
  kind, id: 7, name: 'X', type: 0, color: 0, test: false, info: '', ...extra,
});

test('description bag entries map to grants: items inherit the bind, wallet and special currencies, unsupported refuse', () => {
  assert.deepEqual(entryGrants({ target: target('item'), count: 3, explicit: true }, true), [
    { kind: 'item', table: 29, templateId: 7, qty: 3, bound: true },
  ]);
  assert.deepEqual(entryGrants({ target: target('equip'), count: 1, explicit: true }, false), [
    { kind: 'item', table: 19, templateId: 7, qty: 1, bound: false },
  ]);
  assert.deepEqual(entryGrants({ target: target('basic', { key: 'gold' }), count: 50, explicit: true }, true), [{ kind: 'money', key: 'gold', amount: 50 }]);
  assert.deepEqual(entryGrants({ target: target('basic', { key: 'honor' }), count: 5, explicit: true }, true), [{ kind: 'currency', key: 'honor', amount: 5 }]);
  assert.deepEqual(entryGrants({ target: target('game', { key: 'starPnt' }), count: 5, explicit: true }, true), [{ kind: 'currency', key: 'starPnt', amount: 5 }]);
  assert.equal(entryGrants({ target: target('unsupported'), count: 5, explicit: true }, true), null);
});
