// swfinfo prints a JSON structural summary of one or more SWF files (or md5 blobs from the cache).
// Usage: swfinfo [-cache DIR] [-brief] <file-or-md5> ...

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CACHE, MD5_RE, parseFlags } from '../flags.js';
import { goJSON } from '../gojson.js';
import { parse } from '../swf/reader.js';
import { summarize } from '../swf/summary.js';

const usage = 'usage: swfinfo [-cache DIR] [-brief] <file-or-md5> ...';
const { flags, args } = parseFlags({ cache: DEFAULT_CACHE, brief: false }, usage);
if (args.length === 0) {
  console.error(usage);
  process.exit(2);
}
for (const arg of args) {
  const path = MD5_RE.test(arg) ? join(flags.cache, arg) : arg;
  try {
    const sum = summarize(parse(readFileSync(path)));
    if (flags.brief) {
      sum.sprites = null;
      sum.shapeIds = sum.bitmapIds = sum.morphIds = undefined;
    }
    console.log(goJSON({ file: arg, summary: sum }, '  '));
  } catch (e) {
    console.error(`${arg}: ${(e as Error).message}`);
  }
}
