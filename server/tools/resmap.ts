// Builds resmap.json: md5 blob name -> logical asset path, by scanning every numeric that looks like
// a resource code in the imported data_tbl_* collections (plus known suffix variants such as
// "_NEW.swf" weapon overlays and MAP_x_y.jpg tiles) and keeping the ones present in ASSET_DIR.
// Usage: pnpm resmap  (writes server/resmap.json)

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MongoClient, type Document } from 'mongodb';
import { decodeResCode, hashPath, ROOT_ICON, ROOT_RES } from '@mc/shared';

const MIN_CODE = 1_000_000_000_000;
const MAX_CODE = 9_999_999_999_999;

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame';
  const assetDir = path.resolve(process.env.ASSET_DIR ?? '../mcgame/frontend/s/res');
  const present = new Set(fs.readdirSync(assetDir));
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  const codes = new Set<number>();
  const collections = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => n.startsWith('data_'));
  for (const name of collections) {
    for await (const doc of db.collection<Document>(name).find()) collect(doc, codes);
  }
  await client.close();

  const candidates = new Map<string, string>();
  const add = (logical: string) => {
    const h = hashPath(logical);
    if (present.has(h) && !candidates.has(h)) candidates.set(h, logical);
  };
  for (const code of codes) {
    const d = decodeResCode(code);
    if (!d.path) continue;
    add(ROOT_RES + d.path);
    add(ROOT_ICON + d.path);
    if (d.ext === 1) {
      for (const ext of ['.swf', '.jpg', '.png']) {
        add(`${ROOT_RES}${d.path}${ext}`);
        add(`${ROOT_ICON}${d.path}${ext}`);
      }
      add(`${ROOT_RES}${d.path}_NEW.swf`);
      for (let r = 0; r < 60; r++) for (let c = 0; c < 60; c++) add(`${ROOT_RES}${d.path}/MAP_${c}_${r}.jpg`);
      add(`${ROOT_RES}${d.path}/MAP_HIT_NEW.swf`);
    } else {
      add(`${ROOT_RES}${d.path.replace(/\.\w+$/, '')}_NEW.swf`);
    }
  }
  const sorted = Object.fromEntries([...candidates.entries()].sort((a, b) => a[1].localeCompare(b[1])));
  const outFile = path.resolve('resmap.json');
  fs.writeFileSync(outFile, JSON.stringify(sorted, null, 1));
  const swfCount = Object.values(sorted).filter((p) => p.endsWith('.swf')).length;
  console.log(`codes scanned: ${codes.size}, blobs in cache: ${present.size}, mapped: ${candidates.size} (${swfCount} swf) -> ${outFile}`);
}

function collect(value: unknown, out: Set<number>): void {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= MIN_CODE && value <= MAX_CODE) out.add(value);
    return;
  }
  if (typeof value === 'string') {
    for (const m of value.match(/\d{13}/g) ?? []) {
      const n = Number(m);
      if (n >= MIN_CODE && n <= MAX_CODE) out.add(n);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collect(v, out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
