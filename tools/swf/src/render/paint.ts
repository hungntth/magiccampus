// Fill style samplers: solid colours, linear/radial/focal gradients (pad/reflect/repeat) and bitmap
// fills (clipped/repeating, nearest/bilinear). A sampler writes non-premultiplied RGBA for a pixel centre.

import type { Image } from '../swf/images.js';
import { mul, type Matrix } from '../swf/matrix.js';
import type { FillStyle, GradientStop } from '../swf/styles.js';

export type Sampler = (x: number, y: number, out: Float64Array) => void;

/** `m` maps shape pixels to target pixels. Returns null for fills that cannot be drawn. */
export function makeSampler(fill: FillStyle, m: Matrix, bitmaps: Map<number, Image>): Sampler | null {
  if (fill.kind === 'solid') {
    const [r, g, b, a] = fill.color;
    return (_x, _y, out) => {
      out[0] = r; out[1] = g; out[2] = b; out[3] = a;
    };
  }
  // Gradient and bitmap matrices scale 20 units per pixel; translation is already in pixels.
  const fm = fill.matrix;
  const inv = invert(mul(m, { a: fm.a / 20, b: fm.b / 20, c: fm.c / 20, d: fm.d / 20, tx: fm.tx, ty: fm.ty }));
  if (!inv) return null;
  if (fill.kind === 'bitmap') {
    const bmp = bitmaps.get(fill.bitmapId);
    if (!bmp) return null;
    const unit = Math.abs(Math.abs(inv.a) - 1) < 1e-3 && Math.abs(Math.abs(inv.d) - 1) < 1e-3 &&
      Math.abs(inv.b) < 1e-3 && Math.abs(inv.c) < 1e-3;
    return bitmapSampler(bmp, inv, fill.repeat, fill.smooth && !unit);
  }
  const lut = gradientLut(fill.stops);
  const spread = fill.spread;
  const kind = fill.kind;
  const fx = fill.focal * 16384;
  return (x, y, out) => {
    const gx = inv.a * x + inv.c * y + inv.tx;
    const gy = inv.b * x + inv.d * y + inv.ty;
    let t: number;
    if (kind === 'linear') t = (gx + 16384) / 32768;
    else if (kind === 'radial' || fx === 0) t = Math.hypot(gx, gy) / 16384;
    else t = focalRatio(gx, gy, fx);
    if (spread === 1) {
      t = Math.abs(t) % 2;
      if (t > 1) t = 2 - t;
    } else if (spread === 2) {
      t -= Math.floor(t);
    }
    const i = Math.max(0, Math.min(255, Math.round(t * 255))) * 4;
    out[0] = lut[i]; out[1] = lut[i + 1]; out[2] = lut[i + 2]; out[3] = lut[i + 3];
  };
}

// Ratio along the ray from the focal point (fx, 0) through (gx, gy) to the unit circle (radius 16384).
function focalRatio(gx: number, gy: number, fx: number): number {
  const dx = gx - fx;
  const dy = gy;
  const a = dx * dx + dy * dy;
  if (a === 0) return 0;
  const b = 2 * fx * dx;
  const c = fx * fx - 16384 * 16384;
  const s = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  return s > 0 ? 1 / s : 1;
}

function gradientLut(stops: GradientStop[]): Float64Array {
  const lut = new Float64Array(256 * 4);
  if (stops.length === 0) return lut;
  const last = stops[stops.length - 1];
  for (let i = 0; i < 256; i++) {
    let c0 = stops[0].color;
    let c1 = c0;
    let t = 0;
    if (i >= last.ratio) {
      c0 = c1 = last.color;
    } else if (i > stops[0].ratio) {
      let k = 0;
      while (stops[k + 1].ratio <= i) k++;
      c0 = stops[k].color;
      c1 = stops[k + 1].color;
      t = (i - stops[k].ratio) / (stops[k + 1].ratio - stops[k].ratio);
    }
    for (let c = 0; c < 4; c++) lut[i * 4 + c] = c0[c] + (c1[c] - c0[c]) * t;
  }
  return lut;
}

function bitmapSampler(bmp: Image, inv: Matrix, repeat: boolean, smooth: boolean): Sampler {
  const { width: bw, height: bh, pix } = bmp;
  const wrap = (v: number, n: number): number => (repeat ? ((v % n) + n) % n : v < 0 ? 0 : v >= n ? n - 1 : v);
  if (!smooth) {
    return (x, y, out) => {
      const sx = wrap(Math.floor(inv.a * x + inv.c * y + inv.tx), bw);
      const sy = wrap(Math.floor(inv.b * x + inv.d * y + inv.ty), bh);
      const i = (sy * bw + sx) * 4;
      out[0] = pix[i]; out[1] = pix[i + 1]; out[2] = pix[i + 2]; out[3] = pix[i + 3];
    };
  }
  return (x, y, out) => {
    const u = inv.a * x + inv.c * y + inv.tx - 0.5;
    const v = inv.b * x + inv.d * y + inv.ty - 0.5;
    const u0 = Math.floor(u);
    const v0 = Math.floor(v);
    const fu = u - u0;
    const fv = v - v0;
    let r = 0, g = 0, b = 0, a = 0;
    // Premultiplied bilinear blend avoids dark fringes around transparent pixels.
    for (let k = 0; k < 4; k++) {
      const sx = wrap(u0 + (k & 1), bw);
      const sy = wrap(v0 + (k >> 1), bh);
      const wgt = (k & 1 ? fu : 1 - fu) * (k >> 1 ? fv : 1 - fv);
      const i = (sy * bw + sx) * 4;
      const pa = pix[i + 3] * wgt;
      r += pix[i] * pa; g += pix[i + 1] * pa; b += pix[i + 2] * pa; a += pa;
    }
    if (a > 0) {
      out[0] = r / a; out[1] = g / a; out[2] = b / a;
    } else {
      out[0] = 0; out[1] = 0; out[2] = 0;
    }
    out[3] = a;
  };
}

export function invert(m: Matrix): Matrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det;
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) };
}
