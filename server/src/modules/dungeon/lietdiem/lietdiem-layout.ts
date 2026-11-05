// Liệt Diễm Thâm Uyên layout and rules (Go application/dungeon lietdiem_defs.go / lietdiem_state.go / lietdiem_service.go): the
// per-character instance NPCs `9014000 + kind * 100 + slot` (18 dig nodes, 10 ambush guards, 12 patrols -> Carl, 9 Cuồng Ma ->
// Mamun, 6 Phù Thủy -> Abate, portals), their visibility, the dig yield and the reveal after a win. Pure. Every point is walkable
// in the client hit mask; the 6 Phù Thủy are air units in Go and stand on walkable ground in H5 (M10 decision 15).

export const LD = {
  KEY: 'lietdiem',
  BASE: 9014000,
  CRYSTAL: 2825,
  CRYSTAL_NEED: 30,
  NODE_YIELD: 2,
  GUARD_TRIGGER: 10,
  MEDAL: 67,
  DIARY_TASK: 24,
  FLOOR_MAPS: [517, 518, 519, 520] as readonly number[],
  FLOOR_NPCS: [1560, 1568, 1570, 1580] as readonly number[],
} as const;

export const LdKind = { NODE: 1, GUARD: 2, PATROL: 3, CARL: 4, CUONG_MA: 5, MAMUN: 6, WITCH: 7, ABATE: 8, PORTAL: 9 } as const;

type Pt = readonly [number, number];

export interface LdSpawnDef {
  kind: number;
  npc: readonly number[]; // template per slot (portals) or [template]
  map: number; // 0 for portals (per slot, see LD_PORTAL_MAPS)
  floor: number;
  quest: number; // floor quest that must be active to dig / fight (0 = none)
  points: readonly Pt[];
  needs: number; // kind that must be fully beaten before this one can be fought (0 = none)
  hidden: boolean; // shown only once every `needs` instance is beaten
}

const spawn = (s: Partial<LdSpawnDef> & Pick<LdSpawnDef, 'kind' | 'npc' | 'map' | 'floor' | 'points'>): LdSpawnDef => ({ quest: 0, needs: 0, hidden: false, ...s });

const SPAWNS: readonly LdSpawnDef[] = [
  spawn({
    kind: LdKind.NODE, npc: [1561], map: 517, floor: 0, quest: 5185, points: [
      [393, 881], [3897, 265], [4753, 569], [5745, 745], [4745, 2145], [2169, 2313], [993, 1689], [1433, 1433], [3113, 609],
      [1513, 1985], [3105, 1873], [881, 1129], [2761, 385], [1817, 1281], [1185, 1825], [2605, 2105], [3673, 1001], [5225, 1401],
    ],
  }),
  spawn({
    kind: LdKind.GUARD, npc: [1562], map: 517, floor: 0, points: [
      [4193, 1329], [2200, 1057], [4009, 809], [4865, 1217], [1833, 841], [2697, 841], [1865, 2185], [3337, 2033], [2009, 2233], [4009, 1417],
    ],
  }),
  spawn({
    kind: LdKind.PATROL, npc: [1565], map: 518, floor: 1, quest: 5186, points: [
      [5745, 881], [2241, 265], [393, 745], [3969, 2313], [3938, 1057], [3025, 609], [1273, 1217], [3033, 1873], [5257, 1129], [4321, 1281],
      [4273, 2185], [913, 1401],
    ],
  }),
  spawn({ kind: LdKind.CARL, npc: [1566], map: 518, floor: 1, quest: 5186, points: [[1945, 1329]], needs: LdKind.PATROL, hidden: true }),
  spawn({
    kind: LdKind.CUONG_MA, npc: [1569], map: 519, floor: 2, quest: 5187, points: [
      [285, 1110], [750, 575], [1880, 230], [3300, 400], [4200, 900], [4150, 1525], [3165, 2010], [1725, 2125], [800, 1775],
    ],
  }),
  spawn({ kind: LdKind.MAMUN, npc: [1578], map: 519, floor: 2, quest: 5187, points: [[2000, 1250]], needs: LdKind.CUONG_MA, hidden: true }),
  // Go's air points (875,1936) … (2700,2150) are not walkable; these six are ground points (margin >= 40 px) spread over the islands.
  spawn({
    kind: LdKind.WITCH, npc: [1582], map: 520, floor: 3, quest: 5188, points: [[700, 1450], [1350, 400], [2300, 900], [2850, 400], [2400, 1650], [1900, 1900]],
  }),
  spawn({ kind: LdKind.ABATE, npc: [1581], map: 520, floor: 3, quest: 5188, points: [[2150, 262]], needs: LdKind.WITCH }),
  spawn({ kind: LdKind.PORTAL, npc: [1563, 1567, 1579], map: 0, floor: 0, points: [[1748, 476], [1430, 2120], [2690, 1110]] }),
];

export const LD_SPAWNS: ReadonlyMap<number, LdSpawnDef> = new Map(SPAWNS.map((s) => [s.kind, s]));
/** Display / iteration order (Go lietDiemKindOrder). */
export const LD_KIND_ORDER: readonly number[] = SPAWNS.map((s) => s.kind);
export const LD_PORTAL_MAPS: readonly number[] = [517, 518, 519];

export const ldInstanceId = (kind: number, slot: number): number => LD.BASE + kind * 100 + slot;
export const ldIsFight = (kind: number): boolean => kind !== LdKind.NODE && kind !== LdKind.PORTAL;

export function ldParse(instanceId: number): { sp: LdSpawnDef; slot: number } | null {
  const off = instanceId - LD.BASE;
  if (!Number.isInteger(off) || off < 100 || off >= 1000) return null;
  const sp = LD_SPAWNS.get(Math.floor(off / 100));
  const slot = off % 100;
  return sp && slot < sp.points.length ? { sp, slot } : null;
}

export const ldTemplate = (sp: LdSpawnDef, slot: number): number => (sp.kind === LdKind.PORTAL ? sp.npc[slot] : sp.npc[0]);
export const ldMapOf = (sp: LdSpawnDef, slot: number): number => (sp.kind === LdKind.PORTAL ? LD_PORTAL_MAPS[slot] : sp.map);
export const ldFloorOf = (sp: LdSpawnDef, slot: number): number => (sp.kind === LdKind.PORTAL ? slot : sp.floor);

export interface LdSpawn { id: number; kind: number; nid: number; map: number; x: number; y: number }

export function ldSpawnOf(sp: LdSpawnDef, slot: number): LdSpawn {
  const [x, y] = sp.points[slot];
  return { id: ldInstanceId(sp.kind, slot), kind: sp.kind, nid: ldTemplate(sp, slot), map: ldMapOf(sp, slot), x, y };
}

/** What a viewer's run says: instance ids dug / beaten, crystals dug so far, and which floors are cleared (portals). */
export interface LdView {
  beaten: readonly number[];
  crystals: number;
  floorsCleared: readonly boolean[];
}

export function ldCount(kind: number, beaten: readonly number[]): number {
  const sp = LD_SPAWNS.get(kind);
  if (!sp) return 0;
  return sp.points.reduce((n, _p, slot) => n + (beaten.includes(ldInstanceId(kind, slot)) ? 1 : 0), 0);
}

export const ldAll = (kind: number, beaten: readonly number[]): boolean => {
  const sp = LD_SPAWNS.get(kind);
  return !!sp && ldCount(kind, beaten) === sp.points.length;
};

export const ldGuardsOut = (crystals: number): boolean => crystals >= LD.GUARD_TRIGGER;
export const ldGuardsBlocking = (v: Pick<LdView, 'beaten' | 'crystals'>): boolean => ldGuardsOut(v.crystals) && !ldAll(LdKind.GUARD, v.beaten);

/** Go ldVisible. */
export function ldVisible(v: LdView, sp: LdSpawnDef, slot: number): boolean {
  const id = ldInstanceId(sp.kind, slot);
  if (sp.kind === LdKind.PORTAL) return slot < LD_PORTAL_MAPS.length && v.floorsCleared[slot] === true;
  if (v.beaten.includes(id)) return false;
  if (sp.kind === LdKind.GUARD) return ldGuardsOut(v.crystals);
  if (sp.hidden) return ldAll(sp.needs, v.beaten);
  return true;
}

/** Every instance the viewer sees on `mapId`, in Go order. */
export function ldViewOn(v: LdView, mapId: number): LdSpawn[] {
  const out: LdSpawn[] = [];
  for (const kind of LD_KIND_ORDER) {
    const sp = LD_SPAWNS.get(kind)!;
    sp.points.forEach((_p, slot) => {
      if (ldMapOf(sp, slot) === mapId && ldVisible(v, sp, slot)) out.push(ldSpawnOf(sp, slot));
    });
  }
  return out;
}

export interface LdWin {
  instance: number;
  kind: number;
  count: number;
  total: number;
  guardsCleared: boolean;
  revealed: LdSpawn[];
}

/** Go LietDiemRecordWin summary, `beaten` already holding the won instance. */
export function ldWinInfo(instanceId: number, beaten: readonly number[]): LdWin | null {
  const at = ldParse(instanceId);
  if (!at || !ldIsFight(at.sp.kind)) return null;
  const { sp } = at;
  const win: LdWin = {
    instance: instanceId, kind: sp.kind, count: ldCount(sp.kind, beaten), total: sp.points.length,
    guardsCleared: sp.kind === LdKind.GUARD && ldAll(LdKind.GUARD, beaten), revealed: [],
  };
  if (ldAll(sp.kind, beaten)) {
    for (const kind of LD_KIND_ORDER) {
      const other = LD_SPAWNS.get(kind)!;
      if (!other.hidden || other.needs !== sp.kind) continue;
      other.points.forEach((_p, slot) => {
        if (!beaten.includes(ldInstanceId(kind, slot))) win.revealed.push(ldSpawnOf(other, slot));
      });
    }
  }
  return win;
}

/** Crystals one dig hands out: up to NODE_YIELD, never above the quest's 30 (0 = already enough). */
export const ldDigYield = (held: number): number => Math.max(0, Math.min(LD.NODE_YIELD, LD.CRYSTAL_NEED - held));
