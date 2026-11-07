// swf2sheet converts one bitmap-based animation SWF into WebP atlas pages + JSON (see sheet/sheet.ts).
// Usage: swf2sheet [-cache DIR] -out DIR [-name NAME] [-maxw N] <file-or-md5>

import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { DEFAULT_CACHE, MD5_RE, parseFlags } from '../flags.js';
import { convert } from '../sheet/sheet.js';
import { parse } from '../swf/reader.js';

const usage = 'usage: swf2sheet [-cache DIR] -out DIR [-name NAME] [-maxw N] <file-or-md5>';
const { flags, args } = parseFlags({ cache: DEFAULT_CACHE, out: 'out', name: '', maxw: 2048 }, usage);
if (args.length !== 1) {
  console.error(usage);
  process.exit(2);
}
const path = MD5_RE.test(args[0]) ? join(flags.cache, args[0]) : args[0];
const name = flags.name || basename(path, extname(path));
try {
  const res = await convert(parse(readFileSync(path)), flags.out, name, flags.maxw);
  console.log(
    `${name}: ${res.images} images, ${res.anims} anims, ${res.frames} frames, atlas ${res.pages} page(s) ${res.width}x${res.height}, ${res.skipped} unsupported objects`,
  );
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
