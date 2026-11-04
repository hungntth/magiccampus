// swfelement exports the character-panel element figure (legacy CharactorPanel_element / CharactorInfoPanel_element,
// a 7-frame clip: frame = 1 + ee) for the H5 client: silhouette.png (the fill / MAX layer), rim.png (the base layer,
// an inner-glow knockout of the silhouette, rendered here since the vector renderer has no filters) and element.json
// with each layer's alpha + ColorMatrix filter per frame and the maskMC fill line per element strength en (0..12).
// Usage: swfelement -out DIR [-xor 1,2,0] [-symbol REGEX] <main client swf>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFlags } from '../flags.js';
import { encodeRGBA } from '../png.js';
import { SymbolLibrary } from '../sheet/compose.js';
import { readColorTransform } from '../swf/cxform.js';
import { displayAt } from '../swf/display.js';
import { newImage, type Image } from '../swf/images.js';
import { readMatrix } from '../swf/matrix.js';
import { BitReader, cstring, parse, tagsOf, u16, type Tag as SwfTag } from '../swf/reader.js';
import { Tag } from '../swf/tags.js';

const usage = 'usage: swfelement -out DIR [-xor 1,2,0] [-symbol REGEX] <file>';
const { flags, args } = parseFlags({ out: 'out', xor: '', symbol: 'CharactorInfoPanel_element$' }, usage);
if (args.length !== 1) {
  console.error(usage);
  process.exit(2);
}

interface Glow { r: number; g: number; b: number; a: number; blurX: number; blurY: number; strength: number; inner: boolean; knockout: boolean; passes: number }
interface Placed { charId: number; name?: string; clipDepth: number; alpha: number; matrix: number[] | null; glow: Glow | null }
interface LayerFrame { alpha: number; matrix: number[] | null }

const raw = new Uint8Array(readFileSync(args[0]));
if (flags.xor) {
  const key = flags.xor.split(',').map(Number);
  for (let i = 0; i < raw.length; i++) raw[i] ^= key[i % key.length];
}
const file = parse(raw);
const lib = new SymbolLibrary(file);
const sprites = new Map<number, SwfTag[]>();
for (const t of file.tags) if (t.code === Tag.DefineSprite && t.data.length >= 4) sprites.set(u16(t.data, 0), tagsOf(t.data.subarray(4)));

const re = new RegExp(flags.symbol);
const rootId = [...lib.symbols].find(([, cls]) => re.test(cls))?.[0];
if (rootId === undefined || !sprites.has(rootId)) fail(`no sprite symbol matches ${flags.symbol}`);
const frames = timeline(sprites.get(rootId)!);

// Layers by role: maskMC clips the fill copy; maxMc is the MAX overlay; the lowest depth is the base layer.
const first = frames.find((f) => [...f.values()].some((p) => p.name === 'maskMC')) ?? fail('maskMC not found');
const [maskDepth, mask] = [...first].find(([, p]) => p.name === 'maskMC')!;
const maxDepth = [...first].find(([, p]) => p.name === 'maxMc')?.[0] ?? fail('maxMc not found');
const pick = (f: Map<number, Placed>, role: 'base' | 'fill' | 'max'): Placed | undefined => {
  const ds = [...f.keys()].sort((a, b) => a - b);
  if (role === 'max') return f.get(maxDepth);
  if (role === 'base') return f.get(ds[0]);
  const d = ds.find((x) => x > maskDepth && x <= mask.clipDepth && x !== maxDepth);
  return d === undefined ? undefined : f.get(d);
};
const layer = (p: Placed | undefined): LayerFrame | null => (p ? { alpha: p.alpha, matrix: p.matrix } : null);

// Fill line per en: maskMC frame en scales a rect up from the feet; its top edge is where the fill starts.
const maskTags = sprites.get(mask.charId) ?? fail('maskMC is not a sprite');
const maskTop: number[] = [];
for (let en = 0; en < 13; en++) {
  const [o] = displayAt(maskTags, en);
  const c = o ? lib.compose(o.charId) : null;
  maskTop.push(o && c ? round(o.matrix.ty - o.matrix.d * c.oy) : 0);
}

// Images: the fill layer's symbol as the silhouette; the base layer's glowing child, rendered with its glow filter.
const fillId = frames.map((f) => pick(f, 'fill')).find((p) => p)?.charId ?? fail('fill layer not found');
const sil = lib.compose(fillId) ?? fail('silhouette did not render');
const baseId = frames.map((f) => pick(f, 'base')).filter((p) => p)[1]?.charId ?? fail('base layer not found');
const glowChild = [...timeline(sprites.get(baseId) ?? [])[0]?.values() ?? []].find((p) => p.glow);
mkdirSync(flags.out, { recursive: true });
writeFileSync(join(flags.out, 'silhouette.png'), encodeRGBA(sil.image));
const meta: Record<string, unknown> = { silhouette: { w: sil.image.width, h: sil.image.height, ox: sil.ox, oy: sil.oy } };
if (glowChild?.glow) {
  const c = lib.compose(glowChild.charId) ?? fail('glow child did not render');
  const rim = innerGlow(c.image, glowChild.glow);
  writeFileSync(join(flags.out, 'rim.png'), encodeRGBA(rim));
  meta.rim = { w: rim.width, h: rim.height, ox: c.ox, oy: c.oy };
}
meta.maskTop = maskTop;
meta.frames = frames.map((f) => ({ base: layer(pick(f, 'base')), fill: layer(pick(f, 'fill')), max: layer(pick(f, 'max')) }));
writeFileSync(join(flags.out, 'element.json'), `${JSON.stringify(meta, null, 1)}\n`);
console.log(`symbol #${rootId}: ${frames.length} frames, silhouette #${fillId}, base #${baseId}${glowChild ? ' (glow)' : ''}`);

/** Display state after every frame, with alpha, ColorMatrix (20 values) and glow filters kept per depth. */
function timeline(tags: SwfTag[]): Map<number, Placed>[] {
  const out: Map<number, Placed>[] = [];
  const cur = new Map<number, Placed>();
  for (const t of tags) {
    if (t.code === Tag.ShowFrame) out.push(new Map([...cur].map(([d, p]) => [d, { ...p }])));
    else if (t.code === Tag.PlaceObject2 || t.code === Tag.PlaceObject3) place(t, cur);
    else if (t.code === Tag.RemoveObject2 && t.data.length >= 2) cur.delete(u16(t.data, 0));
  }
  return out;
}

function place(t: SwfTag, cur: Map<number, Placed>): void {
  const d = t.data;
  const f1 = d[0];
  const f2 = t.code === Tag.PlaceObject3 ? d[1] : 0;
  let pos = t.code === Tag.PlaceObject3 ? 2 : 1;
  const depth = u16(d, pos);
  pos += 2;
  if (f2 & 0x08) pos += cstring(d.subarray(pos))[1];
  const charId = f1 & 0x02 ? u16(d, pos) : 0;
  if (f1 & 0x02) pos += 2;
  const r = new BitReader(d.subarray(pos));
  if (f1 & 0x04) readMatrix(r);
  const cx = f1 & 0x08 ? readColorTransform(r, true) : null;
  r.align();
  if (f1 & 0x10) r.pos += 2;
  let name: string | undefined;
  if (f1 & 0x20) {
    const [n, adv] = cstring(r.b.subarray(r.pos));
    name = n;
    r.pos += adv;
  }
  let clipDepth: number | null = null;
  if (f1 & 0x40) {
    clipDepth = u16(r.b, r.pos);
    r.pos += 2;
  }
  const filters = f2 & 0x01 ? readFilters(r.b, r.pos) : null;
  const prev = f1 & 0x01 ? cur.get(depth) : undefined;
  const p: Placed = prev ?? { charId, clipDepth: 0, alpha: 1, matrix: null, glow: null };
  if (charId) p.charId = charId;
  if (name !== undefined) p.name = name;
  if (clipDepth !== null) p.clipDepth = clipDepth;
  if (cx) p.alpha = round(cx.am);
  if (filters) {
    p.matrix = filters.matrix;
    p.glow = filters.glow;
  }
  if (p.charId) cur.set(depth, p);
}

/** FILTERLIST: keeps the ColorMatrix and Glow filters, skips the other kinds by size. */
function readFilters(b: Uint8Array, pos: number): { matrix: number[] | null; glow: Glow | null } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const res = { matrix: null as number[] | null, glow: null as Glow | null };
  const n = b[pos++];
  for (let i = 0; i < n && pos < b.length; i++) {
    const id = b[pos++];
    if (id === 6) {
      res.matrix = Array.from({ length: 20 }, (_, k) => round(dv.getFloat32(pos + k * 4, true)));
      pos += 80;
    } else if (id === 2) {
      const fl = b[pos + 14];
      res.glow = {
        r: b[pos], g: b[pos + 1], b: b[pos + 2], a: b[pos + 3],
        blurX: dv.getUint32(pos + 4, true) / 65536, blurY: dv.getUint32(pos + 8, true) / 65536,
        strength: dv.getUint16(pos + 12, true) / 256, inner: (fl & 0x80) !== 0, knockout: (fl & 0x40) !== 0,
        passes: Math.max(1, fl & 0x1f),
      };
      pos += 15;
    } else if (id === 0) pos += 23;
    else if (id === 1) pos += 9;
    else if (id === 3) pos += 27;
    else if (id === 4 || id === 7) pos += b[pos] * 5 + 1 + 19;
    else if (id === 5) pos += 2 + 8 + b[pos] * b[pos + 1] * 4 + 5;
    else break;
  }
  return res;
}

/** Flash GlowFilter (inner, knockout): glow = box-blurred inverse alpha x strength, kept inside the source alpha. */
function innerGlow(src: Image, g: Glow): Image {
  const { width: w, height: h } = src;
  const inv = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = 1 - src.pix[i * 4 + 3] / 255;
  let buf: Float32Array = inv;
  for (let p = 0; p < g.passes; p++) buf = boxBlur(boxBlur(buf, w, h, g.blurX, true), w, h, g.blurY, false);
  const out = newImage(w, h);
  for (let i = 0; i < w * h; i++) {
    const sa = src.pix[i * 4 + 3] / 255;
    const ga = Math.min(1, buf[i] * g.strength) * (g.a / 255);
    const a = g.inner ? ga * sa : ga * (1 - sa);
    const keep = g.knockout ? 0 : sa * (1 - a);
    out.pix[i * 4] = g.r;
    out.pix[i * 4 + 1] = g.g;
    out.pix[i * 4 + 2] = g.b;
    out.pix[i * 4 + 3] = Math.round(Math.min(1, a + keep) * 255);
  }
  return out;
}

/** Box blur of `size` px along one axis; samples outside the image count as fully transparent source (inverse 1). */
function boxBlur(v: Float32Array, w: number, h: number, size: number, horiz: boolean): Float32Array {
  const out = new Float32Array(v.length);
  const half = Math.max(0, Math.floor(size / 2));
  const len = horiz ? w : h;
  const lines = horiz ? h : w;
  for (let l = 0; l < lines; l++) {
    for (let k = 0; k < len; k++) {
      let sum = 0;
      for (let o = -half; o <= half; o++) {
        const q = k + o;
        sum += q < 0 || q >= len ? 1 : v[horiz ? l * w + q : q * w + l];
      }
      out[horiz ? l * w + k : k * w + l] = sum / (2 * half + 1);
    }
  }
  return out;
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
