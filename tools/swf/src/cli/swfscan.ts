// swfscan classifies every SWF blob in the asset cache so the conversion pipeline knows what it
// can handle: bitmap-only timelines (convertible with swf2sheet), vector art, nested sprites,
// morph shapes, text/fonts, ActionScript. Writes a TSV report.
//
// Usage: swfscan [-cache DIR] [-out report.tsv] [-names resmap.json]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CACHE, parseFlags } from '../flags.js';
import { ascii, parse, type SwfFile } from '../swf/reader.js';
import { parseShape } from '../swf/shape.js';
import { BITMAP_TAGS, SHAPE_TAGS, Tag } from '../swf/tags.js';

interface Row {
  md5: string;
  name: string;
  category: string;
  frames: number;
  labels: number;
  shapes: number;
  bitmapShapes: number;
  vectorShapes: number;
  bitmaps: number;
  sprites: number;
  morphs: number;
  text: number;
  buttons: number;
  sounds: number;
  abc: boolean;
  as2: boolean;
  width: number;
  height: number;
  err: string;
}

const COLUMNS: (keyof Row)[] = [
  'md5', 'name', 'category', 'frames', 'labels', 'shapes', 'bitmapShapes', 'vectorShapes', 'bitmaps',
  'sprites', 'morphs', 'text', 'buttons', 'sounds', 'abc', 'as2', 'width', 'height', 'err',
];

const TEXT_TAGS = [10, 11, 33, 37, 48, 75];
const BUTTON_TAGS = [7, 34];
const SOUND_TAGS = [14, 18, 45];

const { flags } = parseFlags(
  { cache: DEFAULT_CACHE, out: 'swfscan.tsv', names: '' },
  'usage: swfscan [-cache DIR] [-out report.tsv] [-names resmap.json]',
);

let nameMap: Record<string, string> = {};
if (flags.names) {
  try {
    nameMap = JSON.parse(readFileSync(flags.names, 'utf8'));
  } catch {
    // names are optional
  }
}

let entries;
try {
  entries = readdirSync(flags.cache, { withFileTypes: true });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const rows: Row[] = [];
const cats = new Map<string, number>();
for (const e of entries) {
  if (e.isDirectory()) continue;
  let raw: Buffer;
  try {
    raw = readFileSync(join(flags.cache, e.name));
  } catch {
    continue;
  }
  if (raw.length < 3) continue;
  const sig = ascii(raw.subarray(0, 3));
  if (sig !== 'CWS' && sig !== 'FWS' && sig !== 'ZWS') continue;
  const r = newRow(e.name, nameMap[e.name] ?? '');
  try {
    classify(parse(raw), r);
  } catch (err) {
    r.err = (err as Error).message;
    r.category = 'error';
  }
  cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
  rows.push(r);
}
rows.sort((a, b) => Buffer.compare(Buffer.from(a.name + a.md5), Buffer.from(b.name + b.md5)));

const lines = [COLUMNS.join('\t')];
for (const r of rows) lines.push(COLUMNS.map((c) => (typeof r[c] === 'number' ? goG(r[c]) : String(r[c]))).join('\t'));
writeFileSync(flags.out, lines.join('\n') + '\n');

console.log(`${rows.length} swf files`);
for (const k of [...cats.keys()].sort()) console.log(`  ${k.padEnd(22)} ${cats.get(k)}`);

function newRow(md5: string, name: string): Row {
  return {
    md5, name, category: '', frames: 0, labels: 0, shapes: 0, bitmapShapes: 0, vectorShapes: 0, bitmaps: 0,
    sprites: 0, morphs: 0, text: 0, buttons: 0, sounds: 0, abc: false, as2: false, width: 0, height: 0, err: '',
  };
}

function classify(f: SwfFile, r: Row): void {
  r.frames = f.frameCount;
  r.width = f.width;
  r.height = f.height;
  for (const t of f.tags) {
    const c = t.code;
    if (c === Tag.FrameLabel) r.labels++;
    else if (c === Tag.DoABC) r.abc = true;
    else if (c === Tag.DoAction) r.as2 = true;
    else if (c === Tag.DefineSprite) r.sprites++;
    else if (c === Tag.DefineMorphShape || c === Tag.DefineMorphShape2) r.morphs++;
    else if (TEXT_TAGS.includes(c)) r.text++;
    else if (BUTTON_TAGS.includes(c)) r.buttons++;
    else if (SOUND_TAGS.includes(c)) r.sounds++;
    else if (BITMAP_TAGS.includes(c)) r.bitmaps++;
    else if (SHAPE_TAGS.includes(c)) {
      r.shapes++;
      if (t.data.length < 2) continue;
      let vector = true;
      try {
        vector = parseShape(t).vector;
      } catch {
        // unparseable fill styles count as vector
      }
      if (vector) r.vectorShapes++;
      else r.bitmapShapes++;
    }
  }
  if (r.shapes === 0 && r.bitmaps === 0 && r.morphs === 0) r.category = 'no-graphics';
  else if (r.vectorShapes === 0 && r.morphs === 0 && r.sprites === 0 && r.labels > 0) r.category = 'bitmap-anim';
  else if (r.vectorShapes === 0 && r.morphs === 0 && r.sprites === 0) r.category = 'bitmap-static';
  else if (r.vectorShapes === 0 && r.morphs === 0) r.category = 'bitmap-sprites';
  else if (r.bitmapShapes === 0 && r.bitmaps === 0) r.category = 'vector';
  else r.category = 'mixed';
}

// Go's %g: shortest digits, exponent form (two-digit minimum) below 1e-4 or from 1e6 up.
function goG(v: number): string {
  if (v === 0) return Object.is(v, -0) ? '-0' : '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e < -4 || e >= 6) return v.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
  return String(v);
}
