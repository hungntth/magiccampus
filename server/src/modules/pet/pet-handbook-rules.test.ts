// Sach Tien Hoa bonus: activated entries add their prop (percent flag), complete series add PET_SERIE_PROP, unknown props are dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActivePetObject } from '@mc/shared';
import type { HandbookRow } from '../gamedata/pet-depth-data';
import { handbookBonuses, handbookTotals } from './pet-handbook-rules';

const entry = (id: number, classId: number, propType: number, propNum: number, percent = false): HandbookRow =>
  ({ id, classId, relateId: id, evolutionId: 0, activeNum: 1500, propType, propNum, percent });
const on = (...ids: number[]): ActivePetObject => Object.fromEntries(ids.map((id) => [String(id), { pid: id, actived: true, activedNum: 1500 }]));

// series 2: three entries (HP flat, attack %, defence flat); series 9 has no series bonus.
const entries = [entry(1, 2, 1, 100), entry(2, 2, 4, 5, true), entry(3, 2, 6, 1920), entry(4, 9, 7, 1920), entry(5, 9, 99, 50)];

test('nothing activated gives no bonus', () => {
  assert.deepEqual(handbookTotals({}, entries), []);
  assert.deepEqual(handbookBonuses({}, entries).flat, {});
});

test('activated entries add their prop; percent_flag 1 goes to the percent bucket', () => {
  const b = handbookBonuses(on(1, 2), entries);
  assert.equal(b.flat.maxHp, 100);
  assert.equal(b.pct.attack, 5);
  assert.equal(b.flat.attack, undefined);
});

test('a half-activated series gives no series bonus; a complete one adds PET_SERIE_PROP[class]', () => {
  const partial = handbookBonuses(on(1, 2), entries);
  assert.equal(partial.flat.speed, undefined);
  const full = handbookBonuses(on(1, 2, 3), entries);
  // series 2 = +1 crit (13), +600 attack (4), +240 speed (11) on top of the entries
  assert.equal(full.flat.critical, 1);
  assert.equal(full.flat.attack, 600);
  assert.equal(full.flat.speed, 240);
  assert.equal(full.flat.maxHp, 100);
  assert.equal(full.flat.defense, 1920);
});

test('props outside the Go whitelist are ignored; rate props land in rates', () => {
  const b = handbookBonuses(on(4, 5), entries);
  assert.equal(b.flat.magicDefense, 1920);
  assert.deepEqual(Object.keys(b.rates), []);
  const rates = handbookBonuses(on(6), [entry(6, 3, 32, 1), entry(7, 3, 58, 2), entry(8, 3, 31, 1)]);
  assert.deepEqual(rates.rates, { finalDebuffSuccRate: 1 });
  const all = handbookBonuses(on(6, 7, 8), [entry(6, 3, 32, 1), entry(7, 3, 58, 2), entry(8, 3, 31, 1)]);
  // series 3 is complete: its +1 debuff hit rate (32), +480 magic attack and +2400 HP stack on the entries
  assert.deepEqual(all.rates, { finalDebuffSuccRate: 2, finalDebuffResiRate: 2, finalResiCritical: 1 });
  assert.equal(all.flat.magicAttack, 480);
  assert.equal(all.flat.maxHp, 2400);
});
