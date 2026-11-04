// Pure magic weapon rules (no Mongo, injectable RNG): effective stat lines, the upgrade gate + roll, prop reset roll, transfer /
// resolve / reset gates, skill slots and the sub-weapon line roll. Legacy: application/magicweapon (Go) with the H5 decisions
// recorded in docs/plans/2026-11-04_08_PROGRESSION.md (phase E): upgrade uses `rate` and `item_num` of data_tbl_artifact.

import { MW, MW_PRO_RANGE, type MWFailType, type MWFlag, type MWSkills, type MWSuccLine } from '@mc/shared';
import type { ArtifactRow } from '../gamedata/artifact-data';

export type Rng = () => number;
type Tpl = Record<string, unknown>;
type Props = object;
const at = (p: Props, key: string): unknown => (p as Record<string, unknown>)[key];

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export const isMwTemplate = (tpl: Tpl | undefined): boolean => int(tpl?.kind) === MW.KIND;
export const isMainTemplate = (tpl: Tpl | undefined): boolean => isMwTemplate(tpl) && int(tpl?.type) === MW.MAIN_TYPE;

/** The two main stat lines in force: the instance roll when set, the template otherwise (the stat pipeline's rule). */
export interface MwLines {
  prop1: number;
  prop2: number;
  num1: number;
  num2: number;
}

export function effectiveLines(tpl: Tpl, props: Props = {}): MwLines {
  const line = (n: 1 | 2): [number, number] => {
    const own = int(at(props, `mainProp${n}`));
    return own > 0 ? [own, int(at(props, `mainPropNum${n}`))] : [int(tpl[`main_prop${n}`]), int(tpl[`main_prop_num${n}`])];
  };
  const [prop1, num1] = line(1);
  const [prop2, num2] = line(2);
  return { prop1, prop2, num1, num2 };
}

export interface UpgradeInput {
  main: boolean;
  bound: boolean;
  star: number;
  playerLevel: number;
  spirituality: number;
  crystals: number;
  /** Ladder row of star + 1 (undefined = top reached). */
  next: ArtifactRow | undefined;
}

export type UpgradePlan = { ok: true; row: ArtifactRow } | { ok: false; failType: MWFailType; msg: string };

/** Gate of mWeaponUpgrade, checked before anything is spent. failType: 1 = message, 2 = top reached, 3 = must be bound. */
export function planUpgrade(i: UpgradeInput): UpgradePlan {
  const fail = (failType: MWFailType, msg: string): UpgradePlan => ({ ok: false, failType, msg });
  if (!i.main) return fail(1, 'Chỉ thần khí chính mới có thể thăng cấp!');
  if (!i.bound) return fail(3, 'Thần khí phải khóa!');
  if (i.star + 1 >= MW.LEVEL100_FROM && i.playerLevel < MW.PLAYER_LEVEL_FOR_HIGH) {
    return fail(1, 'Để tiếp tục thăng cấp nhân vật cần đạt cấp 100');
  }
  if (!i.next) return fail(2, 'Đã thăng cấp cao nhất!');
  if (i.spirituality < i.next.spirit) return fail(1, `Điểm thần tu không đủ (cần ${i.next.spirit}).`);
  if (i.crystals < i.next.itemNum) return fail(1, `Không đủ Pha Lê Thần Giới (cần ${i.next.itemNum}).`);
  return { ok: true, row: i.next };
}

/** Success roll in percent (H5 decision: the `rate` column; Go always succeeded). */
export function rollUpgrade(ratePercent: number, rng: Rng = Math.random): boolean {
  return rng() * 100 < ratePercent;
}

/** Lines after a successful upgrade: the ladder value, but never below what the weapon already has (data dips at levels 1..5). */
export function upgradedLines(current: MwLines, tpl: Tpl, row: ArtifactRow): { prop1: number; prop2: number; num1: number; num2: number } {
  return {
    prop1: current.prop1 > 0 ? current.prop1 : int(tpl.main_prop1),
    prop2: current.prop2 > 0 ? current.prop2 : int(tpl.main_prop2),
    num1: Math.max(current.num1, row.propNum1),
    num2: Math.max(current.num2, row.propNum2),
  };
}

/** Reset-prop range: template value .. template x 2 (queryMWResetPropMax). */
export function resetMax(tpl: Tpl): { num1: number; num2: number } {
  return { num1: int(tpl.main_prop_num1) * 2, num2: int(tpl.main_prop_num2) * 2 };
}

/** One reset roll per line: uniform in [template, template x 2]. */
export function rollReset(tpl: Tpl, rng: Rng = Math.random): { num1: number; num2: number } {
  const base1 = int(tpl.main_prop_num1);
  const base2 = int(tpl.main_prop_num2);
  return { num1: base1 + Math.floor(rng() * (base1 + 1)), num2: base2 + Math.floor(rng() * (base2 + 1)) };
}

/** Why the reset cannot run (null = allowed). The spirituality is only a requirement, it is not consumed. */
export function resetGate(i: { main: boolean; bound: boolean; star: number; spirituality: number; stones: number }): string | null {
  if (!i.main) return 'Chỉ thần khí chính mới có thể tái lập thuộc tính!';
  if (!i.bound) return 'Thần khí phải khóa!';
  if (i.star < MW.RESET_LEVEL) return `Thần khí cần đạt cấp ${MW.RESET_LEVEL} trở lên.`;
  if (i.spirituality < MW.RESET_SPIRIT) return `Cần ${MW.RESET_SPIRIT} điểm thần tu.`;
  if (i.stones < MW.RESET_STONES) return `Cần ${MW.RESET_STONES} Tinh Hồn Thạch.`;
  return null;
}

/** Transfer gate: both main weapons, a different row, the target strictly weaker on the first line (client S[96]). */
export function transGate(src: { main: boolean; id: number; num1: number; worn: boolean }, tgt: { main: boolean; id: number; num1: number }, stones: number): string | null {
  if (src.id === tgt.id) return 'Vui lòng chọn hai thần khí khác nhau.';
  if (!src.main || !tgt.main) return 'Chỉ có thể chuyển thuộc tính giữa các thần khí chính.';
  if (src.worn) return 'Hãy tháo thần khí gốc ra trước khi chuyển.';
  if (tgt.num1 >= src.num1) return 'Thần khí mục tiêu phải có điểm thuộc tính thấp hơn.';
  if (stones < 1) return 'Cần 1 Hoán Thần Thạch.';
  return null;
}

/** Spirituality returned by resolving a main weapon: 40 percent of everything spent on its levels, floored. */
export function resolveRefund(cumulative: number): number {
  return Math.floor((Math.max(0, cumulative) * MW.RESOLVE_REFUND_PCT) / 100);
}

/** Skill ids of the template's pipe list; entries that are not plain integers ("7-2") are skipped (Go used Atoi). */
export function templateSkillIds(artifactSkill: unknown): number[] {
  return String(artifactSkill ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => /^\d+$/.test(p))
    .map(Number);
}

/**
 * getMWSkills: position -> skill id. Positions 1..10 read the instance keys t1..t10; an unset position 1 shows the template's
 * base skill so a fresh weapon has something to reset (H5: Go never filled the t-keys). Sub weapons have none.
 */
export function skillMap(tpl: Tpl, props: Props = {}): MWSkills {
  if (!isMainTemplate(tpl)) return {};
  const out: MWSkills = {};
  for (let pos = 1; pos <= MW.SKILL_SLOTS; pos++) {
    const sid = int(at(props, `t${pos}`));
    if (sid > 0) out[String(pos)] = sid;
  }
  const base = templateSkillIds(tpl.artifact_skill)[0];
  if (out['1'] === undefined && base !== undefined) out['1'] = base;
  return out;
}

/** Uniform pick from the pool excluding the current skill; undefined when nothing else is left. */
export function pickSkill(pool: readonly number[], current: number, rng: Rng = Math.random): number | undefined {
  const options = pool.filter((id) => id !== current);
  return options.length === 0 ? undefined : options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
}

/** Parses the instance `flag` JSON string (sub weapons carry succ0..2); anything malformed is empty. */
export function parseFlag(raw: unknown): MWFlag {
  if (typeof raw !== 'string' || raw === '') return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: MWFlag = {};
    for (const k of ['succ0', 'succ1', 'succ2'] as const) {
      const v = o[k] as { propType?: unknown; propVal?: unknown } | undefined;
      if (v && Number(v.propType) > 0) out[k] = { propType: Number(v.propType), propVal: Number(v.propVal) };
    }
    return out;
  } catch {
    return {};
  }
}

/** Gate of activateMWPro: sub weapon, level, index 0..2, previous line present, this line empty. Null = allowed. */
export function activateGate(i: { sub: boolean; playerLevel: number; index: number; flag: MWFlag }): string | null {
  if (!i.sub) return 'Chỉ thần khí phụ mới có thể kích hoạt thuộc tính.';
  if (!Number.isInteger(i.index) || i.index < 0 || i.index > 2) return 'Dòng thuộc tính không hợp lệ.';
  if (i.playerLevel < MW.ACTIVATE_LEVEL) return `Cần người chơi cấp ${MW.ACTIVATE_LEVEL} mới có thể kích hoạt thuộc tính thần khí này`;
  if (i.index > 0 && !i.flag[`succ${i.index - 1}` as keyof MWFlag]) return 'Cần kích hoạt dòng thuộc tính trước.';
  if (i.flag[`succ${i.index}` as keyof MWFlag]) return 'Dòng thuộc tính này đã được kích hoạt.';
  return null;
}

/** One sub-weapon line: uniform type among the known ranges, uniform value (fractional ranges keep one decimal). */
export function rollLine(rng: Rng = Math.random): MWSuccLine {
  const types = Object.keys(MW_PRO_RANGE).map(Number);
  const propType = types[Math.min(types.length - 1, Math.floor(rng() * types.length))];
  const { min, max } = MW_PRO_RANGE[propType];
  const raw = min + rng() * (max - min);
  return { propType, propVal: max < 10 ? Math.round(raw * 10) / 10 : Math.floor(raw) };
}
