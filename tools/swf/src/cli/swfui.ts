// swfui renders named UI skin symbols (Flex `_embed_css_` classes) of a SWF into one PNG per symbol plus
// an index.json { "<lib>/<symbol>": {w, h, ox, oy} }. The legacy main client is XOR[1,2,0]-wrapped: pass -xor 1,2,0.
// Usage: swfui -out DIR [-xor 1,2,0] [-match REGEX] <file>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseFlags } from '../flags.js';
import { encodeRGBA } from '../png.js';
import { SymbolLibrary } from '../sheet/compose.js';
import { parse } from '../swf/reader.js';

const usage = 'usage: swfui -out DIR [-xor 1,2,0] [-match REGEX] <file>';
const { flags, args } = parseFlags({ out: 'out', xor: '', match: '_embed_css_' }, usage);
if (args.length !== 1) {
  console.error(usage);
  process.exit(2);
}

const raw = new Uint8Array(readFileSync(args[0]));
if (flags.xor) {
  const key = flags.xor.split(',').map(Number);
  for (let i = 0; i < raw.length; i++) raw[i] ^= key[i % key.length];
}
const lib = new SymbolLibrary(parse(raw));
const re = new RegExp(flags.match);
const index: Record<string, { w: number; h: number; ox: number; oy: number }> = {};
let empty = 0;
let partial = 0;
for (const [id, cls] of [...lib.symbols].sort((a, b) => a[1].localeCompare(b[1]))) {
  if (!re.test(cls)) continue;
  let key = shortName(cls);
  if (key in index || key.endsWith('/_')) key += `${id}`;
  const c = lib.compose(id);
  if (!c) {
    empty++;
    continue;
  }
  if (c.skipped > 0) partial++;
  const file = join(flags.out, `${key}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodeRGBA(c.image));
  index[key] = { w: c.image.width, h: c.image.height, ox: c.ox, oy: c.oy };
}
mkdirSync(flags.out, { recursive: true });
writeFileSync(join(flags.out, 'index.json'), JSON.stringify(index, null, 1));
console.log(`${Object.keys(index).length} symbols written (${partial} with unsupported parts skipped), ${empty} empty`);

// "MMO_Game_Main_O91a__embed_css__style_MainStage_CharInfo_swf_HPBar_1254231858" -> "MainStage_CharInfo/HPBar"
function shortName(cls: string): string {
  const body = cls.replace(/^.*?_embed_css_+(style_)?/, '').replace(/_-?\d+$/, '');
  const at = body.indexOf('_swf_');
  if (at < 0) return body;
  return `${body.slice(0, at)}/${body.slice(at + 5).replace(/^_+/, '') || '_'}`;
}
