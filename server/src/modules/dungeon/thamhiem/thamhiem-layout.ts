// Thám Hiểm Di Tích scene rules (Go application/dungeon thamhiem_defs.go, thamhiem_stele_order.go): ids, the five Bát Quái steles and
// the order the element stones must be set in, the floor-2 relic objects (four of eight points, shuffled by day), the per-viewer
// scene list with its reveal rules (what shows on a floor given the run's beaten list), the A Tây quiz and Briget counters and the
// explorer points table (not granted in H5, M10 decision 12). Pure; the run's `beaten` list holds NPC ids and step markers.

export const TH = {
  KEY: 'thamhiem',
  EXIT_MAP: 42,
  HOME_MAP: 9,
  F1: 582,
  OBJECT_MAP: 583,
  RELIC_MAP: 584,
  QUIZ_MAP: 586,
  BRIGET_MAP: 587,
  FINAL_MAP: 588,
  GUARDIAN: 2511,
  GUARDIAN_X: 1380,
  GUARDIAN_Y: 600,
  CHEST: 2510,
  ENVOY: 2512,
  FLAME_CHIEF: 2508,
  FLAME_DEMON: 2509,
  ATAY: 2498,
  BRIGET: 2500,
  RELIC_FIRST: 6105,
  RELIC_LAST: 6114,
  RELIC_RATE: 0.3,
  GUARD_NID: 2501,
  GUARD_NAME: 'Vệ Sĩ TM',
  QUIZ_DONE: 2498,
  ATAY_AWAKE: 92498000,
  QUIZ_MARK: 92498100,
  QUIZ_NEED: 3,
  BRIGET_MARK: 92500000,
  BRIGET_NEED: 3,
  FIRST_CLEAR_BAG: 6117,
  FLOOR_POINTS: 50,
  PET_POINTS: 25,
  BOSS_POINTS: 50,
} as const;

export interface ThStele {
  npc: number;
  stone: number;
  element: string;
}

/** Càn Kim, Chấn Mộc, Khảm Thủy, Ly Hỏa, Cấn Thổ (the Bát Quái <-> Ngũ Hành pairing). */
export const TH_STELES: readonly ThStele[] = [
  { npc: 2476, stone: 6099, element: 'Kim' },
  { npc: 2477, stone: 6100, element: 'Mộc' },
  { npc: 2478, stone: 6101, element: 'Thủy' },
  { npc: 2479, stone: 6102, element: 'Hỏa' },
  { npc: 2480, stone: 6103, element: 'Thổ' },
];

/** Quái Nguyên Tố -> the element stone its win gives the group head. */
export const TH_STONES: Readonly<Record<number, number>> = { 2481: 6099, 2482: 6100, 2483: 6101, 2484: 6102, 2485: 6103 };

/** Owner 2026-10-31: Ly Hỏa, Càn Kim, Khảm Thủy, Chấn Mộc, Cấn Thổ. */
export const TH_STELE_ORDER: readonly number[] = [2479, 2476, 2478, 2477, 2480];
/** A wrong set drops the five steles and the five Quái Nguyên Tố from every member's run. */
export const TH_FLOOR_ONE_RESET: readonly number[] = [2476, 2477, 2478, 2479, 2480, 2481, 2482, 2483, 2484, 2485];

export const TH_REAL_OBJECTS: readonly number[] = [2488, 2490];
export const TH_TRAP_OBJECTS: readonly number[] = [2489, 2491];

export type ThPoint = readonly [number, number];
/** Eight walkable points of 583 (Go ThamHiemRelicSpots); four hold the objects each day. */
export const TH_RELIC_SPOTS: readonly ThPoint[] = [
  [392, 323], [272, 682], [632, 762], [1121, 741], [1281, 602], [1231, 432], [491, 642], [900, 621],
];

export interface ThPet {
  id: number;
  creature: number; // 0 = guards only
  name: string;
  x: number;
  y: number;
}

/** The six Vệ Sĩ TM spots of floor 6 (runtime ids, drawn with the Vệ Sĩ TM template 2501). */
export const TH_PETS: readonly ThPet[] = [
  { id: 9225201, creature: 0, name: '', x: 311, y: 1280 },
  { id: 9225202, creature: 2197, name: 'Linh Trảo Thú', x: 732, y: 971 },
  { id: 9225203, creature: 2198, name: 'Hổ Hư Không', x: 1011, y: 1122 },
  { id: 9225204, creature: 2199, name: 'Lục Dị Linh Hỏa', x: 1941, y: 712 },
  { id: 9225205, creature: 2200, name: 'Gấu Đại Địa', x: 2681, y: 1162 },
  { id: 9225206, creature: 2201, name: 'Ma Linh Tử', x: 2291, y: 1720 },
];

export const TH_PET_IDS: readonly number[] = TH_PETS.map((p) => p.id);
export const TH_FINAL_BOSSES: readonly number[] = [TH.FLAME_CHIEF, TH.FLAME_DEMON];
export const isThPet = (npc: number): boolean => TH_PET_IDS.includes(npc);

export type ThKind = 'fight' | 'portal' | 'object';

export interface ThSceneNpc {
  npc: number;
  nid: number; // template id (art / name)
  kind: ThKind;
  map: number;
  x: number;
  y: number;
  appearAll: readonly number[]; // beaten ids that must all be present before it shows
}

const sc = (npc: number, kind: ThKind, map: number, x: number, y: number, appearAll: readonly number[] = [], nid = npc): ThSceneNpc =>
  ({ npc, nid, kind, map, x, y, appearAll });

/** Every per-viewer NPC (all are map-200 templates or runtime ids). 583 objects get their point from the day shuffle. */
export const TH_SCENE: readonly ThSceneNpc[] = [
  sc(2481, 'fight', 582, 870, 310), sc(2482, 'fight', 582, 530, 380), sc(2483, 'fight', 582, 230, 210),
  sc(2484, 'fight', 582, 460, 640), sc(2485, 'fight', 582, 970, 520),
  sc(2487, 'portal', 582, 1140, 850, TH_STELES.map((s) => s.npc)),
  sc(2488, 'object', TH.OBJECT_MAP, 0, 0), sc(2489, 'fight', TH.OBJECT_MAP, 0, 0),
  sc(2490, 'object', TH.OBJECT_MAP, 0, 0), sc(2491, 'fight', TH.OBJECT_MAP, 0, 0),
  sc(TH.GUARDIAN, 'fight', TH.RELIC_MAP, TH.GUARDIAN_X, TH.GUARDIAN_Y),
  sc(2496, 'portal', 585, 721, 1392),
  sc(2507, 'portal', TH.BRIGET_MAP, 1811, 1482, [TH.BRIGET, ...TH_PET_IDS]),
  ...TH_PETS.map((p) => sc(p.id, 'fight', TH.BRIGET_MAP, p.x, p.y, [], TH.GUARD_NID)),
  sc(TH.FLAME_CHIEF, 'fight', TH.FINAL_MAP, 773, 555), sc(TH.FLAME_DEMON, 'fight', TH.FINAL_MAP, 1200, 800),
];

/** Sứ Giả Tiếp Đón: shown on 588 once the viewer opened the chest. */
export const TH_ENVOY: ThSceneNpc = sc(TH.ENVOY, 'portal', TH.FINAL_MAP, 1000, 600);

export const thSceneOf = (npc: number): ThSceneNpc | undefined => TH_SCENE.find((n) => n.npc === npc);
export const thSteleOf = (npc: number): ThStele | undefined => TH_STELES.find((s) => s.npc === npc);
export const isThStone = (item: number): boolean => TH_STELES.some((s) => s.stone === item);
export const isThRelic = (item: number): boolean => item >= TH.RELIC_FIRST && item <= TH.RELIC_LAST;
export const isThRealObject = (npc: number): boolean => TH_REAL_OBJECTS.includes(npc);

/** Display name of a spot (Go npcDisplayName override): guards show as "Vệ Sĩ TM", the pet in brackets. */
export function thSpotName(npc: number): string {
  const p = TH_PETS.find((x) => x.id === npc);
  return p && p.name ? `${TH.GUARD_NAME} (${p.name})` : TH.GUARD_NAME;
}

// -- floor 1 steles --------------------------------------------------------------------------------------------------------

/** The next stele of the order not lit yet (Go ThamHiemNextStele). */
export function thNextStele(beaten: readonly number[]): number | null {
  return TH_STELE_ORDER.find((n) => !beaten.includes(n)) ?? null;
}

/** A set is right when it goes into the next stele of the order with that stele's own stone. */
export function thSetIsRight(beaten: readonly number[], steleNpc: number, stone: number): boolean {
  return thNextStele(beaten) === steleNpc && thSteleOf(steleNpc)?.stone === stone;
}

export const thLitCount = (beaten: readonly number[]): number => TH_STELES.filter((s) => beaten.includes(s.npc)).length;

// -- floor 2 relic objects -------------------------------------------------------------------------------------------------

/** FNV-1a 32-bit hash of a string. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** mulberry32: a small seeded generator (the day fixes the shuffle, like Go's seeded PCG). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Point of every floor-2 object for a day key: the same for a whole group, different between days (Go ThamHiemObjectSpots). */
export function thObjectSpots(day: string): Map<number, ThPoint> {
  const idx = TH_RELIC_SPOTS.map((_, i) => i);
  const rng = seeded(fnv1a(`thamhiem:${day}`));
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const out = new Map<number, ThPoint>();
  [...TH_REAL_OBJECTS, ...TH_TRAP_OBJECTS].forEach((npc, i) => out.set(npc, TH_RELIC_SPOTS[idx[i]]));
  return out;
}

// -- visibility ------------------------------------------------------------------------------------------------------------

const appeared = (n: ThSceneNpc, beaten: readonly number[]): boolean => n.appearAll.every((id) => beaten.includes(id));

function placed(n: ThSceneNpc, day: string): ThSceneNpc {
  if (n.map !== TH.OBJECT_MAP) return n;
  const p = thObjectSpots(day).get(n.npc);
  return p ? { ...n, x: p[0], y: p[1] } : n;
}

/** What a viewer with this run sees on a floor map: fights / objects vanish once beaten, portals stay (Go ThamHiemVisible). */
export function thVisible(mapId: number, day: string, beaten: readonly number[]): ThSceneNpc[] {
  return TH_SCENE.filter((n) => n.map === mapId && appeared(n, beaten) && (n.kind === 'portal' || !beaten.includes(n.npc))).map((n) => placed(n, day));
}

/** NPCs that appear now that `npc` is done (Go ThamHiemRevealedBy). */
export function thRevealedBy(npc: number, beaten: readonly number[]): ThSceneNpc[] {
  return TH_SCENE.filter((n) => n.appearAll.includes(npc) && appeared(n, beaten));
}

// -- A Tây quiz / Briget ---------------------------------------------------------------------------------------------------

/** Right answers recorded so far (the highest quiz mark). */
export function thQuizRight(beaten: readonly number[]): number {
  let n = 0;
  for (let i = 1; i <= TH.QUIZ_NEED; i++) if (beaten.includes(TH.QUIZ_MARK + i)) n = i;
  return n;
}

/** The different relics Briget has taken, relic id order. */
export function thBrigetRelics(beaten: readonly number[]): number[] {
  const out: number[] = [];
  for (let id = TH.RELIC_FIRST; id <= TH.RELIC_LAST; id++) if (beaten.includes(TH.BRIGET_MARK + id)) out.push(id);
  return out;
}

/** Explorer points of a win (Go ThamHiemWinPoints; the medal is not granted in H5, the number is only logged). */
export function thWinPoints(npc: number): number {
  if (npc === TH.GUARDIAN) return TH.FLOOR_POINTS;
  if (TH_FINAL_BOSSES.includes(npc)) return TH.BOSS_POINTS;
  return isThPet(npc) ? TH.PET_POINTS : 0;
}

/** "th_stele_<steleNpc>_<stone>" -> parts, null when malformed or not a stele / element stone. */
export function parseSteleFunc(func: string): { stele: number; stone: number } | null {
  if (!func.startsWith('th_stele_')) return null;
  const parts = func.slice('th_stele_'.length).split('_');
  if (parts.length !== 2) return null;
  const [stele, stone] = [Number(parts[0]), Number(parts[1])];
  return thSteleOf(stele) && isThStone(stone) ? { stele, stone } : null;
}

/** "th_quiz_ans_<answerId>_<A-D>" -> parts (letter upper-cased), null when malformed. */
export function parseQuizFunc(func: string): { answerId: number; key: string } | null {
  if (!func.startsWith('th_quiz_ans_')) return null;
  const parts = func.slice('th_quiz_ans_'.length).split('_');
  if (parts.length !== 2 || parts[0] === '') return null;
  const answerId = Number(parts[0]);
  return Number.isInteger(answerId) && answerId > 0 ? { answerId, key: parts[1].toUpperCase() } : null;
}
