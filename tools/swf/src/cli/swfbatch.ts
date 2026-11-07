// swfbatch converts every convertible SWF in the cache (per swfscan.tsv) into sheets.
// Output name = logical path without "resource/" and ".swf" (slashes kept as directories),
// or the md5 for unnamed blobs. Writes <out>/manifest.json: { "<logical or md5>": { ... } }.
// Conversions run on worker threads; this file is both the coordinator and the worker.
//
// Usage: swfbatch [-cache DIR] [-scan swfscan.tsv] [-out DIR] [-only creature,equip] [-workers N]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { DEFAULT_CACHE, parseFlags } from '../flags.js';
import { goJSON } from '../gojson.js';
import { convert } from '../sheet/sheet.js';
import { parse } from '../swf/reader.js';

interface Entry {
  md5: string;
  name: string;
  category: string;
  sheet?: string;
  images?: number;
  anims?: number;
  skipped?: number;
  error?: string;
}

interface WorkerInit {
  cache: string;
  out: string;
}

if (isMainThread) {
  await main();
} else {
  const { cache, out } = workerData as WorkerInit;
  parentPort!.on('message', ({ i, job }: { i: number; job: Entry }) => {
    void convertOne(job, cache, out).then((result) => parentPort!.postMessage({ i, result }));
  });
}

async function main(): Promise<void> {
  const { flags } = parseFlags(
    { cache: DEFAULT_CACHE, scan: 'swfscan.tsv', out: '../../client/public/sheets', only: '', workers: 8 },
    'usage: swfbatch [-cache DIR] [-scan swfscan.tsv] [-out DIR] [-only creature,equip,item,effect,scene,tile,unnamed] [-workers N]',
  );
  let raw: string;
  try {
    raw = readFileSync(flags.scan, 'utf8');
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const families = new Set(flags.only.split(',').filter(Boolean));
  const jobs: Entry[] = [];
  raw
    .trim()
    .split('\n')
    .slice(1)
    .forEach((line) => {
      const cols = line.split('\t');
      if (cols.length < 3) return;
      const e: Entry = { md5: cols[0], name: cols[1], category: cols[2] };
      if (!e.category.startsWith('bitmap') && e.category !== 'mixed') return;
      const parts = e.name.split('/');
      const fam = e.name !== '' && parts.length >= 2 ? parts[1] : 'unnamed';
      if (families.size > 0 && !families.has(fam)) return;
      jobs.push(e);
    });

  const results = await runPool(jobs, Math.max(1, flags.workers), { cache: flags.cache, out: flags.out });

  const manifest = new Map<string, Entry>();
  let ok = 0;
  let failed = 0;
  for (const r of results) {
    manifest.set(r.name || r.md5, r);
    if (r.error) failed++;
    else ok++;
  }
  mkdirSync(flags.out, { recursive: true });
  try {
    writeFileSync(join(flags.out, 'manifest.json'), goJSON(manifest, ' '));
  } catch (e) {
    console.error((e as Error).message);
  }
  console.log(`converted ${ok}, failed ${failed} -> ${flags.out}`);
}

function runPool(jobs: Entry[], size: number, init: WorkerInit): Promise<Entry[]> {
  const results: Entry[] = new Array(jobs.length);
  if (jobs.length === 0) return Promise.resolve(results);
  return new Promise((resolve, reject) => {
    let next = 0;
    let done = 0;
    const workers = Array.from({ length: Math.min(size, jobs.length) }, () => {
      const w = new Worker(new URL(import.meta.url), { workerData: init });
      w.on('error', reject);
      w.on('message', ({ i, result }: { i: number; result: Entry }) => {
        results[i] = result;
        done++;
        if (done === jobs.length) {
          for (const x of workers) void x.terminate();
          resolve(results);
        } else {
          feed(w);
        }
      });
      return w;
    });
    const feed = (w: Worker) => {
      if (next < jobs.length) {
        w.postMessage({ i: next, job: jobs[next] });
        next++;
      }
    };
    workers.forEach(feed);
  });
}

async function convertOne(e: Entry, cache: string, out: string): Promise<Entry> {
  try {
    const f = parse(readFileSync(join(cache, e.md5)));
    const rel = e.name ? e.name.replace(/^resource\//, '').replace(/\.swf$/, '') : e.md5;
    const res = await convert(f, join(out, dirname(rel)), basename(rel), 2048);
    return {
      ...e,
      sheet: rel.replaceAll('\\', '/'),
      images: res.images || undefined,
      anims: res.anims || undefined,
      skipped: res.skipped || undefined,
    };
  } catch (err) {
    return { ...e, error: (err as Error).message };
  }
}
