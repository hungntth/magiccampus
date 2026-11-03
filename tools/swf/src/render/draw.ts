// Draws a parsed vector shape onto an RGBA canvas: style groups in order, fills then strokes, with an
// optional colour transform and mask coverage. Source-over blending on non-premultiplied pixels.

import { applyCx, isIdentityCx, type ColorTransform } from '../swf/cxform.js';
import type { Image } from '../swf/images.js';
import type { Matrix } from '../swf/matrix.js';
import type { VectorShape } from '../swf/vector.js';
import { flattenEdges, strokeEdges } from './geom.js';
import { makeSampler, type Sampler } from './paint.js';
import { rasterize, type Coverage, type Segments } from './raster.js';

/** Full-canvas mask coverage (0..1), or null for no mask. */
export type Mask = Float32Array | null;

export function drawShape(
  out: Image,
  shape: VectorShape,
  m: Matrix,
  cx: ColorTransform,
  bitmaps: Map<number, Image>,
  mask: Mask,
): void {
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  for (const g of shape.groups) {
    g.fills.forEach((fill, i) => {
      const edges = g.fillEdges[i];
      if (edges.length === 0) return;
      const segs: Segments = [];
      flattenEdges(edges, m, segs);
      const cov = rasterize(segs, out.width, out.height, shape.nonzero);
      const sampler = makeSampler(fill, m, bitmaps);
      if (cov && sampler) paint(out, cov, sampler, cx, mask);
    });
    g.lines.forEach((line, i) => {
      const edges = g.lineEdges[i];
      if (edges.length === 0) return;
      const segs: Segments = [];
      strokeEdges(edges, m, line.width * scale, segs);
      const cov = rasterize(segs, out.width, out.height, true);
      const sampler = makeSampler(line.fill ?? { kind: 'solid', color: line.color }, m, bitmaps);
      if (cov && sampler) paint(out, cov, sampler, cx, mask);
    });
  }
}

/** Union coverage of a shape's fills (for mask layers; colours ignored). */
export function shapeCoverage(shape: VectorShape, m: Matrix, w: number, h: number): Coverage | null {
  const segs: Segments = [];
  for (const g of shape.groups) g.fillEdges.forEach((edges) => flattenEdges(edges, m, segs));
  return rasterize(segs, w, h, true);
}

function paint(out: Image, cov: Coverage, sampler: Sampler, cx: ColorTransform, mask: Mask): void {
  const c = new Float64Array(4);
  const identity = isIdentityCx(cx);
  const pix = out.pix;
  for (let row = 0; row < cov.h; row++) {
    const y = cov.y + row;
    for (let col = 0; col < cov.w; col++) {
      let k = cov.cov[row * cov.w + col];
      if (k <= 1 / 512) continue;
      if (k > 1) k = 1;
      const x = cov.x + col;
      const p = y * out.width + x;
      if (mask) {
        k *= mask[p];
        if (k <= 1 / 512) continue;
      }
      sampler(x + 0.5, y + 0.5, c);
      if (!identity) applyCx(cx, c);
      const sa = (c[3] / 255) * k;
      if (sa <= 0) continue;
      const di = p * 4;
      const da = pix[di + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let ch = 0; ch < 3; ch++) {
        pix[di + ch] = Math.round((c[ch] * sa + pix[di + ch] * da * (1 - sa)) / oa);
      }
      pix[di + 3] = Math.round(oa * 255);
    }
  }
}
