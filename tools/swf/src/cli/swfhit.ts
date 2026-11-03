// swfhit extracts walkability masks from scene MAP_HIT_NEW.swf files: the DefineBinaryData payload
// is zlib-compressed, 1 bit per pixel (bit set = walkable), row-major, width x height of the map.
// For every "resource/scene/SCENE_FOLDER_xxxxxx/MAP_HIT_NEW.swf" in resmap.json it writes
//   <out>/scene/SCENE_FOLDER_xxxxxx/hit.bin   (raw bitfield, little-endian bit order as Flash reads it)
//   <out>/scene/SCENE_FOLDER_xxxxxx/hit.png   (preview, white = walkable)  when -png is set
// Map sizes come from a JSON file { "<folder>": {"w":..,"h":..} } produced from data_tbl_map.
//
// Usage: swfhit [-cache DIR] -resmap resmap.json -sizes sizes.json -out DIR [-png]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DEFAULT_CACHE, parseFlags } from '../flags.js';
import { goJSON } from '../gojson.js';
import { encodeGray } from '../png.js';
import { inflate, parse, type Tag as SwfTag } from '../swf/reader.js';
import { Tag } from '../swf/tags.js';

interface Size {
  w: number;
  h: number;
}

const { flags } = parseFlags(
  { cache: DEFAULT_CACHE, resmap: '../../server/resmap.json', sizes: '', out: '../../client/public/sheets', png: false },
  'usage: swfhit [-cache DIR] -resmap resmap.json -sizes sizes.json -out DIR [-png]',
);

const names = mustJSON<Record<string, string>>(flags.resmap);
const sizeMap: Record<string, Size> = flags.sizes ? mustJSON(flags.sizes) : {};

let ok = 0;
let failed = 0;
for (const [md5, logical] of Object.entries(names)) {
  if (!logical.endsWith('/MAP_HIT_NEW.swf')) continue;
  const folder = basename(dirname(logical));
  let raw: Buffer;
  try {
    raw = readFileSync(join(flags.cache, md5));
  } catch {
    failed++;
    continue;
  }
  let hit: ReturnType<typeof extract>;
  try {
    hit = extract(raw);
  } catch (e) {
    console.error(`${folder}: ${(e as Error).message}`);
    failed++;
    continue;
  }
  const dir = join(flags.out, 'scene', folder);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, 'hit.bin'), hit.bits);
  } catch {
    failed++;
    continue;
  }
  const sz = sizeMap[folder] ?? { w: 0, h: 0 };
  let { gw, gh } = hit;
  if (gw === 0 || gh === 0) [gw, gh] = [sz.w, sz.h];
  if (flags.png && gw > 0 && gh > 0) writePreview(join(dir, 'hit.png'), hit.bits, gw, gh);
  const meta = new Map<string, number>([['bytes', hit.bits.length], ['w', gw], ['h', gh], ['mapW', sz.w], ['mapH', sz.h]]);
  writeFileSync(join(dir, 'hit.json'), goJSON(meta));
  ok++;
}
console.log(`hit masks: ${ok} ok, ${failed} failed`);

function extract(raw: Uint8Array): { bits: Uint8Array; gw: number; gh: number } {
  const f = parse(raw);
  let gw = 0;
  let gh = 0;
  let bits: Uint8Array | null = null;
  for (const t of f.tags) {
    if (t.code === Tag.DoABCDefine || t.code === Tag.DoABC) {
      const g = abcGridSize(t);
      if (g) [gw, gh] = g;
    } else if (t.code === Tag.DefineBinaryData && t.data.length >= 6) {
      try {
        bits = inflate(t.data.subarray(6));
      } catch (e) {
        throw new Error(`zlib: ${(e as Error).message}`);
      }
    }
  }
  if (!bits) throw new Error('no DefineBinaryData');
  return { bits, gw, gh };
}

// abcGridSize reads the first two doubles of the ABC constant pool: the generated
// ClassBytes class stores the grid width/height there (e.g. 2031.45, 1530.4).
function abcGridSize(t: SwfTag): [number, number] | null {
  const b = t.data;
  let p = 0;
  if (t.code === Tag.DoABC) {
    p = 4;
    while (p < b.length && b[p] !== 0) p++;
    p++;
  }
  p += 4;
  const u30 = (): number => {
    let v = 0;
    let s = 0;
    while (p < b.length) {
      const c = b[p++];
      if (s < 32) v = (v | ((c & 0x7f) << s)) >>> 0;
      if (!(c & 0x80)) break;
      s += 7;
    }
    return v;
  };
  // Skip the int and uint pools to reach the double pool.
  for (let pool = 0; pool < 2; pool++) {
    const n = u30();
    for (let i = 1; i < n; i++) u30();
  }
  const n = u30();
  if (n < 3 || p + 16 > b.length) return null;
  const dv = new DataView(b.buffer, b.byteOffset + p, 16);
  const w = dv.getFloat64(0, true);
  const h = dv.getFloat64(8, true);
  if (!(w > 0 && h > 0 && w <= 20000 && h <= 20000)) return null;
  return [Math.trunc(w), Math.trunc(h)];
}

function writePreview(path: string, bits: Uint8Array, w: number, h: number): void {
  const pix = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (i >> 3 >= bits.length) break;
      if (bits[i >> 3] & (1 << (i & 7))) pix[i] = 255;
    }
  }
  try {
    writeFileSync(path, encodeGray(w, h, pix));
  } catch {
    // the preview is optional
  }
}

function mustJSON<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
