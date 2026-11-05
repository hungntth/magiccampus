// Tests of the pure Thien Phu rules: power rate and stat units, socket gates, inlay refusals, fuse / reset draws (with and without the
// direction talisman) on a small synthetic table shaped like data_tbl_pet_talent.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PetTalentData } from '@mc/shared';
import type { PetTalentRow } from '../gamedata/pet-depth-data';
import {
  TALENT_TEXT, fillRefusal, goldCostOf, levelMatchedPool, nextSlotRow, pickFuse, pickReroll, powerRate, sameKindAndLevel, socketGate,
  talentBonuses, validTalentSid, sameLineNext, isSocketSid,
} from './talent-rules';

const row = (r: Partial<PetTalentRow> & { id: number }): PetTalentRow => ({
  sid: 10001, lv: 0, exp: 0, upExp: 0, p: 0, propType: 0, propVal: 0, basicTid: r.id, name: '', ...r,
});

/** A stone family: lv 1..5 at ids basic .. basic + 4 on the socket-11 sid of `page`; exp / p grow with the level. */
function stones(basic: number, page: number, propType: number, grade: number): PetTalentRow[] {
  return [1, 2, 3, 4, 5].map((lv) => row({
    id: basic + lv - 1, sid: page * 10000 + 11, lv, exp: grade * lv, p: lv * 10, propType, propVal: 1000 * lv, basicTid: basic,
  }));
}
const TABLE: PetTalentRow[] = [
  ...stones(100, 1, 1, 44), ...stones(200, 1, 4, 44), ...stones(300, 1, 31, 44), ...stones(400, 2, 1, 80), ...stones(500, 2, 4, 80),
  // slot rows: sid 10001 lv 0..5, socket 10010 / 10011 lv 0..5 (exp 0)
  ...[0, 1, 2, 3, 4, 5].map((lv) => row({ id: 1000 + lv, sid: 10001, lv, propType: 1, propVal: 24000 * lv, upExp: 480 * lv })),
  ...[0, 1, 2, 3, 4, 5].map((lv) => row({ id: 1100 + lv, sid: 10011, lv, upExp: 700 + lv })),
  ...[0, 1, 2, 3, 4, 5].map((lv) => row({ id: 1200 + lv, sid: 10010, lv, upExp: 729 + lv })),
];
const byId = new Map(TABLE.map((r) => [r.id, r]));
const lookup = (id: number): PetTalentRow | undefined => byId.get(id);
const state = (over: Partial<PetTalentData> = {}): PetTalentData => ({ tal: {}, inTal: {}, b: {}, ...over });

describe('power rate and stat units', () => {
  it('steps at 100 / 200 / 400 / 700 / 850', () => {
    const at = [0, 99, 100, 199, 200, 399, 400, 699, 700, 849, 850, 5000].map(powerRate);
    assert.deepEqual(at, [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10]);
  });

  it('sums prop_val per prop, applies the rate and divides by 100', () => {
    const prop = (id: number, propType: number, propVal: number, p = 0): PetTalentRow => row({ id: 9000 + id, propType, propVal, p });
    const rows = new Map([prop(1, 1, 24000), prop(2, 1, 12000), prop(3, 59, 600, 100), prop(4, 32, 500, 0), prop(5, 58, 200, 0)].map((r) => [r.id, r]));
    const s = state({ tal: { 10001: 9001, 10002: 9002 }, inTal: { 10009: 9003, 10010: 9004, 10011: 9005 } });
    const b = talentBonuses(s, (id) => rows.get(id));
    // power 100 -> +2 %: HP floor(36000 * 1.02) / 100 = 367.2; 59 -> floor(600 * 1.02) / 100 = 6.12
    assert.equal(b.flat.maxHp, 367.2);
    assert.equal(b.rates.finalPraDef, 6.12);
    assert.equal(b.rates.finalDebuffSuccRate, 5.1);
    assert.equal(b.rates.finalDebuffResiRate, 2.04);
  });

  it('counts a stone once per socket it sits in, and the bag gives nothing', () => {
    const stone = row({ id: 9100, propType: 4, propVal: 5000, p: 450 });
    const s = state({ inTal: { 10010: 9100, 20011: 9100 }, b: { 1: { t: 9100, n: 9 } } });
    const b = talentBonuses(s, (id) => (id === 9100 ? stone : undefined));
    // power 900 -> +10 %: 2 sockets x 5000 = 10000 -> floor(11000) / 100
    assert.equal(b.flat.attack, 110);
  });

  it('ignores unknown ids and props without a mapping', () => {
    const odd = row({ id: 9200, propType: 3000, propVal: 100 });
    assert.deepEqual(talentBonuses(state({ tal: { 10001: 9200, 10002: 777 } }), (id) => (id === 9200 ? odd : undefined)).flat, {});
  });
});

describe('slots, gates and costs', () => {
  it('validates page 1..4 and slot 1..11', () => {
    for (const sid of [10001, 10011, 40009, 20010]) assert.equal(validTalentSid(sid), true, String(sid));
    for (const sid of [5, 11, 10000, 10012, 50001, -10001, 10001.5]) assert.equal(validTalentSid(sid), false, String(sid));
    assert.equal(isSocketSid(10010), true);
    assert.equal(isSocketSid(10009), false);
  });

  it('opens socket 10 at slots 1-4 >= 20 and socket 11 at slots 1-9 >= 35', () => {
    const lv = (n: number): PetTalentRow => row({ id: 7000 + n, lv: n });
    const look = (id: number): PetTalentRow | undefined => (id >= 7000 && id < 7100 ? lv(id - 7000) : undefined);
    const four = state({ tal: { 10001: 7005, 10002: 7005, 10003: 7005, 10004: 7005 } });
    assert.equal(socketGate(four, 10010, look), null);
    assert.equal(socketGate(state({ tal: { ...four.tal, 10001: 7004 } }), 10010, look), TALENT_TEXT.GATE_10);
    const nine = state({ tal: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [10000 + i, 7004])) });
    assert.equal(socketGate(nine, 10011, look), null); // 36
    assert.equal(socketGate(state({ tal: { ...nine.tal, 10009: 7000 } }), 10011, look), TALENT_TEXT.GATE_11); // 32
    assert.equal(socketGate(nine, 20011, look), TALENT_TEXT.GATE_11); // another page starts at 0
  });

  it('finds the next slot record without the stones that share a socket sid', () => {
    assert.equal(nextSlotRow(10011, 0, TABLE)?.id, 1101);
    assert.equal(nextSlotRow(10001, 4, TABLE)?.id, 1005);
    assert.equal(nextSlotRow(10001, 5, TABLE), undefined);
    assert.equal(nextSlotRow(30001, 0, TABLE), undefined);
  });

  it('prices a gold upgrade as ceil(up_exp x 0.0666666666666667)', () => {
    assert.equal(goldCostOf(729, 0.0666666666666667), 49);
    assert.equal(goldCostOf(15, 0.0666666666666667), 2); // the client shows the same float quirk
    assert.equal(goldCostOf(0, 0.0666666666666667), 0);
  });
});

describe('inlay refusals', () => {
  const opened = (socketTid: number): PetTalentData => state({ tal: { 10011: socketTid } });
  const stoneLv = (lv: number, page = 1): PetTalentRow => lookup((page === 1 ? 100 : 400) + lv - 1)!;

  it('the socket must be opened', () => {
    assert.equal(fillRefusal(state(), 10011, stoneLv(1), lookup), TALENT_TEXT.NOT_OPEN);
  });
  it('an occupied socket is refused first', () => {
    assert.equal(fillRefusal(state({ tal: { 10011: 1103 }, inTal: { 10011: 100 } }), 10011, stoneLv(1), lookup), TALENT_TEXT.OCCUPIED);
  });
  it('the stone level may not exceed the socket level', () => {
    assert.equal(fillRefusal(opened(1102), 10011, stoneLv(3), lookup), TALENT_TEXT.STONE_LV); // socket lv 2
    assert.equal(fillRefusal(opened(1102), 10011, stoneLv(2), lookup), null);
  });
  it('the stone colour may not be above the socket page', () => {
    assert.equal(fillRefusal(opened(1105), 10011, stoneLv(1, 2), lookup), TALENT_TEXT.STONE_QUALITY); // page 2 stone, page 1 socket
    assert.equal(fillRefusal(state({ tal: { 20011: 1105 } }), 20011, stoneLv(1), lookup), null); // page 1 stone fits a page 2 socket
  });
  it('a plain slot is not a socket', () => {
    assert.equal(fillRefusal(state({ tal: { 10001: 1001 } }), 10001, stoneLv(1), lookup), TALENT_TEXT.NOT_SOCKET);
  });
});

describe('fuse and reset draws', () => {
  const rng = (v: number) => (): number => v;

  it('same colour and level is required (the line may differ)', () => {
    assert.equal(sameKindAndLevel(lookup(100)!, lookup(200)!), true);
    assert.equal(sameKindAndLevel(lookup(100)!, lookup(101)!), false);
    assert.equal(sameKindAndLevel(lookup(100)!, lookup(400)!), false);
  });

  it('the level pool has one record per line of the colour grade', () => {
    assert.deepEqual(levelMatchedPool(TABLE, lookup, 2, 44).map((r) => r.id), [101, 201, 301]);
    assert.deepEqual(levelMatchedPool(TABLE, lookup, 2, 80).map((r) => r.id), [401, 501]);
    assert.deepEqual(levelMatchedPool(TABLE, lookup, 6, 44), []);
  });

  it('without the direction talisman the line is a uniform draw of the next level', () => {
    const main = lookup(100)!; // line 1, lv 1
    assert.equal(pickFuse(main, false, TABLE, lookup, rng(0))?.id, 101);
    assert.equal(pickFuse(main, false, TABLE, lookup, rng(0.5))?.id, 201);
    assert.equal(pickFuse(main, false, TABLE, lookup, rng(0.99))?.id, 301);
  });

  it('with the direction talisman the main stone keeps its line whatever the draw', () => {
    const main = lookup(200)!; // line 4, lv 1
    for (const r of [0, 0.5, 0.99]) assert.equal(pickFuse(main, true, TABLE, lookup, rng(r))?.id, 201);
    assert.equal(pickFuse(lookup(503)!, true, TABLE, lookup, rng(0))?.id, 504);
  });

  it('the same line next level exists only inside the family chain', () => {
    assert.equal(sameLineNext(lookup(104)!, lookup), null); // lv 5 has no next
    assert.equal(sameLineNext(lookup(101)!, lookup)?.id, 102);
  });

  it('reset draws a same-level stone of any line of the colour (the source line may repeat)', () => {
    const src = lookup(102)!; // lv 3
    assert.equal(pickReroll(src, TABLE, lookup, rng(0))?.id, 102);
    assert.equal(pickReroll(src, TABLE, lookup, rng(0.5))?.id, 202);
    assert.equal(pickReroll(src, TABLE, lookup, rng(0.99))?.id, 302);
    assert.equal(pickReroll(lookup(402)!, TABLE, lookup, rng(0.99))?.id, 502);
  });
});
