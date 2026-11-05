// One-off generator for packages/shared/src/petHandbookData.ts (client static tables of the M12 evolution windows).
// Source: the imported Mongo collections data_tbl_creature_handbook, data_tbl_creature (the related / evolved creatures) and
// data_tbl_pet_contract. Re-run after `pnpm import:seeds` changed them. Usage: tsx tools/gen-pet-handbook.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const OUT = resolve(__dirname, '../../packages/shared/src/petHandbookData.ts');
type Raw = Record<string, unknown>;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const APT_COLUMNS = ['apt_strength', 'apt_agility', 'apt_stamina', 'apt_intelligence', 'apt_energy'] as const;

function creatureOf(row: Raw | undefined, id: number): string {
  if (!row) throw new Error(`creature ${id} missing`);
  return JSON.stringify({ name: String(row.name), icon: String(row.icon_code), apt: APT_COLUMNS.map((c) => num(row[c])) });
}

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const db = client.db();
    const handbook = (await db.collection('data_tbl_creature_handbook').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const creatures = new Map<number, Raw>();
    for (const row of (await db.collection('data_tbl_creature').find({}).toArray()) as Raw[]) creatures.set(num(row.id), row);
    const contracts = (await db.collection('data_tbl_pet_contract').find({}).sort({ id: 1 }).toArray()) as Raw[];

    const entries = handbook.map((h) => {
      const evo = num(h.evolution_id);
      return `  { id: ${num(h.id)}, classId: ${num(h.class_id)}, relateId: ${num(h.relate_id)}, evolutionId: ${evo}, name: ${JSON.stringify(String(h.name))}, `
        + `desc: ${JSON.stringify(String(h.discription ?? ''))}, activeNum: ${num(h.active_num1)}, propType: ${num(h.prop_type)}, propNum: ${num(h.prop_num)}, `
        + `percent: ${num(h.percent_flag) === 1}, creature: ${creatureOf(creatures.get(num(h.relate_id)), num(h.relate_id))}, `
        + `evolved: ${evo > 0 ? creatureOf(creatures.get(evo), evo) : 'null'} },`;
    });
    const rows = contracts.map((c) => `  { level: ${num(c.id)}, reqNum: ${num(c.req_num)}, reqExp: ${num(c.req_exp)}, `
      + `nums: [${[1, 2, 3, 4].map((i) => num(c[`prop_num${i}`])).join(', ')}], extras: [${[1, 2, 3, 4].map((i) => num(c[`extra_num${i}`])).join(', ')}] },`);

    const out = [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-pet-handbook.ts',
      '// Source: Mongo data_tbl_creature_handbook (+ data_tbl_creature name / icon_code / apt_*) and data_tbl_pet_contract (seed import).',
      '',
      "import type { PetContractDef, PetHandbookDef } from './petHandbook.js';",
      '',
      'export const PET_HANDBOOK_ENTRIES: readonly PetHandbookDef[] = [',
      ...entries,
      '];',
      '',
      '/** Index = level - 1 (levels 1..50). */',
      'export const PET_CONTRACT_TABLE: readonly PetContractDef[] = [',
      ...rows,
      '];',
      '',
    ].join('\n');
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT} (${entries.length} handbook entries, ${rows.length} contract levels)`);
  } finally {
    await client.close();
  }
}

void main();
