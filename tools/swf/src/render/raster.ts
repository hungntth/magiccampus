// Scanline polygon rasterizer: fills a set of line segments (any order, no contour joining needed)
// with the even-odd or nonzero rule into a coverage mask. Anti-aliasing uses SUB sub-scanlines per
// pixel row with exact fractional horizontal coverage at span ends.

const SUB = 5;

/** Flat segment list: x0, y0, x1, y1 repeated, in target pixel coordinates. */
export type Segments = number[];

export interface Coverage {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Row-major coverage 0..1 for the w×h box at (x, y). */
  cov: Float32Array;
}

interface ActiveEdge {
  yTop: number;
  yBot: number;
  x0: number;
  y0: number;
  slope: number;
  dir: number;
}

/** Rasterizes `segs` clipped to [0, width) × [0, height). Returns null when nothing is covered. */
export function rasterize(segs: Segments, width: number, height: number, nonzero: boolean): Coverage | null {
  const edges: ActiveEdge[] = [];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const x0 = segs[i], y0 = segs[i + 1], x1 = segs[i + 2], y1 = segs[i + 3];
    if (y0 === y1 || !Number.isFinite(x0 + y0 + x1 + y1)) continue;
    const dir = y1 > y0 ? 1 : -1;
    const top = dir > 0 ? { x: x0, y: y0 } : { x: x1, y: y1 };
    edges.push({
      yTop: Math.min(y0, y1),
      yBot: Math.max(y0, y1),
      x0: top.x,
      y0: top.y,
      slope: (x1 - x0) / (y1 - y0),
      dir,
    });
    bx0 = Math.min(bx0, x0, x1); bx1 = Math.max(bx1, x0, x1);
    by0 = Math.min(by0, y0, y1); by1 = Math.max(by1, y0, y1);
  }
  if (edges.length === 0) return null;
  const x = Math.max(0, Math.floor(bx0));
  const y = Math.max(0, Math.floor(by0));
  const w = Math.min(width, Math.ceil(bx1)) - x;
  const h = Math.min(height, Math.ceil(by1)) - y;
  if (w <= 0 || h <= 0) return null;
  const cov = new Float32Array(w * h);
  edges.sort((a, b) => a.yTop - b.yTop);

  let next = 0;
  let active: ActiveEdge[] = [];
  const xs: number[] = [];
  const dirs: number[] = [];
  const order: number[] = [];
  const weight = 1 / SUB;
  for (let row = 0; row < h; row++) {
    const base = row * w;
    for (let s = 0; s < SUB; s++) {
      const sy = y + row + (s + 0.5) / SUB;
      while (next < edges.length && edges[next].yTop <= sy) active.push(edges[next++]);
      active = active.filter((e) => e.yBot > sy);
      xs.length = 0;
      dirs.length = 0;
      for (const e of active) {
        if (e.yTop > sy) continue;
        xs.push(e.x0 + (sy - e.y0) * e.slope - x);
        dirs.push(e.dir);
      }
      if (xs.length < 2) continue;
      order.length = 0;
      for (let i = 0; i < xs.length; i++) order.push(i);
      order.sort((a, b) => xs[a] - xs[b]);
      let wind = 0;
      for (let k = 0; k < order.length - 1; k++) {
        const i = order[k];
        wind += nonzero ? dirs[i] : 1;
        const inside = nonzero ? wind !== 0 : (wind & 1) === 1;
        if (inside) addSpan(cov, base, w, xs[i], xs[order[k + 1]], weight);
      }
    }
  }
  return { x, y, w, h, cov };
}

function addSpan(cov: Float32Array, base: number, w: number, xa: number, xb: number, weight: number): void {
  if (xa < 0) xa = 0;
  if (xb > w) xb = w;
  if (xb <= xa) return;
  const ia = Math.floor(xa);
  const ib = Math.floor(xb);
  if (ia === ib) {
    cov[base + ia] += (xb - xa) * weight;
    return;
  }
  cov[base + ia] += (ia + 1 - xa) * weight;
  for (let i = ia + 1; i < ib; i++) cov[base + i] += weight;
  if (ib < w) cov[base + ib] += (xb - ib) * weight;
}
