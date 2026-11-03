// Turns shape edges into rasterizer segments: transforms to target pixels, flattens quadratic curves,
// and approximates strokes as unions of segment quads plus round joins/caps (same orientation, nonzero).

import type { Matrix } from '../swf/matrix.js';
import type { Edge } from '../swf/vector.js';
import type { Segments } from './raster.js';

/** Appends the transformed, flattened outline of `edges` to `out`. */
export function flattenEdges(edges: Edge[], m: Matrix, out: Segments): void {
  for (const e of edges) {
    const x0 = m.a * e.x0 + m.c * e.y0 + m.tx;
    const y0 = m.b * e.x0 + m.d * e.y0 + m.ty;
    const x1 = m.a * e.x1 + m.c * e.y1 + m.tx;
    const y1 = m.b * e.x1 + m.d * e.y1 + m.ty;
    if (!e.curve) {
      out.push(x0, y0, x1, y1);
      continue;
    }
    const cx = m.a * e.cx + m.c * e.cy + m.tx;
    const cy = m.b * e.cx + m.d * e.cy + m.ty;
    // Deviation of the control point from the chord midpoint bounds the curve error.
    const dev = Math.hypot(cx - (x0 + x1) / 2, cy - (y0 + y1) / 2);
    const n = Math.min(64, Math.max(1, Math.ceil(Math.sqrt(dev * 4))));
    let px = x0;
    let py = y0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const qx = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const qy = u * u * y0 + 2 * u * t * cy + t * t * y1;
      out.push(px, py, qx, qy);
      px = qx;
      py = qy;
    }
  }
}

/** Stroke outline for `edges` with the given width in target pixels (≥ 1, hairlines included). */
export function strokeEdges(edges: Edge[], m: Matrix, width: number, out: Segments): void {
  const line: Segments = [];
  flattenEdges(edges, m, line);
  const hw = Math.max(1, width) / 2;
  const joins = hw > 0.75;
  let lastX = NaN;
  let lastY = NaN;
  for (let i = 0; i + 3 < line.length; i += 4) {
    const x0 = line[i], y0 = line[i + 1], x1 = line[i + 2], y1 = line[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    const nx = (-(y1 - y0) / len) * hw;
    const ny = ((x1 - x0) / len) * hw;
    quad(out, x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny);
    if (joins) {
      if (x0 !== lastX || y0 !== lastY) disc(out, x0, y0, hw);
      disc(out, x1, y1, hw);
    }
    lastX = x1;
    lastY = y1;
  }
}

// Every primitive is emitted with negative signed area (y down) so the nonzero rule unions them.
function quad(out: Segments, ...p: number[]): void {
  let area = 0;
  for (let i = 0; i < 8; i += 2) area += p[i] * p[(i + 3) % 8] - p[(i + 2) % 8] * p[i + 1];
  const idx = area > 0 ? [0, 6, 4, 2] : [0, 2, 4, 6];
  for (let k = 0; k < 4; k++) {
    const a = idx[k];
    const b = idx[(k + 1) % 4];
    out.push(p[a], p[a + 1], p[b], p[b + 1]);
  }
}

function disc(out: Segments, x: number, y: number, r: number): void {
  const n = Math.max(8, Math.min(32, Math.ceil(r * 4)));
  let px = x + r;
  let py = y;
  for (let i = 1; i <= n; i++) {
    const t = (-2 * Math.PI * i) / n;
    const qx = x + r * Math.cos(t);
    const qy = y + r * Math.sin(t);
    out.push(px, py, qx, qy);
    px = qx;
    py = qy;
  }
}
