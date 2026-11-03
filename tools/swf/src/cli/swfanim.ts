// swfanim renders a vector SWF with nested animated sprites (transport gates, ...) frame by frame into a
// sheet (PNG atlas + JSON, anim "default"); see sheet/anim.ts. With -manifest the sheet is registered
// in the sheet manifest (category "vector-anim", sheet id "<basename of -out>/<name>").
// Usage: swfanim [-cache DIR] -out DIR [-frames N] [-name NAME] [-manifest FILE -key LOGICAL] <md5|file>

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { DEFAULT_CACHE, MD5_RE, parseFlags } from '../flags.js';
import { goJSON } from '../gojson.js';
import { renderAnim } from '../sheet/anim.js';
import { parse } from '../swf/reader.js';

const usage = 'usage: swfanim [-cache DIR] -out DIR [-frames N] [-name NAME] [-manifest FILE -key LOGICAL] <md5|file>';
const { flags, args } = parseFlags({ cache: DEFAULT_CACHE, out: 'out', frames: 0, name: '', manifest: '', key: '' }, usage);
if (args.length !== 1) {
  console.error(usage);
  process.exit(2);
}
const isMd5 = MD5_RE.test(args[0]);
const path = isMd5 ? join(flags.cache, args[0]) : args[0];
const name = flags.name || (isMd5 ? args[0] : basename(path, extname(path)));
try {
  const res = renderAnim(parse(new Uint8Array(readFileSync(path))), flags.out, name, flags.frames);
  console.log(
    `${name}: ${res.frames} frames, ${res.images} images, atlas ${res.atlasWidth}x${res.atlasHeight}, ` +
      `${res.skipped} unsupported objects` + (res.localizerY === undefined ? '' : `, localizerY ${res.localizerY}`),
  );
  if (flags.manifest) {
    if (!flags.key) throw new Error('-manifest needs -key (logical name, e.g. resource/item/X.swf)');
    const text = readFileSync(flags.manifest, 'utf8');
    const manifest = new Map(Object.entries(JSON.parse(text) as Record<string, unknown>));
    manifest.set(flags.key, {
      md5: isMd5 ? args[0] : '',
      name: flags.key,
      category: 'vector-anim',
      sheet: `${basename(flags.out)}/${name}`,
      images: res.images,
      anims: 1,
      skipped: res.skipped > 0 ? res.skipped : undefined,
    });
    const out = goJSON(manifest, ' ');
    const crlf = text.includes('\r\n'); // keep the file's line endings
    writeFileSync(flags.manifest, crlf ? out.replace(/\n/g, '\r\n') : out);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
