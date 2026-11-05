// One-off generator for packages/shared/src/petFeatherSteps.ts (Vu Hoa aptitude table, M12 phase B).
// Source: the legacy Go table E:\mcgame\internal\application\pet\evolution_feather_steps.json, which is
// GamePredef.PET_ENVOLUTION_FEATHER_STEP[evolvedCreatureId][attr][round][stage] plus 2332 Kim Lan (= 2293 with Luc and Tri
// swapped, built by the legacy patch_kimlanfeather.go). Usage: tsx tools/gen-pet-feather.ts [path/to/evolution_feather_steps.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_SRC = 'E:/mcgame/internal/application/pet/evolution_feather_steps.json';
const OUT = resolve(__dirname, '../../packages/shared/src/petFeatherSteps.ts');

type Table = number[][][]; // [attr 5][round 3][stage 10]

function validate(id: string, t: Table): void {
  const ok = Array.isArray(t) && t.length === 5 && t.every((a) => a.length === 3 && a.every((r) => r.length === 10 && r.every(Number.isInteger)));
  if (!ok) throw new Error(`creature ${id}: expected [5][3][10] integers`);
}

function main(): void {
  const src = process.argv[2] ?? DEFAULT_SRC;
  const raw = JSON.parse(readFileSync(src, 'utf8')) as Record<string, Table>;
  const ids = Object.keys(raw).sort((a, b) => Number(a) - Number(b));
  // 2332 must be 2293 with attrs 0 (Luc) and 3 (Tri) swapped, as the legacy server builds it.
  const a = raw['2293'];
  const b = raw['2332'];
  if (a && b) {
    const expect = [a[3], a[1], a[2], a[0], a[4]];
    if (JSON.stringify(expect) !== JSON.stringify(b)) throw new Error('2332 is not 2293 with Luc/Tri swapped');
  }
  const lines = ids.map((id) => {
    validate(id, raw[id]);
    return `  ${id}: ${JSON.stringify(raw[id])},`;
  });
  const out = [
    '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-pet-feather.ts [source.json]',
    '// Source: E:\\mcgame\\internal\\application\\pet\\evolution_feather_steps.json = GamePredef.PET_ENVOLUTION_FEATHER_STEP',
    '// [evolved creature id][attr][round][stage]. attr order 0 Luc(str), 1 Nhan(sta), 2 Xao(agi), 3 Tri(int), 4 Than(eng).',
    '// Values are the total Vu Hoa aptitude at that round/stage. 2332 Kim Lan = 2293 with Luc and Tri swapped.',
    '',
    'export type PetFeatherTable = readonly (readonly (readonly number[])[])[];',
    '',
    'export const PET_FEATHER_STEPS: Readonly<Record<number, PetFeatherTable>> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
  writeFileSync(OUT, out);
  console.log(`wrote ${OUT} (${ids.length} creatures)`);
}

main();
