// SWF color transforms (CXFORM / CXFORMWITHALPHA): parsing, composition and application.
// Multipliers are stored as fractions (256 = 1.0 in the file), add terms in 0..255 units.

import type { BitReader } from './reader.js';

export interface ColorTransform {
  rm: number;
  gm: number;
  bm: number;
  am: number;
  ra: number;
  ga: number;
  ba: number;
  aa: number;
}

export const CX_IDENTITY: Readonly<ColorTransform> = { rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 };

export function readColorTransform(r: BitReader, withAlpha: boolean): ColorTransform {
  r.align();
  const hasAdd = r.readUBits(1) === 1;
  const hasMul = r.readUBits(1) === 1;
  const n = r.readUBits(4);
  const cx = { ...CX_IDENTITY };
  if (hasMul) {
    cx.rm = r.readSBits(n) / 256;
    cx.gm = r.readSBits(n) / 256;
    cx.bm = r.readSBits(n) / 256;
    if (withAlpha) cx.am = r.readSBits(n) / 256;
  }
  if (hasAdd) {
    cx.ra = r.readSBits(n);
    cx.ga = r.readSBits(n);
    cx.ba = r.readSBits(n);
    if (withAlpha) cx.aa = r.readSBits(n);
  }
  r.align();
  return cx;
}

/** outer ∘ inner: the inner transform is applied first. */
export function concatCx(outer: ColorTransform, inner: ColorTransform): ColorTransform {
  return {
    rm: outer.rm * inner.rm,
    gm: outer.gm * inner.gm,
    bm: outer.bm * inner.bm,
    am: outer.am * inner.am,
    ra: outer.rm * inner.ra + outer.ra,
    ga: outer.gm * inner.ga + outer.ga,
    ba: outer.bm * inner.ba + outer.ba,
    aa: outer.am * inner.aa + outer.aa,
  };
}

export function isIdentityCx(cx: ColorTransform): boolean {
  return cx.rm === 1 && cx.gm === 1 && cx.bm === 1 && cx.am === 1 && !cx.ra && !cx.ga && !cx.ba && !cx.aa;
}

/** Transforms a non-premultiplied RGBA colour (0..255 channels) in place. */
export function applyCx(cx: ColorTransform, c: Float64Array): void {
  c[0] = clamp255(c[0] * cx.rm + cx.ra);
  c[1] = clamp255(c[1] * cx.gm + cx.ga);
  c[2] = clamp255(c[2] * cx.bm + cx.ba);
  c[3] = clamp255(c[3] * cx.am + cx.aa);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
