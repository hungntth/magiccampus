// Lục Tiên Cảnh rules (Go application/dungeon luctien.go): ids, the five floor-2 doors and their per-character, per-day colour
// (a seeded shuffle: four doors get a key colour, one has none), the random keys, the door verdict, the floor-3 judges and the
// wandering merchant's point per 10 minutes, the fake leaders of floor 5 and their upper-floor targets. Pure.

export const LT = {
  KEY: 'luctien',
  DOOR_MAP: 506,
  MAZE_MAP: 507,
  FINAL_MAP: 509,
  GUIDE_NPC: 971,
  KEY_QUEST: 3814,
  QUIZ_QUEST: 3816,
  FINAL_QUEST: 3821,
  REAL_LEADER: 984,
  SIDE_BOSS: 967,
  MERCHANT_NPC: 975,
  SHELL_ITEM: 1984,
  SHELL_NEED: 10,
  SHELL_CHANCE: 0.4,
  MASTER_KEY: 1996,
  FLOWER_ITEM: 1977,
  MERCHANT_SLOT_MS: 10 * 60_000,
} as const;

export const LT_DOORS: readonly number[] = [970, 972, 994, 995, 1038];
export const LT_KEYS: readonly number[] = [1988, 1993, 1994, 1995];
export const LT_JUDGES: readonly number[] = [973, 996, 997, 1002, 1003];
export const LT_FAKE_LEADERS: readonly number[] = [993, 999, 1000, 1001];
export const LT_UPPER_FLOORS: readonly number[] = [505, 506, 507, 508];
/** The 8 maze points of map 507 no judge stands on (Go lucTienMerchant). */
export const LT_MERCHANT_SPOTS: readonly (readonly [number, number])[] = [
  [900, 670], [180, 1320], [990, 1510], [460, 2110], [650, 2210], [2380, 1310], [3460, 2310], [2790, 1590],
];

export const isLtDoor = (npc: number): boolean => LT_DOORS.includes(npc);
export const isLtJudge = (npc: number): boolean => LT_JUDGES.includes(npc);
export const isLtFakeLeader = (npc: number): boolean => LT_FAKE_LEADERS.includes(npc);

/** FNV-1a 32-bit hash of a string. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** mulberry32: a small seeded generator (the seed fixes the shuffle, like Go's seeded PCG). */
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

/** Key colour (item id) of a floor-2 door for this character and day; 0 = the colourless door (or not a door). */
export function doorKey(characterId: number, day: string, doorNpc: number): number {
  if (!LT_DOORS.includes(doorNpc)) return 0;
  const order = [...LT_DOORS];
  const rng = seeded(fnv1a(`luctien:${characterId}:${day}`));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pos = order.indexOf(doorNpc);
  return pos >= LT_KEYS.length ? 0 : LT_KEYS[pos];
}

export function randomKey(rng: () => number): number {
  return LT_KEYS[Math.floor(rng() * LT_KEYS.length)];
}

export function fakeLeaderTarget(rng: () => number): number {
  return LT_UPPER_FLOORS[Math.floor(rng() * LT_UPPER_FLOORS.length)];
}

/** Maze point of the wandering merchant 975 at `now` (changes every 10 minutes; Go also hashed the line, H5 has one). */
export function merchantSpot(now: number): { x: number; y: number } {
  const slot = Math.floor(now / LT.MERCHANT_SLOT_MS);
  const [x, y] = LT_MERCHANT_SPOTS[fnv1a(`${slot}`) % LT_MERCHANT_SPOTS.length];
  return { x, y };
}

export type DoorVerdict = { result: 'right'; spend: number } | { result: 'wrong' };

/**
 * Go lucTienOpenDoor: the carried key of the door's colour is spent; on a coloured door the master key works too; the
 * colourless door (key 0), or no matching key, is wrong (the key is kept).
 */
export function doorVerdict(doorKeyId: number, held: (itemId: number) => boolean): DoorVerdict {
  if (doorKeyId !== 0 && held(doorKeyId)) return { result: 'right', spend: doorKeyId };
  if (doorKeyId !== 0 && held(LT.MASTER_KEY)) return { result: 'right', spend: LT.MASTER_KEY };
  return { result: 'wrong' };
}
