// Renders the first frame of a SWF symbol (sprite, button up state, shape or bitmap) into one RGBA image: vector fills,
// gradients, bitmap fills and strokes in depth order, with PlaceObject colour transforms and clip masks.
// Characters that cannot be drawn (text, buttons, morph shapes, ...) are counted as `skipped`.

import { CX_IDENTITY, concatCx, type ColorTransform } from '../swf/cxform.js';
import { buttonUpState, firstFrame, type DisplayObject } from '../swf/display.js';
import { decodeBitmap, newImage, type Image } from '../swf/images.js';
import { IDENTITY, mul, type Matrix } from '../swf/matrix.js';
import { cstring, tagsOf, u16, type SwfFile } from '../swf/reader.js';
import { BITMAP_TAGS, SHAPE_TAGS, Tag } from '../swf/tags.js';
import { parseVectorShape, type VectorShape } from '../swf/vector.js';
import { drawShape, shapeCoverage, type Mask } from '../render/draw.js';

export interface Composed {
  image: Image;
  /** Pixel position of the symbol's registration point inside `image`. */
  ox: number;
  oy: number;
  /** Placed characters that could not be rendered. */
  skipped: number;
}

interface MaskLayer {
  parts: { shape: VectorShape; m: Matrix }[];
}

interface Item {
  shape: VectorShape;
  m: Matrix;
  cx: ColorTransform;
  masks: MaskLayer[];
}

const MAX_DEPTH = 12;

export class SymbolLibrary {
  readonly symbols = new Map<number, string>();
  private readonly bitmaps = new Map<number, Image>();
  private readonly shapes = new Map<number, VectorShape>();
  private readonly sprites = new Map<number, DisplayObject[]>();

  constructor(f: SwfFile) {
    let jpegTables: Uint8Array = new Uint8Array();
    for (const t of f.tags) {
      if (t.code === Tag.JPEGTables) jpegTables = t.data;
      else if (BITMAP_TAGS.includes(t.code)) {
        try {
          const id = u16(t.data, 0);
          const img = decodeBitmap(t, jpegTables);
          this.bitmaps.set(id, img);
          this.shapes.set(id, bitmapShape(id, img));
        } catch {
          // undecodable bitmap: its users render without it
        }
      } else if (SHAPE_TAGS.includes(t.code)) {
        try {
          const s = parseVectorShape(t);
          this.shapes.set(s.id, s);
        } catch {
          // malformed shape: counted as skipped where it is placed
        }
      } else if (t.code === Tag.DefineSprite && t.data.length >= 4) {
        this.sprites.set(u16(t.data, 0), firstFrame(tagsOf(t.data.subarray(4))));
      } else if ((t.code === Tag.DefineButton || t.code === Tag.DefineButton2) && t.data.length >= 2) {
        this.sprites.set(u16(t.data, 0), buttonUpState(t.data, t.code === Tag.DefineButton2));
      } else if (t.code === Tag.SymbolClass && t.data.length >= 2) {
        let pos = 2;
        for (let i = 0, n = u16(t.data, 0); i < n && pos + 2 <= t.data.length; i++) {
          const id = u16(t.data, pos);
          const [name, adv] = cstring(t.data.subarray(pos + 2));
          pos += 2 + adv;
          this.symbols.set(id, name);
        }
      }
    }
  }

  compose(id: number): Composed | null {
    const items: Item[] = [];
    let skipped = 0;

    // Collects the shapes of a character (for masks: geometry only).
    const collect = (
      charId: number, m: Matrix, cx: ColorTransform, masks: MaskLayer[], depth: number, sink: Item[],
    ): void => {
      const sh = this.shapes.get(charId);
      if (sh) {
        sink.push({ shape: sh, m, cx, masks });
        return;
      }
      const sp = this.sprites.get(charId);
      if (!sp) {
        skipped++;
        return;
      }
      if (depth > MAX_DEPTH) return;
      let active: { until: number; layer: MaskLayer }[] = [];
      for (const o of sp) {
        if (active.length) active = active.filter((a) => a.until >= o.depth);
        const om = mul(m, o.matrix);
        if (o.clipDepth > 0) {
          const parts: Item[] = [];
          collect(o.charId, om, CX_IDENTITY, [], depth + 1, parts);
          active.push({ until: o.clipDepth, layer: { parts: parts.map((p) => ({ shape: p.shape, m: p.m })) } });
          continue;
        }
        const layered = active.length ? [...masks, ...active.map((a) => a.layer)] : masks;
        collect(o.charId, om, concatCx(cx, o.cx), layered, depth + 1, sink);
      }
    };
    collect(id, IDENTITY, CX_IDENTITY, [], 0, items);
    if (items.length === 0) return null;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) {
      const b = it.shape.bounds;
      for (const [x, y] of [[b.xMin, b.yMin], [b.xMax, b.yMin], [b.xMin, b.yMax], [b.xMax, b.yMax]]) {
        const px = it.m.a * x + it.m.c * y + it.m.tx;
        const py = it.m.b * x + it.m.d * y + it.m.ty;
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
    }
    if (!Number.isFinite(x0 + y0 + x1 + y1) || x1 - x0 > 8192 || y1 - y0 > 8192) return null;
    const ox = -Math.floor(x0);
    const oy = -Math.floor(y0);
    const out = newImage(Math.max(1, Math.ceil(x1) + ox), Math.max(1, Math.ceil(y1) + oy));
    const shift = (m: Matrix): Matrix => ({ ...m, tx: m.tx + ox, ty: m.ty + oy });

    const maskCache = new Map<MaskLayer, Float32Array>();
    const layerMask = (layer: MaskLayer): Float32Array => {
      let buf = maskCache.get(layer);
      if (buf) return buf;
      buf = new Float32Array(out.width * out.height);
      for (const p of layer.parts) {
        const cov = shapeCoverage(p.shape, shift(p.m), out.width, out.height);
        if (!cov) continue;
        for (let r = 0; r < cov.h; r++) {
          for (let c = 0; c < cov.w; c++) {
            const i = (cov.y + r) * out.width + cov.x + c;
            buf[i] = Math.min(1, buf[i] + cov.cov[r * cov.w + c]);
          }
        }
      }
      maskCache.set(layer, buf);
      return buf;
    };
    for (const it of items) {
      let mask: Mask = null;
      for (const layer of it.masks) {
        const lm = layerMask(layer);
        if (!mask) mask = lm;
        else {
          const prev: Float32Array = mask;
          mask = prev.map((v, i) => v * lm[i]);
        }
      }
      drawShape(out, it.shape, shift(it.m), it.cx, this.bitmaps, mask);
    }
    return { image: out, ox, oy, skipped };
  }
}

// A bitmap placed directly on a timeline draws like a rectangle with a clipped bitmap fill.
function bitmapShape(id: number, img: Image): VectorShape {
  const w = img.width;
  const h = img.height;
  const e = (x0: number, y0: number, x1: number, y1: number) =>
    ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, curve: false });
  return {
    id,
    bounds: { xMin: 0, yMin: 0, xMax: w, yMax: h },
    nonzero: false,
    groups: [{
      fills: [{ kind: 'bitmap', bitmapId: id, matrix: { a: 20, b: 0, c: 0, d: 20, tx: 0, ty: 0 }, repeat: false, smooth: false }],
      lines: [],
      fillEdges: [[e(0, 0, w, 0), e(w, 0, w, h), e(w, h, 0, h), e(0, h, 0, 0)]],
      lineEdges: [],
    }],
  };
}
