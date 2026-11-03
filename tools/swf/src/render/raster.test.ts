// Unit tests for the scanline rasterizer and shape drawing (coverage, AA edges, winding rules).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newImage } from '../swf/images.js';
import { IDENTITY } from '../swf/matrix.js';
import { CX_IDENTITY } from '../swf/cxform.js';
import type { Edge, VectorShape } from '../swf/vector.js';
import { drawShape } from './draw.js';
import { rasterize, type Segments } from './raster.js';

function rect(x0: number, y0: number, x1: number, y1: number, ccw = false): Segments {
  const p = ccw ? [x0, y0, x0, y1, x1, y1, x1, y0] : [x0, y0, x1, y0, x1, y1, x0, y1];
  const out: Segments = [];
  for (let i = 0; i < 8; i += 2) out.push(p[i], p[i + 1], p[(i + 2) % 8], p[(i + 3) % 8]);
  return out;
}

function at(c: NonNullable<ReturnType<typeof rasterize>>, x: number, y: number): number {
  const cx = x - c.x;
  const cy = y - c.y;
  if (cx < 0 || cy < 0 || cx >= c.w || cy >= c.h) return 0;
  return c.cov[cy * c.w + cx];
}

test('square fills exactly its pixels', () => {
  const c = rasterize(rect(2, 2, 6, 6), 8, 8, false);
  assert.ok(c);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const inside = x >= 2 && x < 6 && y >= 2 && y < 6;
      assert.ok(Math.abs(at(c, x, y) - (inside ? 1 : 0)) < 1e-6, `pixel ${x},${y}`);
    }
  }
});

test('half-pixel edges give partial coverage', () => {
  const c = rasterize(rect(1.5, 1, 3, 3), 4, 4, false);
  assert.ok(c);
  assert.ok(Math.abs(at(c, 1, 1) - 0.5) < 1e-6);
  assert.ok(Math.abs(at(c, 2, 1) - 1) < 1e-6);
});

test('even-odd leaves a hole, nonzero fills same-direction overlap', () => {
  const ring = [...rect(0, 0, 6, 6), ...rect(2, 2, 4, 4)];
  const eo = rasterize(ring, 6, 6, false);
  const nz = rasterize(ring, 6, 6, true);
  assert.ok(eo && nz);
  assert.equal(at(eo, 3, 3), 0);
  assert.ok(Math.abs(at(nz, 3, 3) - 1) < 1e-6);
  const holed = rasterize([...rect(0, 0, 6, 6), ...rect(2, 2, 4, 4, true)], 6, 6, true);
  assert.ok(holed);
  assert.equal(at(holed, 3, 3), 0);
  assert.ok(Math.abs(at(holed, 1, 1) - 1) < 1e-6);
});

test('drawShape paints a solid fill with fill0/fill1 edges', () => {
  const e = (x0: number, y0: number, x1: number, y1: number): Edge =>
    ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, curve: false });
  const shape: VectorShape = {
    id: 1,
    bounds: { xMin: 1, yMin: 1, xMax: 3, yMax: 3 },
    nonzero: false,
    groups: [{
      fills: [{ kind: 'solid', color: [255, 0, 0, 255] }],
      lines: [],
      fillEdges: [[e(1, 1, 3, 1), e(3, 1, 3, 3), e(3, 3, 1, 3), e(1, 3, 1, 1)]],
      lineEdges: [],
    }],
  };
  const img = newImage(4, 4);
  drawShape(img, shape, IDENTITY, CX_IDENTITY, new Map(), null);
  assert.deepEqual([...img.pix.subarray((2 * 4 + 2) * 4, (2 * 4 + 2) * 4 + 4)], [255, 0, 0, 255]);
  assert.deepEqual([...img.pix.subarray(0, 4)], [0, 0, 0, 0]);
});
