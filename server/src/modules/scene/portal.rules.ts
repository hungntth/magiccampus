// Portal destination rules for sceneChange(gateId), ported from the legacy Go server
// (internal/application/scene/teleport.go, teleport_alias.go, teleport_landing.go). Pure: takes a narrow
// data interface so unit tests need no Mongo.

export interface GateRow {
  id: number;
  name: string;
  mapId: number;
  posX: number;
  posY: number;
  /** Paired gate instance id; 0 = unpaired. */
  from: number;
}

export interface PortalData {
  gate(id: number): GateRow | undefined;
  /** All transport gates (template type 3). */
  transportGates(): GateRow[];
  mapName(mapId: number): string | undefined;
  /** [id, name] of every map. */
  maps(): { id: number; name: string }[];
  /** Map safe point (safe_x / safe_y, legacy GetSafePoint fallback 100,100). */
  safePoint(mapId: number): { x: number; y: number };
}

export interface PortalDestination {
  mapId: number;
  x: number;
  y: number;
}

/** teleport.go: gateLandingOffset / gateLandingDistance. */
export const GATE_LANDING_OFFSET = 100;
export const GATE_LANDING_DISTANCE = 180;

/** teleport_alias.go gateNameTargets: labels that differ from their map name. */
export const GATE_NAME_TARGETS: Readonly<Record<string, number>> = {
  'Cảnh Kỹ Trường': 2000,
  'Mê Huyễn Động': 2001,
  'Mê Huyễn Động Tầng 1': 2001,
  'Mê Huyễn Động Tầng 2': 2002,
  'Lối Thoát Thần Bí': 503,
  'Lối Thoát Thần Bí 1': 503,
  'Lối Thoát Thần Bí 2': 503,
};

/** teleport_alias.go gateIDTargets: Kho Báu Đại Mạc [Sự kiện] floors (maps 600-604) by gate id. */
export const GATE_ID_TARGETS: Readonly<Record<number, number>> = {
  3536: 601, 3558: 600, 3559: 602,
  3566: 601, 3567: 603, 3568: 603, 3585: 603,
  3586: 602, 3587: 604, 3594: 603,
};

/** teleport_landing.go gateLandingPoints: fixed walkable arrival point [x, y] per gate id (overrides the formula). */
export const GATE_LANDING_POINTS: Readonly<Record<number, readonly [number, number]>> = {
  731: [1700, 660], // H5: Xuất Vân Thôn gate to Vân Đài (GATE_MAP_FIXES); the formula point 1565,690 is a wall
  743: [1598, 1392],
  748: [227, 1368],
  756: [2756, 575],
  766: [337, 1403],
  767: [2023, 1433],
  768: [2589, 1727],
  776: [172, 1373],
  791: [934, 1749],
  797: [903, 1356],
  812: [272, 1860],
  1078: [355, 1887],
  1422: [2685, 1975],
  1423: [3703, 1744],
  1425: [2149, 1768],
  1426: [1725, 1137],
  1427: [3514, 1372],
  1428: [2875, 382],
  1429: [4637, 790],
  1430: [4755, 3187],
  1431: [2893, 2658],
  1432: [1099, 3079],
  1433: [3763, 2705],
  1434: [3258, 3414],
  1435: [2631, 4182],
  1436: [4408, 4107],
  1437: [219, 3571],
  1438: [1157, 1148],
  1439: [1810, 3228],
  1440: [2788, 780],
  1441: [1480, 893],
  1442: [1784, 2018],
  1460: [2740, 123],
  1739: [2834, 229],
  1741: [135, 1461],
  1756: [2673, 150],
  1832: [1882, 115],
  1833: [1154, 1466],
  1840: [2569, 1621],
  1858: [200, 1757],
  3411: [175, 1380],
  3472: [175, 1504],
  3476: [2525, 112],
  3567: [2685, 1975],
  3568: [3703, 1744],
  3569: [3514, 1372],
  3570: [2875, 382],
  3571: [4637, 790],
  3572: [4755, 3187],
  3573: [2893, 2658],
  3574: [1099, 3079],
  3575: [3763, 2705],
  3576: [3258, 3414],
  3577: [2631, 4182],
  3578: [4408, 4107],
  3579: [219, 3571],
  3580: [1157, 1148],
  3581: [1810, 3228],
  3582: [2788, 780],
  3583: [1480, 893],
  3584: [1784, 2018],
  3587: [2149, 1768],
  3594: [1725, 1137],
};

// Go math.Round: half away from zero.
const roundAway = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

/** teleport.go landBesideGate: arrival point next to `gate` on its own map. */
export function landBesideGate(gate: GateRow, data: PortalData): PortalDestination {
  const fixed = GATE_LANDING_POINTS[gate.id];
  if (fixed) return { mapId: gate.mapId, x: fixed[0], y: fixed[1] };
  const gx = gate.posX;
  const gy = gate.posY;
  const safe = data.safePoint(gate.mapId);
  const dx = safe.x - gx;
  const dy = safe.y - gy;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) {
    return { mapId: gate.mapId, x: Math.trunc(gx) + GATE_LANDING_OFFSET, y: Math.trunc(gy) + GATE_LANDING_OFFSET };
  }
  const step = Math.min(GATE_LANDING_DISTANCE, dist);
  return { mapId: gate.mapId, x: roundAway(gx + (dx / dist) * step), y: roundAway(gy + (dy / dist) * step) };
}

/** teleport_alias.go gateTargetMap: destination map id of a gate, 0 when unknown. */
export function gateTargetMap(g: GateRow, data: PortalData): number {
  if (g.from !== 0) {
    const dest = data.gate(g.from);
    if (dest && dest.mapId > 0) return dest.mapId;
  }
  const byId = GATE_ID_TARGETS[g.id];
  if (byId !== undefined) return byId;
  const name = g.name.trim();
  const byName = Object.prototype.hasOwnProperty.call(GATE_NAME_TARGETS, name) ? GATE_NAME_TARGETS[name] : undefined;
  if (byName !== undefined) return byName;
  if (name === '') return 0;
  let best = 0;
  for (const m of data.maps()) {
    if (m.id === g.mapId || m.name.trim() !== name) continue;
    if (best === 0 || m.id < best) best = m.id;
  }
  return best;
}

/** teleport_alias.go reverseGate: lowest-id gate on `destMapId` named after (or leading to) `srcMapId`. */
function reverseGate(destMapId: number, srcMapId: number, data: PortalData): GateRow | undefined {
  const srcName = (data.mapName(srcMapId) ?? '').trim();
  let best: GateRow | undefined;
  for (const g of data.transportGates()) {
    if (g.mapId !== destMapId) continue;
    if ((srcName === '' || g.name.trim() !== srcName) && gateTargetMap(g, data) !== srcMapId) continue;
    if (!best || g.id < best.id) best = g;
  }
  return best;
}

/** teleport_alias.go twinGate: same-named gate with the lowest id on the same map (formation gate pairs). */
function twinGate(src: GateRow, data: PortalData): GateRow | undefined {
  const name = src.name.trim();
  if (name === '') return undefined;
  let best: GateRow | undefined;
  for (const g of data.transportGates()) {
    if (g.id === src.id || g.mapId !== src.mapId || g.name.trim() !== name) continue;
    if (!best || g.id < best.id) best = g;
  }
  return best;
}

/** teleport.go resolveUnpairedGate. */
function resolveUnpairedGate(src: GateRow, data: PortalData): PortalDestination | null {
  if (src.name.trim() === '') return null;
  const destMapId = gateTargetMap(src, data);
  if (destMapId <= 0) {
    const twin = twinGate(src, data);
    return twin ? landBesideGate(twin, data) : null;
  }
  const back = reverseGate(destMapId, src.mapId, data);
  if (back) return landBesideGate(back, data);
  const safe = data.safePoint(destMapId);
  return { mapId: destMapId, x: safe.x, y: safe.y };
}

/** teleport.go GetTeleportDestination: where sceneChange(gateId) puts the player; null = no destination. */
export function resolveGate(gateId: number, data: PortalData): PortalDestination | null {
  const src = data.gate(gateId);
  if (!src) return null;
  if (src.from !== 0) {
    const dest = data.gate(src.from);
    if (dest && dest.mapId > 0) return landBesideGate(dest, data);
  }
  return resolveUnpairedGate(src, data);
}
