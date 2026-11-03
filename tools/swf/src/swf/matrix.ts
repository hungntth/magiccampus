// SWF MATRIX / RECT parsing and affine helpers (SWF units are twips: 1 px = 20 twips).

import type { BitReader } from './reader.js';

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Readonly<Matrix> = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function mul(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  };
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}

export interface Rect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function readFixed16(r: BitReader, n: number): number {
  return r.readSBits(n) / 65536;
}

export function readMatrix(r: BitReader): Matrix {
  r.align();
  const m = { ...IDENTITY };
  if (r.readUBits(1) === 1) {
    const n = r.readUBits(5);
    m.a = readFixed16(r, n);
    m.d = readFixed16(r, n);
  }
  if (r.readUBits(1) === 1) {
    const n = r.readUBits(5);
    m.b = readFixed16(r, n);
    m.c = readFixed16(r, n);
  }
  const n = r.readUBits(5);
  m.tx = r.readSBits(n) / 20;
  m.ty = r.readSBits(n) / 20;
  r.align();
  return m;
}

export function readRect(r: BitReader): Rect {
  r.align();
  const n = r.readUBits(5);
  const rect = {
    xMin: r.readSBits(n) / 20,
    xMax: r.readSBits(n) / 20,
    yMin: r.readSBits(n) / 20,
    yMax: r.readSBits(n) / 20,
  };
  r.align();
  return rect;
}

export function skipColorTransform(r: BitReader, withAlpha: boolean): void {
  r.align();
  const hasAdd = r.readUBits(1);
  const hasMul = r.readUBits(1);
  const n = r.readUBits(4);
  const cnt = withAlpha ? 4 : 3;
  if (hasMul === 1) for (let i = 0; i < cnt; i++) r.readSBits(n);
  if (hasAdd === 1) for (let i = 0; i < cnt; i++) r.readSBits(n);
  r.align();
}
