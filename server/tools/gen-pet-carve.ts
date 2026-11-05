// One-off generator for packages/shared/src/petCarveData.ts (client static tables of the M12 Khong Gian Dieu Khac window).
// Source: Mongo data_tbl_carve (960 nodes), data_tbl_carve_award (150 floors) and data_tbl_carve_master (48 rows), plus the reward item
// names / icons from data_tbl_item_template. Re-run after `pnpm import:seeds` changed them.
// Usage: pnpm --filter @mc/server exec tsx tools/gen-pet-carve.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const OUT = resolve(__dirname, '../../packages/shared/src/petCarveData.ts');
type Raw = Record<string, unknown>;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => JSON.stringify(v === null || v === undefined ? '' : String(v));

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const db = client.db();
    const carve = (await db.collection('data_tbl_carve').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const award = (await db.collection('data_tbl_carve_award').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const master = (await db.collection('data_tbl_carve_master').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const items = new Map<number, Raw>();
    const ids = award.map((r) => num(r.item_id));
    for (const it of (await db.collection('data_tbl_item_template').find({ id: { $in: ids } }).toArray()) as Raw[]) items.set(num(it.id), it);
    const carveLines = carve.map((r) => `  [${num(r.id)}, ${num(r.costkp)}, ${num(r.p)}, ${num(r.pv)}],`);
    const awardLines = award.map((r) => {
      const it = items.get(num(r.item_id));
      return `  [${num(r.id)}, ${num(r.award)}, ${num(r.free_exchagne)}, ${num(r.pay_exchange_time)}, ${num(r.item_id)}, ${str(it?.name)}, ${str(it?.icon_code)}],`;
    });
    const masterLines = master.map((r) => `  [${num(r.id)}, ${[1, 2, 3, 4, 5].map((i) => `${num(r[`p${i}`])}, ${num(r[`pv${i}`])}`).join(', ')}],`);
    const out = [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-pet-carve.ts',
      '// Source: Mongo data_tbl_carve / data_tbl_carve_award / data_tbl_carve_master (seed import). Row layouts: petCarve.ts.',
      '',
      "import type { CarveAwardRaw, CarveMasterRaw, CarveNodeRaw } from './petCarve.js';",
      '',
      'export const CARVE_NODE_ROWS: readonly CarveNodeRaw[] = [',
      ...carveLines,
      '];',
      '',
      'export const CARVE_AWARD_ROWS: readonly CarveAwardRaw[] = [',
      ...awardLines,
      '];',
      '',
      'export const CARVE_MASTER_ROWS: readonly CarveMasterRaw[] = [',
      ...masterLines,
      '];',
      '',
    ].join('\n');
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT} (${carveLines.length} nodes, ${awardLines.length} floors, ${masterLines.length} masters)`);
  } finally {
    await client.close();
  }
}

void main();
