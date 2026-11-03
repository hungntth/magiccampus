// Unit tests for portal.rules: paired gates, alias tables, unpaired name resolve, landing formula and override table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATE_LANDING_POINTS, landBesideGate, resolveGate, type GateRow, type PortalData } from './portal.rules';

const maps = [
  { id: 1, name: 'Xuất Vân Thôn', safe: { x: 100, y: 100 } },
  { id: 2, name: 'Đông Xuất Vân', safe: { x: 400, y: 300 } },
  { id: 3, name: 'Thiện Tĩnh Địa', safe: { x: 200, y: 200 } },
  { id: 4, name: 'Vân Đài', safe: { x: 600, y: 700 } },
  { id: 5, name: 'Trống', safe: { x: 100, y: 100 } },
  { id: 6, name: 'Hẻm', safe: { x: 33, y: 44 } },
  { id: 9, name: 'Trùng Tên', safe: { x: 10, y: 10 } },
  { id: 8, name: 'Trùng Tên', safe: { x: 20, y: 20 } },
  { id: 501, name: 'Kho Báu', safe: { x: 50, y: 50 } },
];

const g = (id: number, mapId: number, name: string, posX: number, posY: number, from = 0): GateRow =>
  ({ id, mapId, name, posX, posY, from });

const gates: GateRow[] = [
  g(732, 1, 'Đông Xuất Vân', 1649, 1306, 733),
  g(733, 2, 'Xuất Vân Thôn', 120, 63, 732),
  g(758, 3, 'Thiện Tĩnh Địa', 100, 100, 812),
  g(812, 4, 'Vân Đài', 5, 5, 758),
  g(757, 3, 'Xuất Vân Thôn', 900, 900),
  g(740, 1, 'Thiện Tĩnh Địa', 1000, 1000), // reverse gate of map 3 on map 1
  g(900, 3, 'Hẻm', 300, 300), // unpaired, map 6 has no gate back
  g(901, 4, 'Trùng Tên', 1, 1),
  g(910, 1, 'Cảnh Kỹ Trường', 10, 10),
  g(911, 5, 'Trống', 300, 300, 912), // paired to a gate sitting on the safe point of map 5
  g(912, 5, 'Trống', 100, 100, 911),
  g(1427, 501, 'Quang Linh Trận', 1, 1),
  g(1428, 501, 'Quang Linh Trận', 2, 2),
  g(920, 1, 'Không Có Nơi Này', 1, 1),
  g(921, 1, '   ', 1, 1),
  g(3536, 1, 'Xuất Vân Thôn', 1, 1),
];

const data: PortalData = {
  gate: (id) => gates.find((x) => x.id === id),
  transportGates: () => [...gates].sort((a, b) => a.id - b.id),
  mapName: (id) => maps.find((m) => m.id === id)?.name,
  maps: () => maps.map((m) => ({ id: m.id, name: m.name })),
  safePoint: (id) => maps.find((m) => m.id === id)?.safe ?? { x: 100, y: 100 },
};

test('paired gate 732 lands beside gate 733 on map 2, 180 px toward the safe point', () => {
  // gate (120,63), safe (400,300): d = 366.8 > 180 -> step 180
  assert.deepEqual(resolveGate(732, data), { mapId: 2, x: 257, y: 179 });
});

test('paired gate 733 lands beside gate 732 on map 1', () => {
  assert.deepEqual(resolveGate(733, data), { mapId: 1, x: 1507, y: 1195 });
});

test('gate 758 -> gate 812 on map 4 uses the fixed landing table', () => {
  assert.deepEqual(GATE_LANDING_POINTS[812], [272, 1860]);
  assert.deepEqual(resolveGate(758, data), { mapId: 4, x: 272, y: 1860 });
});

test('unpaired gate 757 resolves its name to map 1 and lands beside the gate back to map 3', () => {
  // reverse gate on map 1 named after map 3 is 740 (1000,1000); safe (100,100) -> 180 px toward it
  const dest = resolveGate(757, data)!;
  assert.equal(dest.mapId, 1);
  assert.deepEqual(dest, landBesideGate(gates.find((x) => x.id === 740)!, data));
});

test('unpaired gate without a reverse gate lands at the destination safe point', () => {
  assert.deepEqual(resolveGate(900, data), { mapId: 6, x: 33, y: 44 });
});

test('same-name maps: lowest id wins, the gate own map is excluded', () => {
  assert.deepEqual(resolveGate(901, data), { mapId: 8, x: 20, y: 20 });
});

test('gateNameTargets alias and gateIDTargets alias', () => {
  // map 2000 is not in the fixture: the alias still resolves it, the safe point falls back to 100,100
  assert.deepEqual(resolveGate(910, data), { mapId: 2000, x: 100, y: 100 });
  const withMap2000: PortalData = { ...data, safePoint: () => ({ x: 7, y: 8 }) };
  assert.deepEqual(resolveGate(910, withMap2000), { mapId: 2000, x: 7, y: 8 });
  assert.deepEqual(resolveGate(3536, withMap2000), { mapId: 601, x: 7, y: 8 });
});

test('landing distance below 1 px uses the +100/+100 offset', () => {
  // gate 911 -> paired gate 912 at the safe point of map 5 (100,100)
  assert.deepEqual(resolveGate(911, data), { mapId: 5, x: 200, y: 200 });
});

test('landing step is capped by the distance to the safe point', () => {
  const near = g(1, 1, 'x', 50, 50);
  assert.deepEqual(landBesideGate(near, { ...data, safePoint: () => ({ x: 60, y: 50 }) }), { mapId: 1, x: 60, y: 50 });
});

test('twin gate: no map target lands beside the same-named gate on the same map', () => {
  // 1428 has no target map; twin 1427 has a fixed landing point
  assert.deepEqual(resolveGate(1428, data), { mapId: 501, x: GATE_LANDING_POINTS[1427][0], y: GATE_LANDING_POINTS[1427][1] });
});

test('unknown gate, unknown destination and blank name give null', () => {
  assert.equal(resolveGate(999999, data), null);
  assert.equal(resolveGate(920, data), null);
  assert.equal(resolveGate(921, data), null);
});

test('landing table is the full ported Go table (62 gates)', () => {
  assert.equal(Object.keys(GATE_LANDING_POINTS).length, 62);
});
