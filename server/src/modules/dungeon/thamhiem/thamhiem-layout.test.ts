// Unit tests for the Thám Hiểm Di Tích rules (Go thamhiem_test.go, thamhiem_stele_order_test.go, thamhiem_lineups_test.go).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '@mc/shared';
import {
  isThRelic, parseQuizFunc, parseSteleFunc, TH, TH_FLOOR_ONE_RESET, TH_PET_IDS, TH_PETS, TH_STELE_ORDER, TH_STELES, thBrigetRelics, thNextStele,
  thObjectSpots, thQuizRight, thRevealedBy, thSceneOf, thSetIsRight, thSteleOf, thVisible, thWinPoints,
} from './thamhiem-layout';
import { TH_BOSS_HP, TH_GREEN_GEMS, TH_MINION_HP, thChestRewards, thLineup } from './thamhiem-lineups';

const ids = (list: { npc: number }[]): number[] => list.map((n) => n.npc);

test('the shared def matches the Go floors, steps and chest', () => {
  const d = DUNGEONS.find((x) => x.key === TH.KEY)!;
  assert.equal(d.enabled, true);
  assert.deepEqual(d.floors.map((f) => f.maps[0]), [582, 583, 584, 585, 586, 587, 588]);
  assert.deepEqual(d.floors[0].steps, TH_STELES.map((s) => s.npc));
  assert.deepEqual(d.floors[0].extra, [2481, 2482, 2483, 2484, 2485]);
  assert.deepEqual(d.floors[1].steps, [2488, 2490]);
  assert.deepEqual(d.floors[1].extra, [2489, 2491]);
  assert.deepEqual(d.floors[2].bosses, [TH.GUARDIAN]);
  assert.deepEqual(d.floors[4].steps, [TH.QUIZ_DONE]);
  assert.deepEqual(d.floors[5].bosses, [...TH_PET_IDS]);
  assert.deepEqual(d.floors[5].steps, [TH.BRIGET]);
  assert.deepEqual(d.floors[6].bosses, [TH.FLAME_CHIEF, TH.FLAME_DEMON]);
  assert.equal(d.floors[6].steps.length, 0);
  assert.equal(d.chest?.npc, TH.CHEST);
  assert.equal(d.rules.finishOnChest, true);
  assert.equal(d.rules.minGroup, 1);
});

test('stele elements follow the trigrams and the order is Ly, Can, Kham, Chan, Can', () => {
  const stones = Object.fromEntries(TH_STELES.map((s) => [s.npc, s.stone]));
  assert.deepEqual(stones, { 2476: 6099, 2477: 6100, 2478: 6101, 2479: 6102, 2480: 6103 });
  assert.deepEqual([...TH_STELE_ORDER], [2479, 2476, 2478, 2477, 2480]);
});

test('a set is right only in order and with the stele own stone', () => {
  const beaten: number[] = [];
  for (const npc of TH_STELE_ORDER) {
    assert.equal(thNextStele(beaten), npc);
    const own = thSteleOf(npc)!.stone;
    for (const other of TH_STELES) if (other.stone !== own) assert.equal(thSetIsRight(beaten, npc, other.stone), false);
    for (const other of TH_STELE_ORDER) if (other !== npc) assert.equal(thSetIsRight(beaten, other, own), false);
    assert.equal(thSetIsRight(beaten, npc, own), true);
    beaten.push(npc);
  }
  assert.equal(thNextStele(beaten), null);
});

test('the wrong-order reset covers the five steles and the five monsters only', () => {
  assert.deepEqual([...TH_FLOOR_ONE_RESET], [2476, 2477, 2478, 2479, 2480, 2481, 2482, 2483, 2484, 2485]);
  const beaten = [2479, 2476, 2481, TH.GUARDIAN];
  const kept = beaten.filter((id) => !TH_FLOOR_ONE_RESET.includes(id));
  assert.deepEqual(kept, [TH.GUARDIAN]);
  // after the reset the monsters show again and the first stele is Ly
  assert.equal(thVisible(582, '2026-11-05', kept).filter((n) => n.kind === 'fight').length, 5);
  assert.equal(thNextStele(kept), 2479);
});

test('visibility follows the run', () => {
  const start = thVisible(582, '2026-11-05', []);
  assert.equal(start.length, 5);
  assert.equal(start.some((n) => n.npc === 2487), false);
  const lit = ids(thVisible(582, '2026-11-05', [2481, 2476, 2477, 2478, 2479, 2480]));
  assert.equal(lit.includes(2481), false);
  assert.equal(lit.includes(2487), true);
  assert.equal(thVisible(583, '2026-11-05', [2488]).length, 3);
  const guards = thVisible(587, '2026-11-05', []);
  assert.equal(guards.length, TH_PETS.length);
  assert.equal(guards.some((n) => n.npc === 2507), false);
  assert.ok(guards.every((n) => n.nid === TH.GUARD_NID));
  const final = ids(thVisible(588, '2026-11-05', []));
  assert.deepEqual(final.sort(), [2508, 2509]);
  assert.equal(thSceneOf(TH.GUARDIAN)?.x, 1380);
});

test('Di Chi 7 needs Briget and all six spots, whichever comes last reveals it', () => {
  const pets = [...TH_PET_IDS];
  assert.equal(thRevealedBy(9225206, pets).length, 0);
  assert.equal(thVisible(587, '2026-11-05', pets).some((n) => n.npc === 2507), false);
  assert.equal(thVisible(587, '2026-11-05', [TH.BRIGET]).some((n) => n.npc === 2507), false);
  const all = [...pets, TH.BRIGET];
  assert.deepEqual(ids(thRevealedBy(9225206, all)), [2507]);
  assert.deepEqual(ids(thRevealedBy(TH.BRIGET, all)), [2507]);
  assert.equal(thVisible(587, '2026-11-05', all).length, 1);
});

test('object spots: four distinct points, stable within a day, different between days', () => {
  const a = thObjectSpots('2026-11-05');
  const b = thObjectSpots('2026-11-05');
  assert.equal(a.size, 4);
  const seen = new Set<string>();
  for (const [npc, p] of a) {
    assert.deepEqual(b.get(npc), p);
    assert.equal(seen.has(String(p)), false);
    seen.add(String(p));
  }
  let differs = false;
  for (let day = 6; day < 28 && !differs; day++) {
    for (const [npc, p] of thObjectSpots(`2026-11-${String(day).padStart(2, '0')}`)) if (String(a.get(npc)) !== String(p)) differs = true;
  }
  assert.equal(differs, true);
  const placed = thVisible(583, '2026-11-05', []);
  assert.deepEqual(placed.map((n) => [n.x, n.y]).sort(), [...a.values()].map((p) => [p[0], p[1]]).sort());
});

test('quiz and Briget counters, relic range, win points, func parsers', () => {
  assert.equal(thQuizRight([TH.QUIZ_MARK + 1, TH.QUIZ_MARK + 2]), 2);
  assert.deepEqual(thBrigetRelics([TH.BRIGET_MARK + 6105, TH.BRIGET_MARK + 6110, 6111]), [6105, 6110]);
  assert.ok(isThRelic(6105) && isThRelic(6114) && !isThRelic(6104) && !isThRelic(6115));
  assert.deepEqual([TH.GUARDIAN, 9225203, 2508, 2481].map(thWinPoints), [50, 25, 50, 0]);
  assert.deepEqual(parseSteleFunc('th_stele_2479_6102'), { stele: 2479, stone: 6102 });
  assert.equal(parseSteleFunc('th_stele_2479_6104'), null);
  assert.equal(parseSteleFunc('th_stele_9_6102'), null);
  assert.deepEqual(parseQuizFunc('th_quiz_ans_77_b'), { answerId: 77, key: 'B' });
  assert.equal(parseQuizFunc('th_quiz_ans_x_B'), null);
  assert.equal(parseQuizFunc('th_quiz_ans_5'), null);
});

test('spots field five Ve Si TM and the spot pet (guards only on 9225201)', () => {
  for (const p of TH_PETS) {
    const units = thLineup(p.id)!;
    const pets = p.creature === 0 ? 0 : 1;
    assert.equal(units.length, 5 + pets);
    assert.equal(units.filter((u) => u.creature >= 2216 && u.creature <= 2220).length, 5);
    assert.equal(units.filter((u) => u.bossFlag === 1).length, 1);
    assert.equal(units.find((u) => u.bossFlag === 1)?.creature, 2220);
    assert.ok(units.every((u) => u.hp === 0));
    if (pets) assert.equal(units.find((u) => u.creature === p.creature)?.bossFlag, 0); // boss_flag 0 = catchable
  }
});

test('final bosses field ten units: bosses 500k, minions 200k, no Rada, no shared slice', () => {
  const sets: Record<number, number[]> = { [TH.FLAME_CHIEF]: [2203, 2204, 2205, 2207, 2208], [TH.FLAME_DEMON]: [2209, 2210, 2211, 2212] };
  for (const [npc, allowed] of Object.entries(sets)) {
    const units = thLineup(Number(npc))!;
    assert.equal(units.length, 10);
    assert.deepEqual([units[0].creature, units[0].bossFlag, units[0].hp], [allowed[0], 1, TH_BOSS_HP]);
    for (const u of units.slice(1)) {
      assert.deepEqual([u.bossFlag, u.hp], [2, TH_MINION_HP]);
      assert.ok(allowed.slice(1).includes(u.creature));
    }
    assert.ok(units.every((u) => u.creature !== 2196));
  }
  assert.ok(TH_BOSS_HP > TH_MINION_HP);
  const first = thLineup(TH.FLAME_CHIEF)!;
  first[1].hp = 1;
  assert.equal(thLineup(TH.FLAME_CHIEF)![1].hp, TH_MINION_HP);
  assert.equal(thLineup(TH.GUARDIAN), null);
  assert.equal(thLineup(2481), null);
});

test('chest rewards cover the owner list on every roll', () => {
  for (let seed = 0; seed < 50; seed++) {
    let n = seed;
    const intn = (k: number): number => {
      n = (n * 31 + 7) % 1000;
      return n % k;
    };
    const got = thChestRewards(intn);
    const materials = new Set<number>();
    let currencies = 0, gems = 0, bags = 0, relics = 0;
    for (const r of got) {
      if (r.kind === 'currency') currencies++;
      else if (r.kind === 'item' && r.grade === 5) materials.add(r.id);
      else if (r.kind === 'item' && TH_GREEN_GEMS.includes(r.id)) gems++;
      else if (r.kind === 'item' && [4905, 4906, 4907].includes(r.id)) bags++;
      else if (r.kind === 'item' && isThRelic(r.id)) relics++;
      else assert.fail(`unexpected reward ${JSON.stringify(r)}`);
    }
    assert.deepEqual([currencies, materials.size, gems, bags, relics], [4, 2, 1, 1, 1]);
  }
  const first = thChestRewards(() => 0, true);
  assert.equal(first[first.length - 1].kind === 'item' && (first[first.length - 1] as { id: number }).id, TH.FIRST_CLEAR_BAG);
});
