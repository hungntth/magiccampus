// DefineShape parsing limited to what the bitmap pipeline needs: shape bounds and the
// bitmap fill styles (bitmap id + matrix). Vector-only shapes are reported as such.

import { readMatrix, readRect, type Matrix, type Rect } from './matrix.js';
import { BitReader, u16, type Tag as SwfTag } from './reader.js';
import { Tag } from './tags.js';

export interface BitmapFill {
  bitmapId: number;
  matrix: Matrix;
  type: number;
}

export interface ShapeInfo {
  id: number;
  bounds: Rect;
  bitmapFills: BitmapFill[];
  fillCount: number;
  lineCount: number;
  vector: boolean;
}

// Throws on malformed fill styles.
export function parseShape(t: SwfTag): ShapeInfo {
  if (t.data.length < 2) throw new Error('short shape');
  const r = new BitReader(t.data.subarray(2));
  const info: ShapeInfo = {
    id: u16(t.data, 0),
    bounds: readRect(r),
    bitmapFills: [],
    fillCount: 0,
    lineCount: 0,
    vector: false,
  };
  if (t.code === Tag.DefineShape4) {
    readRect(r);
    r.align();
    r.pos++;
  }
  const withAlpha = t.code === Tag.DefineShape3 || t.code === Tag.DefineShape4;
  readFillStyles(r, t.code, withAlpha, info);
  readLineStyles(r, info);
  info.vector = info.bitmapFills.length === 0 || info.fillCount > info.bitmapFills.length || info.lineCount > 0;
  return info;
}

function readFillStyles(r: BitReader, code: number, withAlpha: boolean, info: ShapeInfo): void {
  r.align();
  if (r.pos >= r.b.length) throw new Error('truncated fill styles');
  let count = r.b[r.pos];
  r.pos++;
  if (count === 0xff && code !== Tag.DefineShape) {
    count = u16(r.b, r.pos);
    r.pos += 2;
  }
  info.fillCount = count;
  for (let i = 0; i < count; i++) {
    if (r.pos >= r.b.length) throw new Error('truncated fill style');
    const ft = r.b[r.pos];
    r.pos++;
    if (ft === 0x00) {
      r.pos += withAlpha ? 4 : 3;
    } else if (ft === 0x10 || ft === 0x12 || ft === 0x13) {
      readMatrix(r);
      r.align();
      const n = (r.b[r.pos] ?? 0) & 0x0f;
      r.pos++;
      r.pos += n * (withAlpha ? 5 : 4);
      if (ft === 0x13) r.pos += 2;
    } else if (ft >= 0x40 && ft <= 0x43) {
      const id = u16(r.b, r.pos);
      r.pos += 2;
      info.bitmapFills.push({ bitmapId: id, matrix: readMatrix(r), type: ft });
    } else {
      throw new Error('unknown fill type');
    }
  }
}

function readLineStyles(r: BitReader, info: ShapeInfo): void {
  r.align();
  if (r.pos >= r.b.length) return;
  let count = r.b[r.pos];
  r.pos++;
  if (count === 0xff) {
    if (r.pos + 2 > r.b.length) return;
    count = u16(r.b, r.pos);
    r.pos += 2;
  }
  info.lineCount = count;
}
