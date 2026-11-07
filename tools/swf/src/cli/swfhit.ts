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

// Share of sampled pixels that differ from the pixel one row above (rowBreaks): a real grid stays well under it
// (~0.005), a wrong row stride shears the mask into stripes (0.04-0.4).
const MAX_ROW_BREAKS = 0.02;

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
  const abc: SwfTag[] = [];
  for (const t of f.tags) {
    if (t.code === Tag.DoABCDefine || t.code === Tag.DoABC) {
      abc.push(t);
    } else if (t.code === Tag.DefineBinaryData && t.data.length >= 6) {
      try {
        bits = inflate(t.data.subarray(6));
      } catch (e) {
        throw new Error(`zlib: ${(e as Error).message}`);
      }
    }
  }
  if (!bits) throw new Error('no DefineBinaryData');
  for (const t of abc) {
    const g = gridSize(bits, abcNumbers(t));
    if (g) [gw, gh] = g;
  }
  return { bits, gw, gh };
}

// gridSize picks the grid width/height among the ABC constants of the generated ClassBytes class. Usually both are
// doubles (2031.45, 1530.4), but a whole number sits in the int pool (SCENE_FOLDER_000004: int 3076, double 2094.95),
// the height may come first (SCENE_FOLDER_000018) or be missing (SCENE_FOLDER_000070 stores only 3132.x). So every
// constant is tried as the row stride and the one whose rows line up best wins (a wrong stride shears the mask into
// stripes); the height is the other constant that fits the payload, else the number of whole rows.
function gridSize(bits: Uint8Array, nums: number[]): [number, number] | null {
  const cands = nums.map(Math.trunc).filter((v) => v > 0 && v <= 20000);
  let w = 0;
  let best = MAX_ROW_BREAKS;
  for (const c of cands) {
    const s = rowBreaks(bits, c);
    if (s < best) [w, best] = [c, s];
  }
  if (w === 0) return null;
  const rows = Math.floor((bits.length * 8) / w);
  const h = cands.find((v) => v !== w && v <= rows && rows - v < 3) ?? rows;
  return [w, h];
}

// Share of sampled pixels that differ from the pixel one row above when rows are `w` bits long.
function rowBreaks(bits: Uint8Array, w: number): number {
  const rows = Math.floor((bits.length * 8) / w);
  const at = (x: number, y: number): number => {
    const i = y * w + x;
    return (bits[i >> 3] >> (i & 7)) & 1;
  };
  let diff = 0;
  let n = 0;
  for (let y = 1; y < rows; y += 5) {
    for (let x = 0; x < w; x += 4) {
      diff += at(x, y) ^ at(x, y - 1);
      n++;
    }
  }
  return n === 0 ? 1 : diff / n;
}

// abcNumbers lists the int, uint and double constant pools in that order.
function abcNumbers(t: SwfTag): number[] {
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
  const out: number[] = [];
  for (let pool = 0; pool < 2; pool++) {
    const n = u30();
    for (let i = 1; i < n; i++) out.push(pool === 0 ? u30() | 0 : u30());
  }
  const n = u30();
  for (let i = 1; i < n && p + 8 <= b.length; i++, p += 8) out.push(new DataView(b.buffer, b.byteOffset + p, 8).getFloat64(0, true));
  return out;
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
