// NPC skill catalogue (M10 E2.0): a TBL_SKILL row (+ its TBL_BUFF row) as the battle engine runs it, port of Go
// application/combat skill_adapter.go buildSkillInfoFromGamedata / buildTableBuffDef / buffStatusEffect and the boss
// special rule (skill_boss_special.go). Pure; CombatData wires the gamedata lookups. NPC damage takes Go's description
// ratio (player skills keep exp_skill, CORE_LOOP decision 4: NPC rows carry upgrade costs up to 2.48e9 in exp_skill).

import { skillMpCost } from '@mc/shared';
import type { SkillTemplate } from '../../gamedata/skill-data';
import type { SkillSpec } from '../damage';
import {
  descriptionTargets, immunityProps, isKillText, normalizeText, parseDamageRatio, parseDot, parseHot, type DotDef, type HotDef,
} from './skill-text';

/** Go combat.TargetType subset reachable from data target_type (mapCombatTargetType). */
export type TargetKind =
  | 'self' | 'selfPlayer' | 'selfPet' | 'enemy' | 'enemyPlayer' | 'enemyCreature' | 'enemyNoBoss'
  | 'team' | 'teamPlayer' | 'teamPet' | 'any' | 'player';
/** Go AreaType: none, Vertical, Horizontal, Cross, Random, Multi (nearest by position). */
export type AreaKind = '' | 'V' | 'H' | 'C' | 'R' | 'M';

export interface BuffMod {
  prop: number;
  value: number;
  percent: boolean;
}

/** A TBL_BUFF row as it lands in battle: stat mods, DOT / HOT, or a battle status (control / silence). */
export interface BuffDef {
  id: number;
  icon: string;
  rounds: number;
  mods: BuffMod[];
  dot?: DotDef;
  hot?: HotDef;
  status?: number; // StatusEffect type (10 dizzy … 120 bind); set = goes through the status layer
  mpBurn?: number; // M13 G2: % of the holder's current MP lost at each later turn start (fairy Bí Diệm proc)
}

export type NpcSkillKind = 'damage' | 'heal' | 'state' | 'passive' | 'unsupported';

export interface NpcSkill {
  id: number;
  name: string;
  type: number; // TBL_SKILL type
  kind: NpcSkillKind;
  approach: boolean; // type 1: runs to the target (range 1)
  physical: boolean; // bid 3 cast (Go SkillTypePhysical), else bid 7
  spec: SkillSpec;
  target: TargetKind;
  area: AreaKind;
  areaSize: number;
  hits: number; // attack_num
  useMp: number;
  buff?: { def: BuffDef; rate: number }; // rate in [0, 1]
  kill?: boolean; // type 23 "giết chết N mục tiêu": the hit takes the whole HP of a non-boss target
  maxHpPct?: { max: number; min: number }; // Diệt Thần Trảm 5879 / 6011
}

export type Row = Record<string, unknown>;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const STATUS_STATES = new Set([10, 20, 30, 50, 60, 70, 80, 90, 100, 110, 120]);
export const STATUS = { DIZZY: 10, CONFUSION: 20, SLEEP: 30, ICE: 60, LIGHT: 70, SILENCE: 80, REBELLION: 90, STONE: 100, TAUNT: 110, BIND: 120 } as const;
const DIET_THAN_TRAM = new Set([5879, 6011]);

/** Go buildTableBuffDef + buffStatusEffect + the support text rules (DOT / HOT / immunity). */
export function buildBuffDef(row: Row, rounds: number): BuffDef {
  const kind = num(row.kind);
  const state = num(row.state);
  const percent = num(row.percent_flag) === 1;
  const mods: BuffMod[] = [];
  for (let i = 1; i <= 6; i++) {
    const prop = num(row[`prop${i}`]);
    const value = num(row[`prop_num${i}`]);
    if (prop > 0 && value !== 0) mods.push({ prop, value, percent });
  }
  const text = String(row.description ?? '');
  for (const prop of immunityProps(text)) mods.push({ prop, value: 1, percent: false });
  const def: BuffDef = { id: num(row.id), icon: String(row.icon_code ?? '0'), rounds, mods };
  if (kind === 10) def.status = STATUS.SILENCE;
  else if (kind === 1 && STATUS_STATES.has(state)) def.status = state;
  const dot = state === 40 || kind === 5 ? parseDot(text) : null;
  if (dot) def.dot = dot;
  const hot = parseHot(text, kind);
  if (hot) def.hot = hot;
  return def;
}

function targetKind(t: number, heal: boolean): TargetKind {
  const map: Record<number, TargetKind> = {
    1: 'self', 2: 'selfPlayer', 3: 'selfPet', 4: 'enemy', 5: 'enemyPlayer', 6: 'enemyCreature', 7: 'enemyNoBoss', 8: 'team',
    9: 'teamPlayer', 10: 'teamPet', 11: 'any', 12: 'player', 13: 'team', 14: 'team',
  };
  const k = map[t] ?? 'enemy';
  return heal && k === 'any' ? 'team' : k;
}

const AREA: Record<number, AreaKind> = { 1: 'V', 2: 'H', 3: 'C', 4: 'R' };
const DAMAGE_TYPES = new Set([1, 2, 3, 4, 8, 23]);

/** Go mapSkillType → kind; 7 (cleanse), 10 (guard) and unknown types are not cast by H5 NPCs. */
function kindOf(type: number): NpcSkillKind {
  if (DAMAGE_TYPES.has(type)) return 'damage';
  if (type === 5 || type === 9) return 'heal';
  if (type === 6) return 'state';
  if (type === 11) return 'passive';
  return 'unsupported';
}

/** Builds the runtime skill; `buffRow(id)` resolves TBL_BUFF rows. */
export function buildNpcSkill(tpl: SkillTemplate, buffRow: (id: number) => Row | undefined): NpcSkill {
  const kind = kindOf(tpl.type);
  const text = normalizeText(tpl.description);
  let magic = tpl.type === 3 || tpl.type === 4 || tpl.type === 5 || tpl.type === 9 || (tpl.type === 23 && text.includes('ma pháp'));
  // Go generic numbers: flat 10, × 1 + req_level / 200 (cap 2), scaled per level for rows without a text ratio.
  let base = 10;
  let mult = 1 + Math.min(200, Math.max(0, tpl.reqLevel)) / 200;
  const ratio = tpl.type === 1 || tpl.type === 2 || tpl.type === 3 || tpl.type === 4 || tpl.type === 23 ? parseDamageRatio(tpl.description) : null;
  if (ratio) {
    base = ratio.flat;
    mult = ratio.ratio;
    if (ratio.kind) magic = ratio.kind === 'magic';
  } else if (tpl.level > 1) {
    const bonus = 1 + (tpl.level - 1) * 0.1;
    base = Math.trunc(base * bonus);
    mult *= bonus;
  }
  const heal = kind === 'heal';
  let area: AreaKind = AREA[tpl.areaAttack] ?? '';
  let areaSize = Math.max(1, tpl.targetNum);
  if (area === '' && tpl.targetNum > 1) {
    if (kind === 'state' || heal) area = 'M';
    else if (DAMAGE_TYPES.has(tpl.type) && tpl.type !== 8) {
      const dt = descriptionTargets(tpl.description);
      if (dt && (dt.all || dt.count > 1)) area = dt.random ? 'R' : 'M';
    }
  }
  const sk: NpcSkill = {
    id: tpl.id, name: tpl.name, type: tpl.type, kind, approach: tpl.type === 1, physical: !magic && kind === 'damage',
    spec: { magic, mult, base, ranged: tpl.type !== 1 }, target: targetKind(tpl.targetType, heal), area, areaSize,
    hits: Math.max(1, Math.trunc(tpl.attackNum)), useMp: tpl.useMp,
  };
  if (tpl.type === 23) {
    if (isKillText(tpl.description)) {
      if (DIET_THAN_TRAM.has(tpl.id)) sk.maxHpPct = { max: 0.95, min: 0.7 };
      else sk.kill = true;
    }
    const dt = area !== '' ? descriptionTargets(tpl.description) : null;
    if (dt && !dt.all && dt.count > 0 && dt.count < areaSize) sk.areaSize = dt.count;
  }
  const row = tpl.buffId > 0 ? buffRow(tpl.buffId) : undefined;
  if (row && kind !== 'passive') sk.buff = { def: buildBuffDef(row, tpl.buffRound), rate: tpl.buffRate / 100 };
  return sk;
}

/** MP a cast costs this caster (fraction rows scale with its max MP). */
export const npcSkillCost = (sk: NpcSkill, mpMax: number): number => skillMpCost(sk.useMp, mpMax);

/** Go npcSupportTarget: skills that act on the caster or its side. */
export const supportTarget = (t: TargetKind): boolean => t === 'self' || t === 'selfPlayer' || t === 'team' || t === 'teamPlayer';
export const selfOnly = (t: TargetKind): boolean => t === 'self' || t === 'selfPlayer';
