// Thế Giới Số layout and rules (Go application/dungeon thegioiso_defs.go + thegioiso_run.go): the per-viewer spawns on 578 / 580
// (8 Tiểu Q, 15 gear nodes, the two floor-1 beasts, the floor-1 portal, the two devils), their visibility from the run, the
// reveal after a win, shard / gear caps and the floor-2 maze (25 portal NPCs, 7 rooms, only Hy Vọng 2421 reaches the light).
// Pure. Every point is walkable in the client hit mask (Go "our choice" tables, kept verbatim).

export const TGS = {
  KEY: 'thegioiso',
  EXIT_MAP: 88,
  MAP1: 578,
  MAP2: 579,
  MAP3: 580,
  ELDER1: 2412,
  ELDER3: 2413,
  PORTAL: 2420,
  EXIT_LIGHT: 2441,
  MAZE_MARK: 2437,
  MAZE_HOPE: 2421,
  SUSU: 2414,
  BAOLONG: 2415,
  DEVIL_LOW: 2418,
  DEVIL_HIGH: 2419,
  TIEUQ: 2417,
  GEAR: 2442,
  CHEST_NPC: 2443,
  SHARD_QUEST: 50333,
  BEAST_QUEST: 50334,
  GEAR_QUEST: 50335,
  FINAL_QUEST: 50336,
  SHARD_ITEM: 5976,
  GEAR_ITEM: 5977,
  NEED: 30,
  SHARD_PER_WIN: 4,
  GEAR_PER_PICK: 2,
  DIARY_TASK: 41,
  SOURCE: 'thegioiso',
} as const;

const TIEUQ_BASE = 2417000;
const GEAR_BASE = 2442000;

export interface TgsSpawn {
  id: number; // scene / instance id (the template id for single spawns)
  npc: number; // template id (art / name / line-up)
  map: number;
  x: number;
  y: number;
  quest: number; // quest that must be active to fight / pick (0 = none)
  appear: number; // NPC whose defeat reveals this one (0 = always)
  boss: boolean; // credited fight of the framework (run `beaten`)
  repeat: boolean; // Tiểu Q: fought again and again, pays shards
  gather: boolean; // gear node
  portal: boolean; // floor 1 -> 2 portal, shown once floor 1 is cleared
  hideDone: number; // hidden once this quest is done today
}

const spawn = (s: Pick<TgsSpawn, 'id' | 'npc' | 'map' | 'x' | 'y'> & Partial<TgsSpawn>): TgsSpawn => ({
  quest: 0, appear: 0, boss: false, repeat: false, gather: false, portal: false, hideDone: 0, ...s,
});

type Pt = readonly [number, number];

const TIEUQ_POINTS: readonly Pt[] = [
  [640, 890], [350, 1330], [1540, 1203], [1529, 577], [1071, 1124], [681, 1433], [1811, 1042], [1996, 890],
];

const GEAR_POINTS: readonly Pt[] = [
  [1940, 1190], [498, 1772], [457, 912], [738, 542], [1561, 483], [1277, 1255], [1861, 1658], [2442, 2009],
  [2781, 1912], [1973, 624], [1483, 240], [145, 1165], [1171, 1096], [849, 596], [2220, 2046],
];

export const TGS_SPAWNS: readonly TgsSpawn[] = [
  spawn({ id: TGS.SUSU, npc: TGS.SUSU, map: TGS.MAP1, x: 2314, y: 535, quest: TGS.BEAST_QUEST, boss: true }),
  spawn({ id: TGS.BAOLONG, npc: TGS.BAOLONG, map: TGS.MAP1, x: 2179, y: 1153, quest: TGS.BEAST_QUEST, boss: true }),
  spawn({ id: TGS.PORTAL, npc: TGS.PORTAL, map: TGS.MAP1, x: 2159, y: 389, portal: true }),
  spawn({ id: TGS.DEVIL_LOW, npc: TGS.DEVIL_LOW, map: TGS.MAP3, x: 2562, y: 1356, quest: TGS.FINAL_QUEST, boss: true }),
  spawn({
    id: TGS.DEVIL_HIGH, npc: TGS.DEVIL_HIGH, map: TGS.MAP3, x: 2649, y: 869, quest: TGS.FINAL_QUEST, boss: true, appear: TGS.DEVIL_LOW,
  }),
  ...TIEUQ_POINTS.map(([x, y], i) => spawn({
    id: TIEUQ_BASE + i + 1, npc: TGS.TIEUQ, map: TGS.MAP1, x, y, quest: TGS.SHARD_QUEST, repeat: true, hideDone: TGS.SHARD_QUEST,
  })),
  ...GEAR_POINTS.map(([x, y], i) => spawn({
    id: GEAR_BASE + i + 1, npc: TGS.GEAR, map: TGS.MAP3, x, y, quest: TGS.GEAR_QUEST, gather: true, hideDone: TGS.GEAR_QUEST,
  })),
];

const BY_ID = new Map(TGS_SPAWNS.map((s) => [s.id, s]));

export const tgsSpawnOf = (id: number): TgsSpawn | undefined => BY_ID.get(id);

/** What the viewer's run says (Go TGSView without `Open`: callers pass it only for an open run). */
export interface TgsView {
  beaten: readonly number[];
  floorOne: boolean; // floor 1 cleared (both beasts beaten and 50334 done)
  questsDone: ReadonlySet<number>; // 50333 / 50335 done today
}

/** Go TheGioiSoVisible: the spawns of `mapId` the viewer sees. */
export function tgsVisible(v: TgsView, mapId: number): TgsSpawn[] {
  return TGS_SPAWNS.filter((s) => {
    if (s.map !== mapId) return false;
    if (s.portal && !v.floorOne) return false;
    if (s.boss && v.beaten.includes(s.npc)) return false;
    if (s.appear > 0 && !v.beaten.includes(s.appear)) return false;
    return !(s.hideDone > 0 && v.questsDone.has(s.hideDone));
  });
}

/** Go TheGioiSoRevealedBy: spawns that appear once `npcId` is beaten. */
export const tgsRevealedBy = (npcId: number): TgsSpawn[] => TGS_SPAWNS.filter((s) => s.appear === npcId);

/** How many items a pick / win may add: `per`, capped so the carried count never passes 30 (Go grantQuestItem). */
export const tgsGrantAmount = (held: number, per: number): number => Math.max(0, Math.min(per, TGS.NEED - held));

// --- floor 2 maze (Go "The 579 maze (our choice)") -------------------------------------------------------------------------

export const TgsRoom = { START: 'start', JUSTICE: 'justice', FAITH: 'faith', HOPE: 'hope', DARK: 'dark', JOY: 'joy', LIGHT: 'light' } as const;
export type TgsRoomId = (typeof TgsRoom)[keyof typeof TgsRoom];

/** Landing point of each room (80 px from the room's portal, walkable). */
export const TGS_ROOM_LANDING: Readonly<Record<TgsRoomId, Pt>> = {
  start: [2620, 1750], justice: [2121, 946], faith: [3254, 807], hope: [1290, 730], dark: [740, 1560], joy: [3510, 2370], light: [1498, 2331],
};

/** [room the portal stands in, portal NPC, room it leads to]: Hy Vọng 2421 is the only door into the light. */
export const TGS_PORTALS: readonly (readonly [TgsRoomId, number, TgsRoomId])[] = [
  ['start', 2434, 'faith'], ['start', 2435, 'joy'], ['start', 2436, 'justice'],
  ['justice', 2424, 'start'], ['justice', 2425, 'faith'], ['justice', 2426, 'dark'],
  ['faith', 2427, 'dark'], ['faith', 2428, 'start'], ['faith', 2429, 'joy'], ['faith', 2430, 'hope'],
  ['hope', 2421, 'light'], ['hope', 2422, 'start'], ['hope', 2447, 'dark'], ['hope', 2448, 'justice'],
  ['dark', 2431, 'start'], ['dark', 2432, 'faith'], ['dark', 2433, 'justice'],
  ['joy', 2423, 'start'], ['joy', 2438, 'faith'], ['joy', 2439, 'hope'], ['joy', 2440, 'dark'],
  ['light', 2437, 'hope'], ['light', 2449, 'start'], ['light', 2450, 'justice'],
];

export interface TgsDoor {
  x: number;
  y: number;
  room: TgsRoomId;
  success: boolean; // Hy Vọng: marks the maze solved
}

const DOORS = new Map<number, TgsDoor>(TGS_PORTALS.map(([, npc, to]) => {
  const [x, y] = TGS_ROOM_LANDING[to];
  return [npc, { x, y, room: to, success: npc === TGS.MAZE_HOPE }];
}));

/** Go TheGioiSoMaze: the target of a maze portal NPC (undefined for any other NPC, Quang Minh included). */
export const tgsMaze = (npcId: number): TgsDoor | undefined => DOORS.get(npcId);
