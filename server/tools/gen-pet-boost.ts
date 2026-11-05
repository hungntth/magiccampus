// One-off generator for packages/shared/src/petBoostData.ts (client static tables of the M12 guard / talent / pet stone windows).
// Source: Mongo data_tbl_pet_talent, data_tbl_pet_stone, data_tbl_pet_guard and data_tbl_skill (the refine skill pools). Re-run after
// `pnpm import:seeds` changed them. Usage: pnpm --filter @mc/server exec tsx tools/gen-pet-boost.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const OUT = resolve(__dirname, '../../packages/shared/src/petBoostData.ts');
type Raw = Record<string, unknown>;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => JSON.stringify(v === null || v === undefined ? '' : String(v));

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const db = client.db();
    const talents = (await db.collection('data_tbl_pet_talent').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const stones = (await db.collection('data_tbl_pet_stone').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const guards = (await db.collection('data_tbl_pet_guard').find({}).sort({ sid: 1, lev: 1 }).toArray()) as Raw[];
    const skills = (await db.collection('data_tbl_skill').find({}).toArray()) as Raw[];

    const talentRows = talents.map((r) => `  [${num(r.id)}, ${num(r.sid)}, ${num(r.lv)}, ${num(r.exp)}, ${num(r.up_exp)}, ${num(r.p)}, `
      + `${num(r.prop_type)}, ${num(r.prop_val)}, ${num(r.basic_tid)}, ${str(r.name)}, ${str(r.desc)}, ${str(r.icon_code)}],`);
    const stoneRows = stones.map((r) => `  [${num(r.id)}, ${str(r.name)}, ${str(r.icon_code)}, ${num(r.level)}, ${num(r.next_id)}, ${num(r.cost_sil)}, `
      + `${num(r.prop_type)}, ${num(r.prop_num)}, ${num(r.energy_flag)}, ${num(r.energy_id)}, ${num(r.resolve_num)}],`);
    const guardRows = guards.map((r) => `  [${num(r.sid)}, ${num(r.lev)}, ${num(r.num)}, ${num(r.gold)}],`);

    // Refine pools of changePetStoneEnergy: passive = skills with ex_stone_sid > 0, special = their targets.
    const byId = new Map<number, Raw>(skills.map((s) => [num(s.id), s]));
    const ids = new Set<number>();
    for (const s of skills) {
      const target = num(s.ex_stone_sid);
      if (target <= 0) continue;
      ids.add(num(s.id));
      if (byId.has(target)) ids.add(target);
    }
    const skillRows = [...ids].sort((a, b) => a - b).map((id) => {
      const s = byId.get(id)!;
      return `  [${id}, ${str(s.name)}, ${str(s.icon_code)}, ${str(s.description)}],`;
    });

    const out = [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-pet-boost.ts',
      '// Source: Mongo data_tbl_pet_talent / data_tbl_pet_stone / data_tbl_pet_guard / data_tbl_skill (seed import). Row layouts: petBoostStatic.ts.',
      '',
      "import type { PetGuardCostRow, PetStoneRow, PetStoneSkillRow, PetTalentRow } from './petBoostStatic.js';",
      '',
      'export const PET_TALENT_ROWS: readonly PetTalentRow[] = [',
      ...talentRows,
      '];',
      '',
      'export const PET_STONE_ROWS: readonly PetStoneRow[] = [',
      ...stoneRows,
      '];',
      '',
      'export const PET_GUARD_COST_ROWS: readonly PetGuardCostRow[] = [',
      ...guardRows,
      '];',
      '',
      'export const PET_STONE_SKILL_ROWS: readonly PetStoneSkillRow[] = [',
      ...skillRows,
      '];',
      '',
    ].join('\n');
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT} (${talentRows.length} talents, ${stoneRows.length} stones, ${guardRows.length} guard rows, ${skillRows.length} skills)`);
  } finally {
    await client.close();
  }
}

void main();
