// Which data_tbl_npc rows are sent in createNpcs, ported from the legacy Go server: the `at` schedule
// (gamedata/models/npc_time.go IsActiveAt + npc_event_window.go) and the hidden-NPC list
// (handlers/scene/unclickable_npcs.go). Times are evaluated in ICT (UTC+7) like the original server.

const GAME_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Fixed daily hours for event tags whose `at` says "all day" (legacy eventWindowHours). */
const EVENT_WINDOW_HOURS: Record<string, readonly number[]> = {
  MushroomFruit: [6, 18],
};

// Legacy UnclickableNPCs groups: clicking does nothing on the server (decor/teleport envoys, events
// not run, field bosses without battle, old crafting nodes) or the owner asked to hide them.
const UNCLICKABLE_DECOR = [199, 1106, 1118, 1281, 1285, 1778, 2333, 2411, 2514];
const UNCLICKABLE_EVENT = [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 85, 86, 87, 1124];
const UNCLICKABLE_FIELD_BOSS = [96, 110, 111, 112];
const UNCLICKABLE_MATERIAL = [
  8, 9, 10, 11, 115, 116, 117, 187, 188, 189, 493, 576, 578, 579, 580, 581, 582, 583, 584, 585, 586,
  587, 588, 589, 590, 591, 671, 673, 674, 675, 676, 677, 678, 679, 680, 681,
];
const OWNER_HIDDEN = [1727, 1859, 2525];
// Gated by features not ported yet; legacy shows them only during their run (dongxuan: 1799 Vệ Sĩ Gia Tộc).
const FEATURE_GATED = [1799];
// Shown by their dungeon hooks at another spot: Lục Tiên 975 Khảo Quan Gian Lận wanders the maze (per-viewer instance NPC).
const DUNGEON_RELOCATED = [975];

const HIDDEN_NPC_IDS: ReadonlySet<number> = new Set([
  ...UNCLICKABLE_DECOR,
  ...UNCLICKABLE_EVENT,
  ...UNCLICKABLE_FIELD_BOSS,
  ...UNCLICKABLE_MATERIAL,
  ...OWNER_HIDDEN,
  ...FEATURE_GATED,
  ...DUNGEON_RELOCATED,
]);

export function isHiddenNpc(id: number): boolean {
  return HIDDEN_NPC_IDS.has(id);
}

/** Legacy createNpcs filter: not in the hidden list and inside its `at` schedule. */
export function isNpcVisible(id: number, at: unknown, now: Date): boolean {
  return !isHiddenNpc(id) && isNpcActiveAt(typeof at === 'string' ? at : '', now);
}

/**
 * `at` formats: "" = always; "new|Y/M/D/h/m/s-Y/M/D/h/m/s" = date range (inclusive);
 * "h0-h1|dow0-dow1|d0-d1|mon0-mon1[|event]" = every range must match (dow 0 = Sunday, month 0-based).
 * Unparseable parts count as visible, as in the Go code.
 */
export function isNpcActiveAt(at: string, now: Date): boolean {
  const tag = eventTag(at);
  const hours = EVENT_WINDOW_HOURS[tag];
  if (hours) return hours.includes(gameTime(now).getUTCHours());
  if (at === '') return true;
  if (at.startsWith('new|')) return inDateRange(at.slice(4), now);
  const parts = at.split('|');
  if (parts.length >= 4) return inSchedule(parts, now);
  return true;
}

function eventTag(at: string): string {
  if (at.startsWith('new|')) return '';
  const parts = at.split('|');
  return parts.length < 5 ? '' : parts[4].trim();
}

/** `now` shifted so its UTC fields read as ICT wall-clock time. */
function gameTime(now: Date): Date {
  return new Date(now.getTime() + GAME_TZ_OFFSET_MS);
}

function inDateRange(range: string, now: Date): boolean {
  const dash = range.indexOf('-');
  if (dash < 0) return true;
  const start = parseGameDateTime(range.slice(0, dash));
  const end = parseGameDateTime(range.slice(dash + 1));
  if (start === null || end === null) return true;
  const t = now.getTime();
  return t >= start && t <= end;
}

/** "Y/M/D/h/m/s" in ICT to epoch ms; overflowing fields roll over like Go's time.Date (2013/02/30 = Mar 2). */
function parseGameDateTime(s: string): number | null {
  const seg = s.trim().split('/');
  if (seg.length !== 6) return null;
  const n = seg.map(atoi);
  if (n.some((v) => v === null)) return null;
  const [y, mo, d, h, mi, se] = n as number[];
  return Date.UTC(y, mo - 1, d, h, mi, se) - GAME_TZ_OFFSET_MS;
}

function inSchedule(parts: string[], now: Date): boolean {
  const t = gameTime(now);
  return (
    inRange(parts[0], t.getUTCHours()) &&
    inRange(parts[1], t.getUTCDay()) &&
    inRange(parts[2], t.getUTCDate()) &&
    inRange(parts[3], t.getUTCMonth())
  );
}

function inRange(range: string, value: number): boolean {
  const s = range.trim();
  const dash = s.indexOf('-');
  if (dash < 0) return true;
  const start = atoi(s.slice(0, dash));
  const end = atoi(s.slice(dash + 1));
  if (start === null || end === null) return true;
  return value >= start && value <= end;
}

/** Go strconv.Atoi on a trimmed string: an optional sign and digits only. */
function atoi(s: string): number | null {
  const t = s.trim();
  return /^[+-]?\d+$/.test(t) ? Number(t) : null;
}
