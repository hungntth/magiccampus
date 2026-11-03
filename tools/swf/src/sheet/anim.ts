// Frame-by-frame vector animation: renders the main timeline of a vector SWF at global frames 0..N-1
// (nested sprites loop independently) and packs the frames into the standard sheet format (sheet.ts):
// one image per distinct frame, anim "default", images placed so the SWF stage origin is the sheet origin.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { goJSON } from '../gojson.js';
import { encodeRGBA } from '../png.js';
import { resourceMetrics } from '../swf/abc.js';
import { newImage, type Image } from '../swf/images.js';
import type { SwfFile } from '../swf/reader.js';
import { pack } from './sheet.js';
import { SymbolLibrary, type Composed } from './compose.js';

export const MAX_ANIM_FRAMES = 120;

export interface AnimResult {
  frames: number;
  images: number;
  skipped: number;
  atlasWidth: number;
  atlasHeight: number;
  localizerY?: number;
}

/** `frames` = 0 picks the longest nested sprite loop (capped at MAX_ANIM_FRAMES). */
export function renderAnim(f: SwfFile, outDir: string, name: string, frames: number, maxW = 2048): AnimResult {
  const lib = new SymbolLibrary(f);
  const count = frames > 0 ? frames : Math.min(MAX_ANIM_FRAMES, lib.stageLoopLength());
  const rendered: Composed[] = [];
  let skipped = 0;
  for (let i = 0; i < count; i++) {
    const c = lib.composeStage(i);
    if (!c) throw new Error(`frame ${i}: nothing to draw`);
    skipped = Math.max(skipped, c.skipped);
    rendered.push(c);
  }
  // Common canvas: union of all frame extents around the stage origin.
  const left = Math.max(...rendered.map((c) => c.ox));
  const top = Math.max(...rendered.map((c) => c.oy));
  const right = Math.max(...rendered.map((c) => c.image.width - c.ox));
  const bottom = Math.max(...rendered.map((c) => c.image.height - c.oy));
  const w = left + right;
  const h = top + bottom;

  const unique: Image[] = [];
  const seq: { image: number; d: number }[] = [];
  for (const c of rendered) {
    const img = newImage(w, h);
    const dx = left - c.ox;
    const dy = top - c.oy;
    for (let row = 0; row < c.image.height; row++) {
      const s = row * c.image.width * 4;
      img.pix.set(c.image.pix.subarray(s, s + c.image.width * 4), ((row + dy) * w + dx) * 4);
    }
    const last = unique[unique.length - 1];
    if (last && Buffer.compare(last.pix, img.pix) === 0) {
      seq[seq.length - 1].d++;
      continue;
    }
    seq.push({ image: unique.length, d: 1 });
    unique.push(img);
  }

  const bitmaps = new Map(unique.map((img, i) => [i, img] as const));
  const { atlas, rects } = pack([...bitmaps.keys()], bitmaps, maxW);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.png`), encodeRGBA(atlas));

  const localizer = lib.stageChild('localizer');
  const localizerY = localizer ? Math.round(localizer.matrix.ty * 1000) / 1000 : undefined;
  const sheet = {
    fps: f.frameRate,
    width: f.width,
    height: f.height,
    ox: f.xMin,
    oy: f.yMin,
    images: rects.map((r) => new Map(Object.entries(r))),
    anims: new Map([['default', seq.map((s) => ({ d: s.d, objs: [{ i: s.image, m: [1, 0, 0, 1, -left, -top] }] }))]]),
    order: ['default'],
    // GameResInst anchor metrics (NPC/creature SWFs drawn with vectors) plus the localizer ground line (gates).
    meta: metaOf(resourceMetrics(f.tags), localizerY),
  };
  writeFileSync(join(outDir, `${name}.json`), goJSON(sheet));
  return { frames: count, images: unique.length, skipped, atlasWidth: atlas.width, atlasHeight: atlas.height, localizerY };
}

function metaOf(metrics: Record<string, number> | undefined, localizerY: number | undefined): Record<string, number> | undefined {
  if (localizerY === undefined) return metrics;
  return { ...metrics, localizerY };
}
