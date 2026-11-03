// Converts a bitmap-based SWF timeline into an atlas PNG + JSON animation description.
// Nested DefineSprite instances are flattened per frame (sprite frame = parent frame mod length).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { goJSON } from '../gojson.js';
import { encodeRGBA } from '../png.js';
import { resourceMetrics } from '../swf/abc.js';
import { decodeBitmap, newImage, type Image } from '../swf/images.js';
import { IDENTITY, mul, type Matrix } from '../swf/matrix.js';
import { u16, tagsOf, type SwfFile } from '../swf/reader.js';
import { parseShape, type ShapeInfo } from '../swf/shape.js';
import { BITMAP_TAGS, SHAPE_TAGS, Tag } from '../swf/tags.js';
import { walkTimeline, type Placed, type Timeline } from '../swf/timeline.js';

export interface Obj {
  i: number;
  m: [number, number, number, number, number, number];
}

export interface Frame {
  d: number;
  objs: Obj[];
}

export interface Result {
  images: number;
  anims: number;
  frames: number;
  skipped: number;
  width: number;
  height: number;
}

class Converter {
  readonly bitmaps = new Map<number, Image>();
  readonly shapes = new Map<number, ShapeInfo>();
  readonly sprites = new Map<number, Timeline>();
  readonly imageIndex = new Map<number, number>();
  readonly ordered: number[] = [];
  skipped = 0;

  useImage(id: number): number {
    let idx = this.imageIndex.get(id);
    if (idx === undefined) {
      idx = this.ordered.length;
      this.imageIndex.set(id, idx);
      this.ordered.push(id);
    }
    return idx;
  }

  flatten(objs: Placed[], parent: Matrix, frameIdx: number, depth: number): Obj[] {
    const out: Obj[] = [];
    for (const p of objs) {
      const m = mul(parent, p.matrix);
      const sh = this.shapes.get(p.charId);
      if (sh) {
        if (sh.bitmapFills.length === 0) {
          this.skipped++;
          continue;
        }
        for (const fill of sh.bitmapFills) {
          if (!this.bitmaps.has(fill.bitmapId)) {
            this.skipped++;
            continue;
          }
          // Bitmap fill matrices map 20 units per pixel; scale them back to pixels.
          const fm = fill.matrix;
          const f = mul(m, { a: fm.a / 20, b: fm.b / 20, c: fm.c / 20, d: fm.d / 20, tx: fm.tx, ty: fm.ty });
          out.push({ i: this.useImage(fill.bitmapId), m: [r3(f.a), r3(f.b), r3(f.c), r3(f.d), r3(f.tx), r3(f.ty)] });
        }
        continue;
      }
      const sp = this.sprites.get(p.charId);
      if (sp && depth < 6 && sp.frames.length > 0) {
        const fr = sp.frames[frameIdx % sp.frames.length];
        out.push(...this.flatten(fr.objects, m, frameIdx, depth + 1));
        continue;
      }
      this.skipped++;
    }
    return out;
  }
}

export function convert(f: SwfFile, outDir: string, name: string, maxW: number): Result {
  const c = new Converter();
  let jpegTables: Uint8Array = new Uint8Array();
  for (const t of f.tags) {
    if (t.code === Tag.JPEGTables) {
      jpegTables = t.data;
    } else if (BITMAP_TAGS.includes(t.code)) {
      try {
        c.bitmaps.set(u16(t.data, 0), decodeBitmap(t, jpegTables));
      } catch {
        // undecodable bitmaps count as unsupported objects where they are used
      }
    } else if (SHAPE_TAGS.includes(t.code)) {
      try {
        const info = parseShape(t);
        c.shapes.set(info.id, info);
      } catch {
        // malformed shape: treated like any unknown character
      }
    } else if (t.code === Tag.DefineSprite && t.data.length >= 4) {
      c.sprites.set(u16(t.data, 0), walkTimeline(tagsOf(t.data.subarray(4))));
    }
  }

  const anims = new Map<string, Frame[]>();
  const order: string[] = [];
  let current = '';
  let frames = 0;
  for (const fr of walkTimeline(f.tags).frames) {
    if (fr.label !== '') current = fr.label;
    if (current === '') current = 'default';
    let list = anims.get(current);
    if (!list) {
      list = [];
      anims.set(current, list);
      order.push(current);
    }
    const objs = c.flatten(fr.objects, IDENTITY, fr.index, 0);
    const last = list[list.length - 1];
    if (last && sameObjs(last.objs, objs)) last.d++;
    else list.push({ d: 1, objs });
    frames++;
  }
  if (c.ordered.length === 0) throw new Error('no bitmap content');

  const { atlas, rects } = pack(c.ordered, c.bitmaps, maxW);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.png`), encodeRGBA(atlas));

  // Empty frames keep "objs": null and image rects keep sorted keys, like the Go output.
  const sheet = {
    fps: f.frameRate,
    width: f.width,
    height: f.height,
    ox: f.xMin,
    oy: f.yMin,
    images: rects.map((r) => new Map(Object.entries(r))),
    anims: new Map([...anims].map(([k, list]) => [k, list.map((fr) => ({ d: fr.d, objs: fr.objs.length ? fr.objs : null }))])),
    order,
    // Anchor metrics from the SWF's GameResInst class (midX/footY = feet point in sheet coordinates).
    meta: resourceMetrics(f.tags),
  };
  writeFileSync(join(outDir, `${name}.json`), goJSON(sheet));
  return {
    images: c.ordered.length,
    anims: anims.size,
    frames,
    skipped: c.skipped,
    width: atlas.width,
    height: atlas.height,
  };
}

function sameObjs(a: Obj[], b: Obj[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].i !== b[i].i) return false;
    for (let k = 0; k < 6; k++) if (a[i].m[k] !== b[i].m[k]) return false;
  }
  return true;
}

// Round half away from zero to 3 decimals (never -0).
function r3(v: number): number {
  const n = Math.trunc(v < 0 ? v * 1000 - 0.5 : v * 1000 + 0.5);
  return n === 0 ? 0 : n / 1000;
}

interface PackRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Shelf packer: tallest first, rows up to maxW wide, 1px padding.
function pack(ids: number[], bitmaps: Map<number, Image>, maxW: number): { atlas: Image; rects: PackRect[] } {
  const items = ids.map((id, idx) => {
    const b = bitmaps.get(id)!;
    return { idx, w: b.width, h: b.height };
  });
  const sorted = [...items].sort((a, b) => b.h - a.h);
  const rects: PackRect[] = new Array(ids.length);
  const pad = 1;
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const it of sorted) {
    if (x + it.w + pad > maxW && x > 0) {
      x = 0;
      y += rowH + pad;
      rowH = 0;
    }
    rects[it.idx] = { x, y, w: it.w, h: it.h };
    x += it.w + pad;
    rowH = Math.max(rowH, it.h);
    width = Math.max(width, x);
  }
  const atlas = newImage(width || 1, y + rowH || 1);
  ids.forEach((id, i) => {
    const r = rects[i];
    const src = bitmaps.get(id)!;
    for (let row = 0; row < r.h; row++) {
      const s = row * r.w * 4;
      atlas.pix.set(src.pix.subarray(s, s + r.w * 4), ((r.y + row) * atlas.width + r.x) * 4);
    }
  });
  return { atlas, rects };
}
