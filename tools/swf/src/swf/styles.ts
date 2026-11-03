// DefineShape fill and line style arrays (FILLSTYLEARRAY / LINESTYLEARRAY, incl. DefineShape4 LINESTYLE2).
// Colours are non-premultiplied RGBA 0..255; matrices keep SWF raw units (see paint.ts for scaling).

import { readMatrix, type Matrix } from './matrix.js';
import { u16, type BitReader } from './reader.js';
import { Tag } from './tags.js';

export type RGBA = [number, number, number, number];

export interface GradientStop {
  ratio: number;
  color: RGBA;
}

export type FillStyle =
  | { kind: 'solid'; color: RGBA }
  | {
      kind: 'linear' | 'radial' | 'focal';
      matrix: Matrix;
      /** 0 pad, 1 reflect, 2 repeat. */
      spread: number;
      stops: GradientStop[];
      focal: number;
    }
  | { kind: 'bitmap'; bitmapId: number; matrix: Matrix; repeat: boolean; smooth: boolean };

export interface LineStyle {
  /** Width in pixels (twips / 20); 0 = hairline. */
  width: number;
  color: RGBA;
  /** DefineShape4 lines may be filled with any fill style. */
  fill: FillStyle | null;
}

function byte(r: BitReader): number {
  if (r.pos >= r.b.length) throw new Error('truncated shape styles');
  return r.b[r.pos++];
}

function readColor(r: BitReader, withAlpha: boolean): RGBA {
  return [byte(r), byte(r), byte(r), withAlpha ? byte(r) : 255];
}

function readCount(r: BitReader, extended: boolean): number {
  const n = byte(r);
  if (n === 0xff && extended) {
    const v = u16(r.b, r.pos);
    r.pos += 2;
    return v;
  }
  return n;
}

function withAlpha(code: number): boolean {
  return code === Tag.DefineShape3 || code === Tag.DefineShape4;
}

export function readFillStyle(r: BitReader, code: number): FillStyle {
  const ft = byte(r);
  if (ft === 0x00) return { kind: 'solid', color: readColor(r, withAlpha(code)) };
  if (ft === 0x10 || ft === 0x12 || ft === 0x13) {
    const matrix = readMatrix(r);
    const hdr = byte(r);
    const n = hdr & 0x0f;
    const stops: GradientStop[] = [];
    for (let i = 0; i < n; i++) stops.push({ ratio: byte(r), color: readColor(r, withAlpha(code)) });
    let focal = 0;
    if (ft === 0x13) {
      const v = u16(r.b, r.pos);
      r.pos += 2;
      focal = (v >= 0x8000 ? v - 0x10000 : v) / 256;
    }
    const kind = ft === 0x10 ? 'linear' : ft === 0x12 ? 'radial' : 'focal';
    return { kind, matrix, spread: (hdr >> 6) & 3, stops, focal };
  }
  if (ft >= 0x40 && ft <= 0x43) {
    const bitmapId = u16(r.b, r.pos);
    r.pos += 2;
    const matrix = readMatrix(r);
    return { kind: 'bitmap', bitmapId, matrix, repeat: (ft & 1) === 0, smooth: ft < 0x42 };
  }
  throw new Error(`unknown fill type 0x${ft.toString(16)}`);
}

export function readFillStyles(r: BitReader, code: number): FillStyle[] {
  r.align();
  const n = readCount(r, code !== Tag.DefineShape);
  const out: FillStyle[] = [];
  for (let i = 0; i < n; i++) out.push(readFillStyle(r, code));
  return out;
}

export function readLineStyles(r: BitReader, code: number): LineStyle[] {
  r.align();
  const n = readCount(r, true);
  const out: LineStyle[] = [];
  for (let i = 0; i < n; i++) {
    const width = u16(r.b, r.pos) / 20;
    r.pos += 2;
    if (code !== Tag.DefineShape4) {
      out.push({ width, color: readColor(r, withAlpha(code)), fill: null });
      continue;
    }
    const f1 = byte(r);
    byte(r); // NoClose + EndCapStyle: strokes are approximated with round caps
    const join = (f1 >> 4) & 3;
    const hasFill = (f1 & 0x08) !== 0;
    if (join === 2) r.pos += 2; // miter limit
    if (hasFill) {
      const fill = readFillStyle(r, code);
      out.push({ width, color: fill.kind === 'solid' ? fill.color : firstColor(fill), fill });
    } else {
      out.push({ width, color: readColor(r, true), fill: null });
    }
  }
  return out;
}

function firstColor(f: FillStyle): RGBA {
  return f.kind === 'linear' || f.kind === 'radial' || f.kind === 'focal' ? (f.stops[0]?.color ?? [0, 0, 0, 255]) : [0, 0, 0, 255];
}
