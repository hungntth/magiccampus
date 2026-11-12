// Guarding fairy active skills in battle (M13 G2), pure part: port of Go application/combat/fairy_battle.go (kit from the stock
// TBL_SKILL / TBL_BUFF rows) and the rules of domain/combat/fairy_skill.go (rotation slot, Cổ Vũ rage). The rotation comes from
// FairySkillService.battleSkills; the engine side (turn-start cast, on-hit procs, MP burn) is fairy-battle.ts.
//   - Cast: the rotation buff through buildBuffDef (props, Thánh Ca HOT) plus the text stats Go reads from the description
//     (buff_text_stats.go / buff_support_effects.go): Đề Phúc 58, Lĩnh Vực 32, Chi Nộ 903, Chi Diệp 901 −X, Chi Ngụy life steal.
//   - Rage (Cổ Vũ "Giảm A% HP, tăng B% tấn công"): at cast, +B % attack and magic attack per A % of max HP lost.
//   - Procs (buff kind 23): the "<code_name>_b2s1" row of the same level (any type; Độc Đao 6278-6280 is type 2), keyed by the
//     owner's rotation buff id; its buff_rate is the chance. Bí Diệm's row gets the MP burn, Độc Đao's the owner's poison rule.

import type { SkillTemplate } from '../../gamedata/skill-data';
import { PROP_LIFE_STEAL } from './battle-buffs';
import { buildBuffDef, type BuffDef, type BuffMod, type Row } from './npc-skills';
import { normalizeText } from './skill-text';

export const FAIRY_ROTATION_SLOTS = 5;
export const FAIRY_PROC_BUFF_KIND = 23;
export const FAIRY_PROC_SUFFIX = '_b2s1';
/**
 * Trúng Độc 2774-2776 (Độc Đao proc): % of the target's max HP per turn, owner rule 2026-10-28 ("độc đao gây 2-3-5% hp đối thủ").
 * Go ships it as a seed overlay (data_tbl_buff_doc_dao_poison.sql: state 40 + text); the H5 import keeps the stock rows (state -1,
 * no amount), so the numbers live here.
 */
export const FAIRY_POISON_PCT: Readonly<Record<number, number>> = { 2774: 2, 2775: 3, 2776: 5 };

export interface FairyRage {
  stepPct: number; // per this much % of max HP lost …
  attackPct: number; // … this much % attack and magic attack
}

export interface FairyCast {
  skillId: number;
  name: string;
  buff: BuffDef;
  rage?: FairyRage;
}

export interface FairyProc {
  skillId: number; // the _b2s1 row
  name: string;
  buff: BuffDef;
  rate: number; // [0, 1], before the debuff accuracy / resist adjustment
}

/** Participant.Fairy (Go FairyKit): runtime state of one owner's fairy for one battle. */
export interface FairyKit {
  rotation: number[]; // FAIRY_ROTATION_SLOTS TBL_SKILL ids, 0 = empty
  casts: Map<number, FairyCast>; // by skill id
  procs: Map<number, FairyProc>; // by the owner's rotation buff id
  procRound: number; // the round the owner already rolled its procs in (first landed hit per round)
}

export interface FairyLookups {
  skill(id: number): SkillTemplate | undefined;
  buffRow(id: number): Row | undefined;
  family(codeName: string): readonly SkillTemplate[];
}

const N = '(\\d+(?:\\.\\d+)?)';
const DEBUFF_RESIST_RE = new RegExp(`tăng\\s*${N}\\s*(?:điểm\\s*)?kháng debuff|tăng\\s*${N}\\s*%\\s*khả năng kháng trạng thái có hại`, 'u');
const DEBUFF_HIT_RE = new RegExp(`tăng\\s*${N}\\s*%?\\s*debuff chính xác`, 'u');
const REFLECT_RE = new RegExp(`(?:phản xạ\\s*${N}\\s*%\\s*sát thương|chuyển\\s*${N}\\s*%\\s*sát thương phản đòn)`, 'u');
const TAKEN_DOWN_RE = new RegExp(`giảm\\s*${N}\\s*%\\s*sát thương cuối khi bị tấn công`, 'u');
const LIFE_STEAL_RE = new RegExp(`${N}\\s*%\\s*sát thương chuyển hóa thành hp`, 'u');
const RAGE_RE = new RegExp(`giảm\\s*${N}\\s*%\\s*hp,?\\s*tăng\\s*${N}\\s*%\\s*(?:lực\\s*)?tấn công`, 'u');
const MP_BURN_RE = new RegExp(`giảm\\s*${N}\\s*%\\s*mp hiện tại`, 'u');

const first = (m: RegExpExecArray | null): number => {
  const raw = m?.slice(1).find((g) => g !== undefined);
  const v = raw === undefined ? 0 : Number(raw);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** The skill of the rotation slot that casts this round: slot (round - 1) % 5; 0 = nothing. */
export function fairySkillForRound(rotation: readonly number[], round: number): number {
  if (rotation.length === 0 || round < 1) return 0;
  return rotation[(round - 1) % rotation.length] ?? 0;
}

/** Stats the buff rows keep only in their description (flat points; 901 negative = less damage taken). */
export function fairyTextMods(description: string): BuffMod[] {
  const s = normalizeText(description);
  const out: BuffMod[] = [];
  const add = (prop: number, value: number): void => {
    if (value !== 0) out.push({ prop, value, percent: false });
  };
  add(58, first(DEBUFF_RESIST_RE.exec(s)));
  add(32, first(DEBUFF_HIT_RE.exec(s)));
  add(903, first(REFLECT_RE.exec(s)));
  add(901, -first(TAKEN_DOWN_RE.exec(s)));
  add(PROP_LIFE_STEAL, first(LIFE_STEAL_RE.exec(s)));
  return out;
}

export function fairyRage(description: string): FairyRage | null {
  const m = RAGE_RE.exec(normalizeText(description));
  if (!m) return null;
  const stepPct = Number(m[1]);
  const attackPct = Number(m[2]);
  return stepPct > 0 && attackPct > 0 ? { stepPct, attackPct } : null;
}

/** Pháp Lực Nhiên Thiêu: "Mỗi lượt giảm X% MP hiện tại" -> X. */
export const mpBurnPct = (description: string): number => first(MP_BURN_RE.exec(normalizeText(description)));

/** Go fairyRageAttackPct: floor(lost % / step) × attack %, as percent attack + magic attack mods (none at full HP). */
export function rageMods(rage: FairyRage, hp: number, hpMax: number): BuffMod[] {
  if (hpMax <= 0) return [];
  const pct = Math.floor(((hpMax - Math.max(0, hp)) * 100) / hpMax / rage.stepPct) * rage.attackPct;
  return pct > 0 ? [{ prop: 4, value: pct, percent: true }, { prop: 5, value: pct, percent: true }] : [];
}

function procOf(tpl: SkillTemplate, lk: FairyLookups): FairyProc | null {
  const row = lk.family(tpl.codeName + FAIRY_PROC_SUFFIX).find((r) => r.level === tpl.level && r.buffId > 0);
  const buffRow = row ? lk.buffRow(row.buffId) : undefined;
  if (!row || !buffRow) return null;
  const buff = buildBuffDef(buffRow, row.buffRound);
  const poison = FAIRY_POISON_PCT[buff.id];
  if (!buff.dot && poison) buff.dot = { kind: 'maxHp', value: poison };
  const burn = mpBurnPct(String(buffRow.description ?? ''));
  if (burn > 0) buff.mpBurn = burn;
  return { skillId: row.id, name: row.name, buff, rate: Math.max(0, row.buffRate) / 100 };
}

/** Go buildFairyKit: casts for every rotation skill with a buff row, plus the on-attack procs; null when nothing would cast. */
export function buildFairyKit(rotation: readonly number[], lk: FairyLookups): FairyKit | null {
  const casts = new Map<number, FairyCast>();
  const procs = new Map<number, FairyProc>();
  for (const id of rotation) {
    if (id <= 0 || casts.has(id)) continue;
    const tpl = lk.skill(id);
    const row = tpl && tpl.buffId > 0 ? lk.buffRow(tpl.buffId) : undefined;
    if (!tpl || !row) continue;
    const text = String(row.description ?? '');
    const buff = buildBuffDef(row, tpl.buffRound);
    buff.mods.push(...fairyTextMods(text));
    const rage = fairyRage(text);
    casts.set(id, { skillId: id, name: tpl.name, buff, ...(rage ? { rage } : {}) });
    if (Number(row.kind) === FAIRY_PROC_BUFF_KIND) {
      const p = procOf(tpl, lk);
      if (p) procs.set(buff.id, p);
    }
  }
  if (casts.size === 0) return null;
  const slots = Array.from({ length: FAIRY_ROTATION_SLOTS }, (_, i) => (casts.has(rotation[i] ?? 0) ? rotation[i] : 0));
  return { rotation: slots, casts, procs, procRound: 0 };
}
