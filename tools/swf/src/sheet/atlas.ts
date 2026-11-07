// Paged, trimmed sprite atlases for swf2sheet/swfbatch: bitmaps are cropped to their opaque bounds, shelf-packed onto
// pages no larger than maxW x maxH (WebGL/WebP size limits) and encoded as lossy WebP with lossless alpha.

import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { newImage, type Image } from '../swf/images.js';

export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Atlas page index (omitted for page 0). */
  p?: number;
}

/** WebP lossy quality for colour; alpha stays lossless so hit tests and edges are unchanged. */
const QUALITY = 82;

/** Crops fully transparent borders; (ox, oy) is the crop origin in the original bitmap. */
export function trim(img: Image): { img: Image; ox: number; oy: number } {
  const { width: w, height: h, pix } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pix[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { img: newImage(1, 1), ox: 0, oy: 0 };
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return { img, ox: 0, oy: 0 };
  const out = newImage(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.height; y++) {
    const s = ((y0 + y) * w + x0) * 4;
    out.pix.set(pix.subarray(s, s + out.width * 4), y * out.width * 4);
  }
  return { img: out, ox: x0, oy: y0 };
}

/** Shelf packer over pages: tallest first, rows up to maxW wide, a new page once maxH would be exceeded, 1px padding. */
export function packPages(images: Image[], maxW: number, maxH: number): { pages: Image[]; rects: PageRect[] } {
  const order = images.map((_, i) => i).sort((a, b) => images[b].height - images[a].height);
  const rects: PageRect[] = new Array(images.length);
  const sizes: { w: number; h: number }[] = [];
  const pad = 1;
  let page = 0;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const i of order) {
    const { width: w, height: h } = images[i];
    if (x + w + pad > maxW && x > 0) {
      x = 0;
      y += rowH + pad;
      rowH = 0;
    }
    if (y + h > maxH && y > 0) {
      page++;
      x = 0;
      y = 0;
      rowH = 0;
    }
    rects[i] = page === 0 ? { x, y, w, h } : { x, y, w, h, p: page };
    x += w + pad;
    rowH = Math.max(rowH, h);
    const s = (sizes[page] ??= { w: 1, h: 1 });
    s.w = Math.max(s.w, x - pad);
    s.h = Math.max(s.h, y + rowH);
  }
  const pages = sizes.map((s) => newImage(s.w, s.h));
  images.forEach((src, i) => {
    const r = rects[i];
    const dst = pages[r.p ?? 0];
    for (let row = 0; row < r.h; row++) {
      const s = row * r.w * 4;
      dst.pix.set(src.pix.subarray(s, s + r.w * 4), ((r.y + row) * dst.width + r.x) * 4);
    }
  });
  return { pages, rects };
}

/**
 * Writes <name>.webp, <name>_1.webp, ... and returns their file names. Removes the sheet's previous outputs
 * (<name>.png from the old single-PNG format, leftover higher pages).
 */
export async function writePages(outDir: string, name: string, pages: Image[]): Promise<string[]> {
  const files = pages.map((_, i) => (i === 0 ? `${name}.webp` : `${name}_${i}.webp`));
  const stale = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+\\.webp$`);
  for (const f of readdirSync(outDir)) if (stale.test(f) && !files.includes(f)) unlinkSync(join(outDir, f));
  const png = join(outDir, `${name}.png`);
  if (existsSync(png)) unlinkSync(png);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const buf = await sharp(p.pix, { raw: { width: p.width, height: p.height, channels: 4 }, limitInputPixels: false })
      .webp({ quality: QUALITY, alphaQuality: 100, effort: 4 })
      .toBuffer();
    writeFileSync(join(outDir, files[i]), buf);
  }
  return files;
}
