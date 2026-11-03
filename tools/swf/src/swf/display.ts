// Display list of a timeline's first frame with everything the renderer needs: matrix, color
// transform and clip depth (masks). `walkTimeline` (timeline.ts) stays the light variant for sheets.

import { CX_IDENTITY, readColorTransform, type ColorTransform } from './cxform.js';
import { IDENTITY, readMatrix, type Matrix } from './matrix.js';
import { BitReader, cstring, u16, type Tag as SwfTag } from './reader.js';
import { Tag } from './tags.js';

export interface DisplayObject {
  depth: number;
  charId: number;
  matrix: Matrix;
  cx: ColorTransform;
  /** Non-zero for a mask layer: it clips the objects at depths (depth, clipDepth]. */
  clipDepth: number;
  /** Instance name from PlaceObject2/3 (e.g. "localizer"), when given. */
  name?: string;
}

/** Number of frames (ShowFrame tags) of a timeline, at least 1. */
export function frameCountOf(tags: SwfTag[]): number {
  let n = 0;
  for (const t of tags) if (t.code === Tag.ShowFrame) n++;
  return Math.max(1, n);
}

/** Objects on stage at the first ShowFrame (or at the end when there is none), back to front. */
export function firstFrame(tags: SwfTag[]): DisplayObject[] {
  return displayAt(tags, 0);
}

/** Objects on stage after the (frame+1)-th ShowFrame (or at the end when the timeline is shorter), back to front. */
export function displayAt(tags: SwfTag[], frame: number): DisplayObject[] {
  const display = new Map<number, DisplayObject>();
  let shown = 0;
  for (const t of tags) {
    if (t.code === Tag.ShowFrame && shown++ >= frame) break;
    if (t.code === Tag.PlaceObject && t.data.length >= 4) {
      const r = new BitReader(t.data.subarray(4));
      const matrix = readMatrix(r);
      const cx = r.pos < r.b.length ? readColorTransform(r, false) : { ...CX_IDENTITY };
      const depth = u16(t.data, 2);
      display.set(depth, { depth, charId: u16(t.data, 0), matrix, cx, clipDepth: 0 });
    } else if (t.code === Tag.PlaceObject2 || t.code === Tag.PlaceObject3) {
      placeObject2(t, display);
    } else if (t.code === Tag.RemoveObject && t.data.length >= 4) {
      display.delete(u16(t.data, 2));
    } else if (t.code === Tag.RemoveObject2 && t.data.length >= 2) {
      display.delete(u16(t.data, 0));
    }
  }
  return [...display.values()].sort((a, b) => a.depth - b.depth);
}

function placeObject2(t: SwfTag, display: Map<number, DisplayObject>): void {
  const d = t.data;
  if (d.length < 3) return;
  const flags = d[0];
  let pos = 1;
  let flags2 = 0;
  if (t.code === Tag.PlaceObject3) {
    flags2 = d[1];
    pos = 2;
  }
  const depth = u16(d, pos);
  pos += 2;
  if (t.code === Tag.PlaceObject3 && flags2 & 0x08) pos += cstring(d.subarray(pos))[1];
  let charId = 0;
  if (flags & 0x02) {
    if (pos + 2 > d.length) return;
    charId = u16(d, pos);
    pos += 2;
  }
  const r = new BitReader(d.subarray(pos));
  const matrix = flags & 0x04 ? readMatrix(r) : null;
  const cx = flags & 0x08 ? readColorTransform(r, true) : null;
  if (flags & 0x10) r.pos += 2; // ratio
  let name: string | undefined;
  if (flags & 0x20) {
    const [nm, adv] = cstring(r.b.subarray(r.pos));
    name = nm;
    r.pos += adv;
  }
  const clipDepth = flags & 0x40 ? u16(r.b, r.pos) : null;

  const prev = display.get(depth);
  const move = (flags & 0x01) !== 0;
  if (move && prev) {
    if (charId !== 0) prev.charId = charId;
    if (matrix) prev.matrix = matrix;
    if (cx) prev.cx = cx;
    if (clipDepth !== null) prev.clipDepth = clipDepth;
    if (name !== undefined) prev.name = name;
    return;
  }
  if (charId === 0) return;
  display.set(depth, {
    depth,
    charId,
    matrix: matrix ?? { ...IDENTITY },
    cx: cx ?? { ...CX_IDENTITY },
    clipDepth: clipDepth ?? 0,
    name,
  });
}

/** Up-state records of a DefineButton2 (DefineButton when `v2` is false) as a display list. */
export function buttonUpState(data: Uint8Array, v2: boolean): DisplayObject[] {
  const out: DisplayObject[] = [];
  let pos = v2 ? 5 : 2;
  while (pos < data.length) {
    const flags = data[pos];
    if (flags === 0) break;
    const charId = u16(data, pos + 1);
    const depth = u16(data, pos + 3);
    const r = new BitReader(data.subarray(pos + 5));
    const matrix = readMatrix(r);
    const cx = v2 ? readColorTransform(r, true) : { ...CX_IDENTITY };
    if (v2 && flags & 0x10) skipFilters(r);
    if (v2 && flags & 0x20) r.pos++;
    pos += 5 + r.pos;
    if (flags & 0x01) out.push({ depth, charId, matrix, cx, clipDepth: 0 });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

// FILTERLIST: filters are not rendered, only skipped.
function skipFilters(r: BitReader): void {
  const b = r.b;
  const n = b[r.pos++] ?? 0;
  for (let i = 0; i < n && r.pos < b.length; i++) {
    const id = b[r.pos++];
    if (id === 0) r.pos += 23;
    else if (id === 1) r.pos += 9;
    else if (id === 2) r.pos += 15;
    else if (id === 3) r.pos += 27;
    else if (id === 4 || id === 7) r.pos += 1 + (b[r.pos] ?? 0) * 5 + 19;
    else if (id === 5) r.pos += 2 + 8 + (b[r.pos] ?? 0) * (b[r.pos + 1] ?? 0) * 4 + 5;
    else if (id === 6) r.pos += 80;
    else r.pos = b.length;
  }
}
