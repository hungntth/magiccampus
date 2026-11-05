// Liệt Diễm layout rules (Go lietdiem_test.go cases): spawn table sizes, per-character instance ids, the dig yield / ambush, the
// reveal chain (10 crystals -> guards, 12 patrols -> Carl, 9 Cuồng Ma -> Mamun, 6 Phù Thủy -> Abate) and portal visibility.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DUNGEONS } from '@mc/shared';
import {
  LD, LdKind, ldAll, ldDigYield, ldFloorOf, ldGuardsBlocking, ldInstanceId, ldMapOf, ldParse, ldViewOn, ldVisible, ldWinInfo, LD_KIND_ORDER,
  LD_SPAWNS, type LdView,
} from './lietdiem-layout';

const view = (beaten: number[] = [], crystals = 0, floorsCleared: boolean[] = [false, false, false, false]): LdView => ({ beaten, crystals, floorsCleared });
const ids = (kind: number, n: number): number[] => Array.from({ length: n }, (_v, i) => ldInstanceId(kind, i));

test('spawn table sizes, ids and floors follow the guide', () => {
  const want: Record<number, number> = {
    [LdKind.NODE]: 18, [LdKind.GUARD]: 10, [LdKind.PATROL]: 12, [LdKind.CARL]: 1, [LdKind.CUONG_MA]: 9, [LdKind.MAMUN]: 1,
    [LdKind.WITCH]: 6, [LdKind.ABATE]: 1, [LdKind.PORTAL]: 3,
  };
  const d = DUNGEONS.find((x) => x.key === LD.KEY)!;
  for (const kind of LD_KIND_ORDER) {
    const sp = LD_SPAWNS.get(kind)!;
    assert.equal(sp.points.length, want[kind], `kind ${kind}`);
    sp.points.forEach((_p, slot) => {
      const at = ldParse(ldInstanceId(kind, slot));
      assert.ok(at && at.sp === sp && at.slot === slot);
      assert.ok(d.floors[ldFloorOf(sp, slot)].maps.includes(ldMapOf(sp, slot)), `kind ${kind} slot ${slot} map`);
    });
  }
  assert.equal(ldInstanceId(LdKind.NODE, 0), 9014100);
  assert.equal(ldInstanceId(LdKind.ABATE, 0), 9014800);
  assert.equal(ldParse(LD.BASE + 150), null, 'slot past the node list');
  assert.equal(ldParse(LD.BASE + 99), null);
  assert.ok(LD_SPAWNS.get(LdKind.NODE)!.points.length * LD.NODE_YIELD >= LD.CRYSTAL_NEED);
  const mamun = LD_SPAWNS.get(LdKind.MAMUN)!;
  assert.deepEqual(mamun.points[0], [2000, 1250]);
  assert.deepEqual(LD_SPAWNS.get(LdKind.ABATE)!.points[0], [2150, 262]);
  assert.deepEqual(LD_SPAWNS.get(LdKind.PORTAL)!.npc, [1563, 1567, 1579]);
});

test('dig yield never goes above 30 crystals', () => {
  assert.equal(ldDigYield(0), 2);
  assert.equal(ldDigYield(28), 2);
  assert.equal(ldDigYield(29), 1);
  assert.equal(ldDigYield(30), 0);
  assert.equal(ldDigYield(45), 0);
});

test('guards appear at 10 crystals and block digging until all 10 are beaten', () => {
  assert.equal(ldViewOn(view(), 517).length, 18, 'floor 1 starts with the 18 nodes');
  assert.equal(ldGuardsBlocking(view([], 8)), false);
  const out = view([], 10);
  assert.equal(ldGuardsBlocking(out), true);
  assert.equal(ldViewOn(out, 517).filter((s) => s.kind === LdKind.GUARD).length, 10);
  const nine = view(ids(LdKind.GUARD, 9), 10);
  assert.equal(ldGuardsBlocking(nine), true);
  const all = view(ids(LdKind.GUARD, 10), 12);
  assert.equal(ldGuardsBlocking(all), false);
  assert.equal(ldViewOn(all, 517).filter((s) => s.kind === LdKind.GUARD).length, 0);
  const guard = LD_SPAWNS.get(LdKind.GUARD)!;
  assert.equal(ldVisible(view(), guard, 0), false);
  assert.equal(ldVisible(out, guard, 0), true);
  assert.equal(ldVisible(view([ldInstanceId(LdKind.NODE, 3)]), LD_SPAWNS.get(LdKind.NODE)!, 3), false, 'dug node hidden');
});

test('guard wins: progress and the all-cleared flag', () => {
  const beaten: number[] = [];
  for (let slot = 0; slot < 10; slot++) {
    beaten.push(ldInstanceId(LdKind.GUARD, slot));
    const win = ldWinInfo(ldInstanceId(LdKind.GUARD, slot), beaten)!;
    assert.equal(win.count, slot + 1);
    assert.equal(win.total, 10);
    assert.equal(win.guardsCleared, slot === 9);
    assert.equal(win.revealed.length, 0);
  }
  assert.equal(ldWinInfo(ldInstanceId(LdKind.NODE, 0), []), null, 'nodes are not fights');
  assert.equal(ldWinInfo(ldInstanceId(LdKind.PORTAL, 0), []), null, 'portals are not fights');
});

test('12th patrol reveals Carl on floor 2', () => {
  const carl = ldInstanceId(LdKind.CARL, 0);
  assert.equal(ldVisible(view(), LD_SPAWNS.get(LdKind.CARL)!, 0), false);
  assert.equal(ldViewOn(view(), 518).filter((s) => s.kind === LdKind.CARL).length, 0);
  for (let n = 1; n < 12; n++) assert.deepEqual(ldWinInfo(ldInstanceId(LdKind.PATROL, n - 1), ids(LdKind.PATROL, n))!.revealed, []);
  const win = ldWinInfo(ldInstanceId(LdKind.PATROL, 11), ids(LdKind.PATROL, 12))!;
  assert.equal(win.count, 12);
  assert.equal(win.revealed.length, 1);
  assert.deepEqual(win.revealed[0], { id: carl, kind: LdKind.CARL, nid: 1566, map: 518, x: 1945, y: 1329 });
  assert.equal(ldVisible(view(ids(LdKind.PATROL, 12)), LD_SPAWNS.get(LdKind.CARL)!, 0), true);
  assert.equal(ldVisible(view([...ids(LdKind.PATROL, 12), carl]), LD_SPAWNS.get(LdKind.CARL)!, 0), false, 'Carl once beaten');
});

test('9th Cuồng Ma reveals Mamun at 2000,1250', () => {
  const eight = ldWinInfo(ldInstanceId(LdKind.CUONG_MA, 7), ids(LdKind.CUONG_MA, 8))!;
  assert.deepEqual(eight.revealed, []);
  const win = ldWinInfo(ldInstanceId(LdKind.CUONG_MA, 8), ids(LdKind.CUONG_MA, 9))!;
  assert.equal(win.revealed.length, 1);
  assert.equal(win.revealed[0].nid, 1578);
  assert.equal(win.revealed[0].map, 519);
  assert.equal(win.revealed[0].x, 2000);
  assert.equal(win.revealed[0].y, 1250);
});

test('Abate is out from the start but needs the 6 Phù Thủy; they are placed on the ground of map 520', () => {
  const abate = LD_SPAWNS.get(LdKind.ABATE)!;
  assert.equal(ldVisible(view(), abate, 0), true);
  assert.equal(abate.needs, LdKind.WITCH);
  assert.equal(ldAll(LdKind.WITCH, ids(LdKind.WITCH, 5)), false);
  assert.equal(ldAll(LdKind.WITCH, ids(LdKind.WITCH, 6)), true);
  const win = ldWinInfo(ldInstanceId(LdKind.WITCH, 5), ids(LdKind.WITCH, 6))!;
  assert.equal(win.count, 6);
  assert.deepEqual(win.revealed, [], 'Abate is not hidden, so nothing is revealed');
  assert.equal(ldViewOn(view(), 520).filter((s) => s.kind === LdKind.WITCH).length, 6);
  for (const s of ldViewOn(view(), 520)) assert.ok(s.x > 0 && s.y > 0);
});

test('portals show for cleared floors only, never on the last floor', () => {
  const portal = LD_SPAWNS.get(LdKind.PORTAL)!;
  assert.equal(ldViewOn(view(), 517).filter((s) => s.kind === LdKind.PORTAL).length, 0);
  const cleared = view([], 0, [true, false, false, false]);
  const on1 = ldViewOn(cleared, 517).filter((s) => s.kind === LdKind.PORTAL);
  assert.equal(on1.length, 1);
  assert.equal(on1[0].nid, 1563);
  assert.equal(ldViewOn(cleared, 518).filter((s) => s.kind === LdKind.PORTAL).length, 0);
  assert.equal(ldVisible(view([], 0, [true, true, true, true]), portal, 2), true);
  assert.equal(ldViewOn(view([], 0, [true, true, true, true]), 520).filter((s) => s.kind === LdKind.PORTAL).length, 0);
  assert.equal(ldMapOf(portal, 1), 518);
  assert.equal(ldFloorOf(portal, 2), 2);
});
