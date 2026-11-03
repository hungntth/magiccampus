// Walks a timeline (main or sprite) and snapshots the display list at every ShowFrame,
// carrying frame labels so animations can be sliced into label segments.

import { IDENTITY, readMatrix, type Matrix } from './matrix.js';
import { BitReader, cstring, u16, type Tag as SwfTag } from './reader.js';
import { Tag } from './tags.js';

export interface Placed {
  depth: number;
  charId: number;
  matrix: Matrix;
}

export interface Frame {
  index: number;
  label: string;
  objects: Placed[];
}

export interface Timeline {
  frames: Frame[];
}

export function walkTimeline(tags: SwfTag[]): Timeline {
  const tl: Timeline = { frames: [] };
  const display = new Map<number, Placed>();
  let label = '';
  for (const t of tags) {
    switch (t.code) {
      case Tag.FrameLabel:
        [label] = cstring(t.data);
        break;
      case Tag.PlaceObject: {
        if (t.data.length < 4) break;
        const depth = u16(t.data, 2);
        display.set(depth, { depth, charId: u16(t.data, 0), matrix: readMatrix(new BitReader(t.data.subarray(4))) });
        break;
      }
      case Tag.PlaceObject2:
      case Tag.PlaceObject3: {
        const p = parsePlace(t);
        if (!p) break;
        const prev = display.get(p.depth);
        if (p.charId === 0 && prev) p.charId = prev.charId;
        if (!p.hasMatrix && prev) p.matrix = prev.matrix;
        if (p.charId !== 0) display.set(p.depth, { depth: p.depth, charId: p.charId, matrix: p.matrix });
        break;
      }
      case Tag.RemoveObject:
        if (t.data.length >= 4) display.delete(u16(t.data, 2));
        break;
      case Tag.RemoveObject2:
        if (t.data.length >= 2) display.delete(u16(t.data, 0));
        break;
      case Tag.ShowFrame: {
        const objects = [...display.values()].sort((a, b) => a.depth - b.depth);
        tl.frames.push({ index: tl.frames.length, label, objects });
        label = '';
        break;
      }
    }
  }
  return tl;
}

interface PlaceParsed {
  depth: number;
  charId: number;
  matrix: Matrix;
  hasMatrix: boolean;
}

function parsePlace(t: SwfTag): PlaceParsed | null {
  const d = t.data;
  if (d.length < 3) return null;
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
    if (pos + 2 > d.length) return null;
    charId = u16(d, pos);
    pos += 2;
  }
  if (flags & 0x04) {
    return { depth, charId, matrix: readMatrix(new BitReader(d.subarray(pos))), hasMatrix: true };
  }
  return { depth, charId, matrix: IDENTITY, hasMatrix: false };
}
