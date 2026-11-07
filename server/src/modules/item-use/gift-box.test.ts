// Unit tests for the pure parts of phase B (gift box pending state / wire payload / pick bookkeeping, the choice tables, title
// choice parsing) and phase C (the food table shape and grant arguments).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  afterPick, CHOICE_EQUIP, CHOICE_ITEM, CHOICE_PET, colorQuality, equipColorCode, newPending, pickGrant, toPayload, type GiftChoice,
} from './gift-box-plan';
import { FOOD_BUFFS, WEDDING_CANDIES, foodGrantArgs } from './tables/food-buffs';
import { ITEM_CHOICE_CHESTS, PAID_CHOICE_CHESTS } from './tables/choice-chests';
import { titleChoiceMedals } from './title-choice';

const item = (id: number, quality = 0, count = 1): GiftChoice => ({ table: CHOICE_ITEM, id, count, quality });
const label = (c: GiftChoice): { nm: string; ic: string } => ({ nm: `n${c.id}`, ic: String(c.id) });

describe('gift box pending state', () => {
  it('builds the itemMultitoSel payload with stable string indexes', () => {
    const p = newPending(77, 5710, true, [item(10, 5), { table: CHOICE_PET, id: 20, count: 1, quality: 25, growRate: 2.5 }], 1500);
    assert.deepEqual(toPayload(p, label), {
      packItemList: {
        0: { ti: 29, ii: 10, n: 1, q: 5, nm: 'n10', ic: '10' },
        1: { ti: 12, ii: 20, n: 1, q: 25, nm: 'n20', ic: '20' },
      },
      packGetNum: 1,
    });
    assert.equal(p.consumed, false);
    assert.equal(p.goldCost, 1500);
  });

  it('a pick of a one-pick box finishes (0); picks keep their original indexes', () => {
    const p = newPending(1, 2, false, [item(1), item(2), item(3)], 0, 2);
    assert.equal(afterPick(p, 1), 1); // one pick left
    assert.deepEqual([...p.choices.keys()], [0, 2]); // indexes 0 and 2 are still the originals
    assert.equal(afterPick(p, 2), 0);
    const one = newPending(1, 2, false, [item(1), item(2)]);
    assert.equal(afterPick(one, 0), 0);
  });

  it('an emptied choice list closes the box even with picks left', () => {
    const p = newPending(1, 2, false, [item(1)], 0, 3);
    assert.equal(afterPick(p, 0), 0);
  });

  it('maps picks to grants: items keep their count and bind, equipment is one piece with its colour code', () => {
    assert.deepEqual(pickGrant(item(5, 0, 3), true), { kind: 'item', table: 29, templateId: 5, qty: 3, bound: true });
    assert.deepEqual(
      pickGrant({ table: CHOICE_EQUIP, id: 9, count: 4, quality: 10, color: equipColorCode(2) }, false),
      { kind: 'item', table: 19, templateId: 9, qty: 1, bound: false, color: 3 },
    );
  });

  it('colour helpers follow Go (colour * 5, negative = 0, display colour + 1 capped at 5)', () => {
    assert.equal(colorQuality(3), 15);
    assert.equal(colorQuality(-1), 0);
    assert.equal(equipColorCode(0), 1);
    assert.equal(equipColorCode(9), 5);
  });
});

describe('choice tables', () => {
  it('paid chests offer the list of their base chest', () => {
    for (const spec of Object.values(PAID_CHOICE_CHESTS)) assert.ok(ITEM_CHOICE_CHESTS[spec.base]?.length > 0);
    assert.deepEqual(PAID_CHOICE_CHESTS[5710], { base: 4785, gold: 1500 });
    assert.deepEqual(PAID_CHOICE_CHESTS[6665], { base: 4720, gold: 2120 });
  });
  it('no chest lists a template twice', () => {
    for (const [bag, ids] of Object.entries(ITEM_CHOICE_CHESTS)) assert.equal(new Set(ids).size, ids.length, `bag ${bag}`);
  });
});

describe('titleChoiceMedals', () => {
  const desc = 'Tự chọn 1 trong những danh hiệu \r\n“Viên Ngọc Tri Thức”, \r\n“Người Tiên Phong”\r\n 3 ngày.';
  const titles = new Map([['viên ngọc tri thức', [11]], ['người tiên phong', [12]]]);
  const medals = (labelText: string): Map<number, number[]> =>
    new Map(labelText === '( 3 ngày )' ? [[11, [101]], [12, [102]]] : []);

  it('lists the medal of each title for the stated duration', () => {
    assert.deepEqual(titleChoiceMedals(desc, titles, medals), [101, 102]);
  });
  it('fails when a title is unknown, ambiguous or has no medal of that duration', () => {
    assert.equal(titleChoiceMedals(desc, new Map([['viên ngọc tri thức', [11]]]), medals), null);
    assert.equal(titleChoiceMedals(desc, new Map([['viên ngọc tri thức', [11, 13]], ['người tiên phong', [12]]]), medals), null);
    assert.equal(titleChoiceMedals(desc.replace('3 ngày', '7 ngày'), titles, medals), null);
  });
  it('ignores other descriptions', () => {
    assert.equal(titleChoiceMedals('Mở nhận 1 Túi Quà', titles, medals), null);
  });
});

describe('food table', () => {
  it('has the 84 Go entries; every entry is either timed or a 5-battle food', () => {
    assert.equal(Object.keys(FOOD_BUFFS).length, 84);
    for (const [id, f] of Object.entries(FOOD_BUFFS)) assert.ok((f.seconds ?? 0) > 0 !== (f.battles ?? 0) > 0, `food ${id}`);
  });
  it('wedding candies are 15 minute timed buffs 1183-1186', () => {
    assert.deepEqual(Object.values(WEDDING_CANDIES).map((f) => [f.buffId, f.seconds]), [[1183, 900], [1184, 900], [1185, 900], [1186, 900]]);
  });
  it('maps foods to grant arguments that add the remaining amount', () => {
    assert.deepEqual(foodGrantArgs(FOOD_BUFFS[374]), { seconds: 3600, opts: { addRemaining: true } });
    assert.deepEqual(foodGrantArgs(FOOD_BUFFS[105]), { seconds: 0, opts: { addRemaining: true, battles: 5 } });
  });
});
