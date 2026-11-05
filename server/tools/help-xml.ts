// One-off converter (M9 phase G): legacy profile/help.xml -> client/public/help/help.json for the H5 help window.
// Usage: pnpm --filter @mc/server help:xml [path/to/help.xml]  (default <legacy>/frontend/s/sv/profile/help.xml).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseHelpXml } from './help-xml/convert';

const src = resolve(process.argv[2] ?? 'E:/mcgame/frontend/s/sv/profile/help.xml');
const out = resolve(__dirname, '../../client/public/help/help.json');
const nodes = parseHelpXml(readFileSync(src, 'utf8'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(nodes)}\n`);
console.log(`help.json: ${nodes.length} nodes -> ${out}`);
