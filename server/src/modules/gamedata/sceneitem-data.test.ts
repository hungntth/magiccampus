// Unit tests for buildSceneItemTables: the gate map fix of seed rows sitting on a missing map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGate, type PortalData } from '../scene/portal.rules';
import { buildSceneItemTables } from './sceneitem-data';

const templates = [{ id: 38, type: 3, res_code: 1 }];
const instances = [
  { id: 731, name: 'Vân Đài', pos_map_id: 200, pos_x: 1723, pos_y: 604, from: 0, tid: 38 },
  { id: 757, name: 'Xuất Vân Thôn', pos_map_id: 3, pos_x: 53, pos_y: 1094, from: 0, tid: 38 },
];
const maps = [
  { id: 1, name: 'Xuất Vân Thôn', safe: { x: 1000, y: 1000 } },
  { id: 3, name: 'Vân Đài', safe: { x: 1000, y: 1000 } },
];

test('gate 731 (seed map 200) is moved onto Xuất Vân Thôn and pairs with Vân Đài gate 757 both ways', () => {
  const t = buildSceneItemTables(instances, templates);
  assert.equal(t.byId.get(731)?.mapId, 1);
  assert.deepEqual(t.byMap.get(1)?.map((g) => g.id), [731]);
  const data: PortalData = {
    gate: (id) => t.byId.get(id),
    transportGates: () => t.gates,
    mapName: (id) => maps.find((m) => m.id === id)?.name,
    maps: () => maps.map((m) => ({ id: m.id, name: m.name })),
    safePoint: (id) => maps.find((m) => m.id === id)?.safe ?? { x: 100, y: 100 },
  };
  // Vân Đài -> Xuất Vân Thôn: the fixed walkable point beside gate 731, not the map safe point.
  assert.deepEqual(resolveGate(757, data), { mapId: 1, x: 1700, y: 660 });
  // Xuất Vân Thôn -> Vân Đài: beside gate 757.
  const toVanDai = resolveGate(731, data)!;
  assert.equal(toVanDai.mapId, 3);
  assert.ok(Math.hypot(toVanDai.x - 53, toVanDai.y - 1094) <= 181);
});
