// Lang Huyệt Động scene layout (Go application/dungeon langhuyet_defs.go + handlers/npc dungeon_langhuyet_layout.go). Every
// dynamic NPC is a map-100 template shown per viewer under its own instance id (9715000 + kind × 100 + index); what a viewer sees
// follows the quest holder (the run leader): its reached quests, today's finished quests, its run marks and the in-memory party
// state (witch slots, fake spawns, wolf choices, mushroom stock). Pure; the party store is a plain class (reset on restart, as Go).

export const LH = {
  KEY: 'langhuyet',
  SOURCE: 'langhuyet',
  LEVEL: 100,
  F1: 510, F2: 511, WEST: 512, EAST: 513, F4: 514,
  SPIRIT: 952,
  Q_GUARDS: 3986, Q_PLANT: 3987, Q_CHICKEN: 3988, Q_MUSHROOM: 3989, Q_TOTEM: 3990, Q_SPLIT: 3991, Q_BOSS: 3992,
  MUSHROOM_ITEM: 2015, MUSHROOM_NEED: 30, MUSHROOM_LOAD: 4,
  PLANT_TARGET: 2001, PLANT_NEED: 20,
  TOTEM_TARGET: 1058, TOTEM_COUNT: 5,
  WITCH_REAL: 1063, WITCH_FAKE: 1064, WITCH_FAKE_START: 3, WITCH_SPAWN_CAP: 9,
  WOLF_REAL: 1065, WOLF_ILLUSION: 1066, WOLF_CHOICES: 5, WOLF_CREATURE: 683,
  ID_BASE: 9715000,
} as const;

export const LH_GUARDS: readonly number[] = [1052, 1053, 1054, 1055];
export const LH_TOTEMS: readonly number[] = [1058, 1059, 1060, 1061, 1062];

export const LhKind = { GUARD: 1, SPOT: 2, CHICKEN: 3, MUSHROOM: 4, TOTEM: 5, WITCH: 6, WOLF: 7, PORTAL: 8 } as const;

export interface LhNode {
  id: number;
  nid: number;
  kind: number;
  idx: number;
  map: number;
  x: number;
  y: number;
  name?: string;
  to?: number;
  quest: number;
}

type Pt = readonly [number, number];

const F1_POINTS: readonly Pt[] = [
  [260, 2590], [470, 2250], [740, 2130], [970, 2310], [1070, 2670], [1400, 2510], [1680, 2390], [1130, 1700],
  [580, 1790], [400, 1560], [820, 1080], [600, 940], [440, 400], [770, 730], [1130, 550], [1440, 620],
  [1530, 900], [1970, 960], [1860, 1290], [1560, 1400], [1910, 1580], [2500, 2260], [2120, 2570], [3140, 2200],
  [3640, 2560], [3430, 1910], [3750, 1640], [2760, 1180], [2690, 960], [2970, 660], [2580, 600],
];

export const LH_EAST_POINTS: readonly Pt[] = [
  [2120, 860], [2650, 1300], [2110, 1520], [1590, 1600], [1580, 1850], [820, 1750], [880, 1250], [520, 800],
  [760, 340], [1590, 450], [1230, 1750], [450, 980], [550, 1690], [1120, 1850], [1610, 1860], [1860, 1410],
  [2400, 1580], [2710, 1230], [2290, 820], [1740, 910], [420, 1000], [1140, 670], [820, 280], [1480, 350],
  [850, 790], [960, 1620], [2490, 1110], [850, 530], [1980, 950], [870, 1750], [2450, 1120],
];

const GUARD_POINTS = [21, 23, 25, 27];
const CHICKEN_POINTS = [20, 22, 24, 26, 28, 29];
const MUSHROOM_POINTS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
const TOTEM_POINTS: readonly Pt[] = [[4243, 2230], [3075, 715], [876, 466], [4178, 3505], [3901, 409]];

export const lhId = (kind: number, idx: number): number => LH.ID_BASE + kind * 100 + idx;

export function lhKindOf(id: number): { kind: number; idx: number } | null {
  const off = id - LH.ID_BASE;
  return off < 100 || off >= 900 ? null : { kind: Math.floor(off / 100), idx: off % 100 };
}

export const isLangHuyetMap = (mapId: number): boolean => mapId >= LH.F1 && mapId <= LH.F4;
export const totemsNeeded = (groupSize: number): number => Math.min(Math.max(groupSize, 1), LH.TOTEM_COUNT);

function buildNodes(): LhNode[] {
  const out: LhNode[] = [];
  const at = (p: number): Pt => F1_POINTS[p];
  GUARD_POINTS.forEach((p, i) => out.push({ id: lhId(LhKind.GUARD, i), nid: LH_GUARDS[i], kind: LhKind.GUARD, idx: i, map: LH.F1, x: at(p)[0], y: at(p)[1], quest: LH.Q_GUARDS }));
  for (let i = 0; i < LH.PLANT_NEED; i++) {
    out.push({ id: lhId(LhKind.SPOT, i), nid: 1048, kind: LhKind.SPOT, idx: i, map: LH.F1, x: at(i)[0], y: at(i)[1], name: 'Điểm Gieo Hạt', quest: LH.Q_PLANT });
  }
  CHICKEN_POINTS.forEach((p, i) => out.push({ id: lhId(LhKind.CHICKEN, i), nid: 1041, kind: LhKind.CHICKEN, idx: i, map: LH.F1, x: at(p)[0] + 60, y: at(p)[1] + 40, quest: LH.Q_CHICKEN }));
  MUSHROOM_POINTS.forEach((p, i) => out.push({ id: lhId(LhKind.MUSHROOM, i), nid: 1042, kind: LhKind.MUSHROOM, idx: i, map: LH.F1, x: at(p)[0] + 70, y: at(p)[1] + 50, quest: LH.Q_MUSHROOM }));
  TOTEM_POINTS.forEach((p, i) => out.push({ id: lhId(LhKind.TOTEM, i), nid: LH_TOTEMS[i], kind: LhKind.TOTEM, idx: i, map: LH.F2, x: p[0], y: p[1], quest: LH.Q_TOTEM }));
  const portal = (idx: number, nid: number, map: number, x: number, y: number, to: number, name?: string): LhNode =>
    ({ id: lhId(LhKind.PORTAL, idx), nid, kind: LhKind.PORTAL, idx, map, x, y, to, quest: 0, ...(name ? { name } : {}) });
  out.push(
    { id: lhId(LhKind.WOLF, 0), nid: LH.WOLF_REAL, kind: LhKind.WOLF, idx: 0, map: LH.F4, x: 1350, y: 1100, quest: LH.Q_BOSS },
    portal(0, 1070, LH.F1, 2150, 710, LH.F2),
    portal(1, 1044, LH.F2, 600, 2330, LH.WEST),
    portal(2, 1043, LH.F2, 2250, 570, LH.EAST),
    portal(3, 921, LH.WEST, 2240, 1260, LH.F2, 'Phía Tây Lang Huyệt Động Tầng 3 -> Tầng 2'),
    portal(4, 921, LH.EAST, 540, 1920, LH.F2),
    portal(5, 926, LH.F4, 1180, 1650, LH.F2),
  );
  return out;
}

export const LH_NODES: readonly LhNode[] = buildNodes();

export function lhWitchNode(slot: number, real: boolean): LhNode {
  const p = LH_EAST_POINTS[slot % LH_EAST_POINTS.length];
  return { id: lhId(LhKind.WITCH, slot), nid: real ? LH.WITCH_REAL : LH.WITCH_FAKE, kind: LhKind.WITCH, idx: slot, map: LH.EAST, x: p[0], y: p[1], quest: LH.Q_SPLIT };
}

export function lhNodeById(id: number): LhNode | undefined {
  const n = LH_NODES.find((x) => x.id === id);
  if (n) return n;
  const k = lhKindOf(id);
  return k && k.kind === LhKind.WITCH && k.idx < LH_EAST_POINTS.length ? lhWitchNode(k.idx, false) : undefined;
}

export const lhIsFight = (kind: number): boolean => kind === LhKind.GUARD || kind === LhKind.CHICKEN || kind === LhKind.TOTEM || kind === LhKind.WITCH;

/** The quest a portal waits for (done today), 0 = always open. */
export function lhOpenedBy(n: LhNode): number {
  if (n.kind !== LhKind.PORTAL) return 0;
  if (n.nid === 1070) return LH.Q_MUSHROOM;
  return n.nid === 1044 || n.nid === 1043 ? LH.Q_TOTEM : 0;
}

/** The holder's view: active / done-today quests, run marks (Run.beaten) and the party size. */
export interface LhStatus {
  active: ReadonlySet<number>;
  done: ReadonlySet<number>;
  marks: readonly number[];
  groupSize: number;
}

/** A step is reached once the quest before it is done today (3986 from the start) and stays until its own quest is done. */
export const lhReached = (st: LhStatus, q: number): boolean => !st.done.has(q) && (q === LH.Q_GUARDS || st.done.has(q - 1));

/** Go lhParty: witch slots (one real + 3 fakes; a killed fake spawns 2 more, at most 9 times), mushroom stock, wolf choices. */
export class LhParty {
  readonly order: number[];
  readonly realSlot: number;
  fakes: number[];
  next: number;
  spawns = 0;
  readonly mushroom = new Map<number, number>();
  readonly wolfReal: number;
  readonly wolfTried = new Set<number>();

  constructor(readonly day: string, intn: (n: number) => number) {
    this.order = LH_EAST_POINTS.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = intn(i + 1);
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.wolfReal = intn(LH.WOLF_CHOICES);
    this.realSlot = this.order[0];
    this.fakes = this.order.slice(1, 1 + LH.WITCH_FAKE_START);
    this.next = 1 + LH.WITCH_FAKE_START;
  }

  mushroomLeft(idx: number): number {
    return LH.MUSHROOM_LOAD - (this.mushroom.get(idx) ?? 0);
  }

  /** Removes a fake; returns the 2 slots it spawned (none once the cap is reached or the slot was not a fake). */
  killFake(slot: number): number[] {
    const i = this.fakes.indexOf(slot);
    if (i < 0) return [];
    this.fakes.splice(i, 1);
    if (this.spawns >= LH.WITCH_SPAWN_CAP) return [];
    this.spawns++;
    const added: number[] = [];
    for (let k = 0; k < 2 && this.next < this.order.length; k++) added.push(this.order[this.next++]);
    this.fakes.push(...added);
    return added;
  }

  wolfChoices(): number[] {
    return Array.from({ length: LH.WOLF_CHOICES }, (_, k) => k).filter((k) => !this.wolfTried.has(k));
  }
}

/** Go lhVisible: the dynamic NPCs of one floor map for a holder status. */
export function lhVisible(mapId: number, st: LhStatus, p: LhParty | null): LhNode[] {
  const out = LH_NODES.filter((n) => n.map === mapId && staticVisible(n, st, p));
  if (mapId === LH.EAST && lhReached(st, LH.Q_SPLIT) && !st.marks.includes(LH.WITCH_REAL) && p) {
    out.push(lhWitchNode(p.realSlot, true), ...p.fakes.map((s) => lhWitchNode(s, false)));
  }
  return out;
}

function staticVisible(n: LhNode, st: LhStatus, p: LhParty | null): boolean {
  switch (n.kind) {
    case LhKind.GUARD: return lhReached(st, n.quest) && !st.marks.includes(n.nid);
    case LhKind.SPOT: return lhReached(st, n.quest) && !st.marks.includes(n.id);
    case LhKind.CHICKEN: return lhReached(st, n.quest);
    case LhKind.MUSHROOM: return lhReached(st, n.quest) && !!p && p.mushroomLeft(n.idx) > 0;
    case LhKind.TOTEM:
      return lhReached(st, n.quest) && !st.marks.includes(n.nid) && LH_TOTEMS.filter((t) => st.marks.includes(t)).length < totemsNeeded(st.groupSize);
    case LhKind.WOLF: return lhReached(st, n.quest) && !st.marks.includes(LH.WOLF_REAL);
    case LhKind.PORTAL: {
      const q = lhOpenedBy(n);
      return q > 0 ? st.done.has(q) : true;
    }
    default: return false;
  }
}

/** Relay targets of a kill: party members that were not in the fight. */
export const lhRelayTargets = (members: readonly number[], players: readonly number[]): number[] => members.filter((m) => !players.includes(m));
