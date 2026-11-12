// Hồn Khí state document (feature store key `deco`, legacy `deco_hole`) and its tolerant parser / wire view. Pure.
// Stored: { pos: { "1".."4": { hid, did, isShow, showLvl, s: {showId: due}, r: number[16] } } }. The parser also reads the Go shape
// ({ positions: { "1": { id, hid, did, isShow, n, showLvl, activeFlag: "{r:{},s:{1:1}}", r1..r16 } } }), so imported data keeps working.

import {
  DECO_BASE_HOLE_IDS, DECO_POSITIONS, DECO_RUNE_SLOTS, decoMaxShowLvl, decoRuneSlotOpen, type DecoHoleRow, type DecoInfo, type DecoPositionInfo,
} from '@mc/shared';

export const DECO_FEATURE_KEY = 'deco';

export interface DecoPosState {
  hid: number;
  did: number;
  isShow: 0 | 1;
  showLvl: number;
  /** Activated shows: showId -> 1 (permanent) or expiry epoch ms. */
  s: Record<string, number>;
  /** Socketed rune ids by 0-based slot (holePos - 1). */
  r: number[];
}

export interface DecoState {
  pos: Record<string, DecoPosState>;
}

const int = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const freshPosition = (position: number): DecoPosState => ({
  hid: DECO_BASE_HOLE_IDS[position - 1] ?? 0, did: 0, isShow: 0, showLvl: 1, s: {}, r: new Array<number>(DECO_RUNE_SLOTS).fill(0),
});

export const emptyDeco = (): DecoState => ({ pos: Object.fromEntries(DECO_POSITIONS.map((p) => [String(p), freshPosition(p)])) });

/** The `s:{id:due,...}` body of a Go activeFlag string ("{r:{},s:{1:1,2:99}}" or a JSON-quoted variant). */
export function parseActiveFlagString(flag: string): Record<string, number> {
  const out: Record<string, number> = {};
  const at = flag.search(/"?s"?\s*:/);
  if (at < 0) return out;
  const body = flag.slice(at);
  const open = body.indexOf('{');
  const end = body.indexOf('}');
  if (open < 0 || end < open) return out;
  for (const m of body.slice(open + 1, end).matchAll(/"?(\d+)"?\s*:\s*"?(\d+)"?/g)) {
    const id = Number(m[1]);
    if (id > 0) out[String(id)] = Number(m[2]);
  }
  return out;
}

function parseShows(v: unknown): Record<string, number> {
  if (typeof v === 'string') return parseActiveFlagString(v);
  const out: Record<string, number> = {};
  for (const [k, due] of Object.entries(obj(v))) if (int(k) > 0 && Number.isFinite(Number(due))) out[String(int(k))] = Number(due);
  return out;
}

function parseRunes(row: Record<string, unknown>): number[] {
  const r = new Array<number>(DECO_RUNE_SLOTS).fill(0);
  const stored = row.r;
  if (Array.isArray(stored)) for (let i = 0; i < DECO_RUNE_SLOTS; i++) r[i] = Math.max(0, int(stored[i]));
  else for (let i = 0; i < DECO_RUNE_SLOTS; i++) r[i] = Math.max(0, int(row[`r${i + 1}`]));
  return r;
}

export function parseDeco(raw: unknown): DecoState {
  const root = obj(raw);
  const src = obj(root.pos ?? root.positions);
  const out = emptyDeco();
  for (const p of DECO_POSITIONS) {
    const row = obj(src[String(p)]);
    if (Object.keys(row).length === 0) continue;
    const base = freshPosition(p);
    out.pos[String(p)] = {
      hid: int(row.hid) > 0 ? int(row.hid) : base.hid,
      did: Math.max(0, int(row.did)),
      isShow: int(row.isShow) === 1 ? 1 : 0,
      showLvl: Math.max(1, int(row.showLvl, 1)),
      s: parseShows(row.s ?? row.activeFlag),
      r: parseRunes(row),
    };
  }
  return out;
}

/** Hole level of a position (0 when the row is unknown). */
export const holeLevel = (p: DecoPosState, holeOf: (id: number) => DecoHoleRow | undefined): number => holeOf(p.hid)?.level ?? 0;

/** Wire view (Flash `decoInfo`): level derived, look tier clamped to what the level allows, rune slot open flags in `activeFlag.r`. */
export function decoInfoOf(state: DecoState, holeOf: (id: number) => DecoHoleRow | undefined): DecoInfo {
  const out: DecoInfo = {};
  for (const p of DECO_POSITIONS) {
    const st = state.pos[String(p)] ?? freshPosition(p);
    const level = holeLevel(st, holeOf);
    const open: Record<string, number> = {};
    for (let i = 0; i < DECO_RUNE_SLOTS; i++) open[String(i)] = decoRuneSlotOpen(level, i) ? 1 : 0;
    const view: DecoPositionInfo = {
      position: p, hid: st.hid, did: st.did, isShow: st.isShow, showLvl: Math.min(Math.max(1, st.showLvl), decoMaxShowLvl(level)), level,
      n: st.r.filter((id) => id > 0).length, r: [...st.r], activeFlag: { r: open, s: { ...st.s } },
    };
    out[String(p)] = view;
  }
  return out;
}
