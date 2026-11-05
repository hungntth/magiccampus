// Walks the authored boss kits (E2.1-E2.10 pools / openers / rotations) and every data_tbl_creature_skill pool through
// buildNpcSkill over the legacy seed dumps (SEED_DIR, default ../mcgame/supabase/seeds; skipped when absent) and fails on a
// kit skill the engine cannot run. Creature pools may hold cleanse (7) / guard (10) / type 13 rows: the AI skips those.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseFile, toDocs } from '../../../../tools/seed-parser';
import { buildSkillTable } from '../../gamedata/skill-data';
import { CREATURE_ROTATIONS } from './npc-ai';
import { buildNpcSkill, type Row } from './npc-skills';

const SEEDS = path.resolve(process.env.SEED_DIR ?? path.join(__dirname, '../../../../../../mcgame/supabase/seeds'));

/** Skill ids the feature configs pin (extend with each tower / boss phase). */
export const KIT_SKILLS: readonly number[] = [
  6023, 5938, 5937, // world boss Hydra pool (domain/worldboss/config.go)
  ...Object.values(CREATURE_ROTATIONS).flat(2), // Rada 2196 rotation
  6008, 6007, 6006, 6011, 6010, // Mehdi 1304 (nine boss floor 8)
  5981, 5982, // Chu Ma / clone (nine boss floor 3)
  6638, 6642, 6644, 6648, 6646, // corridor openers (application/corridor/kits.go)
];

function rows(file: string): Row[] {
  const p = path.join(SEEDS, file);
  return existsSync(p) ? parseFile(readFileSync(p, 'utf8')).flatMap((ins) => toDocs(ins) as Row[]) : [];
}

describe('boss kits', { skip: !existsSync(path.join(SEEDS, 'data_tbl_skill.sql')) && 'legacy seeds not found' }, () => {
  const skills = buildSkillTable(rows('data_tbl_skill.sql'));
  const buffs = new Map(rows('data_tbl_buff.sql').map((r) => [Number(r.id), r]));
  const build = (id: number) => {
    const t = skills.get(id);
    return t ? buildNpcSkill(t, (b) => buffs.get(b)) : undefined;
  };

  it('every pinned kit skill exists and is a damage / heal / state skill', () => {
    const bad = KIT_SKILLS.filter((id) => !['damage', 'heal', 'state'].includes(build(id)?.kind ?? 'missing'));
    assert.deepEqual(bad, []);
  });
  it('creature_skill pools: only passives, cleanse, guard and type 13 rows are left to the AI to skip', () => {
    const pools = [...rows('data_tbl_creature_skill.sql'), ...rows('data_tbl_creature_skill_lietdiem.sql'), ...rows('data_tbl_creature_skill_mehdi.sql')];
    const types = new Set<number>();
    for (const r of pools) {
      const sk = build(Number(r.sid));
      if (sk && sk.kind === 'unsupported') types.add(sk.type);
    }
    assert.deepEqual([...types].filter((t) => ![7, 10, 13].includes(t)), []);
  });
});
