// Pure rules of the pet line-up dialog shared by PPVE and the arena: cmdList <-> editable rows, the target rule table (AI_CONF_PANEL_U),
// which pets can be placed and which skills a pet can script. No DOM, so it is unit tested (lineupRules.test.ts).

import {
  PET_SKILL_SLOT_COUNT, type PetSkillInfo, type PetView, type PPVECmd, type PPVECmdList, type PPVESlot,
} from '@mc/shared';

/** cmdList action codes: -10 basic attack, -50 skill (the engine falls back to an attack for a skill the pet has not learned). */
export const CMD_ATTACK = -10;
export const CMD_SKILL = -50;
/** Rounds a script can hold (keys "0".."23"); the engine repeats the list when the fight runs longer. */
export const CMD_MAX_ROUNDS = 24;
/** Skill type 11 is passive: it can not be cast. */
const PASSIVE_SKILL_TYPE = 11;

/** Target rules t: 1 random, 2 highest attack, 3 lowest HP, 4 fastest, 50..54 the opposing pet at position 1..5. */
export const TARGET_RANDOM = 1;
export const TARGET_FIXED_BASE = 50;
export const TARGET_FIXED_COUNT = 5;

export interface TargetOption {
  t: number;
  label: string;
}

/** Flash AI_CONF_PANEL_U[1..5] / [20..25] labels in the select order. */
export const TARGET_OPTIONS: readonly TargetOption[] = [
  { t: 1, label: 'Ngẫu nhiên' },
  { t: 2, label: 'Tấn công cao nhất' },
  { t: 3, label: 'Sinh mệnh thấp nhất' },
  { t: 4, label: 'Tốc độ nhanh nhất' },
  ...Array.from({ length: TARGET_FIXED_COUNT }, (_, k) => ({ t: TARGET_FIXED_BASE + k, label: `Vị trí cố định ${k + 1}` })),
];

/** The label of a target rule; an unknown value reads as random (the engine does the same). */
export function targetLabel(t: number): string {
  return (TARGET_OPTIONS.find((o) => o.t === t) ?? TARGET_OPTIONS[0]).label;
}

/** One editable script round. */
export interface CmdRow {
  action: typeof CMD_ATTACK | typeof CMD_SKILL;
  id: number;
  level: number;
  t: number;
}

/** A pet seat of the dialog: its position (PPVE 1..5, arena 5..9), the pet id (0 = empty) and its script. */
export interface LineupSeat {
  pos: number;
  pid: number;
  rows: CmdRow[];
}

const int = (v: unknown, d = 0): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : d;
};

/** The saved cmdList as rows ordered by round key (numbers may arrive as strings). */
/** Wire rows are untrusted: every field is coerced. */
export type RawCmdList = Readonly<Record<string, { action?: unknown; id?: unknown; level?: unknown; t?: unknown }>>;

export function cmdListToRows(list: RawCmdList | undefined): CmdRow[] {
  const rows: CmdRow[] = [];
  for (const key of Object.keys(list ?? {}).sort((a, b) => int(a) - int(b))) {
    const c = (list as RawCmdList)[key];
    const action = int(c?.action);
    if (action !== CMD_ATTACK && action !== CMD_SKILL) continue;
    rows.push({ action, id: int(c.id), level: Math.max(1, int(c.level, 1)), t: normalizeTarget(int(c.t, TARGET_RANDOM)) });
  }
  return rows.slice(0, CMD_MAX_ROUNDS);
}

/** Rows back to the wire map `{"0": {action, id, level, t}}`; an attack row carries id 0 / level 1. */
export function rowsToCmdList(rows: readonly CmdRow[]): PPVECmdList {
  const out: PPVECmdList = {};
  rows.slice(0, CMD_MAX_ROUNDS).forEach((r, i) => {
    const cmd: PPVECmd = r.action === CMD_SKILL
      ? { action: CMD_SKILL, id: r.id, level: Math.max(1, r.level), t: r.t }
      : { action: CMD_ATTACK, id: 0, level: 1, t: r.t };
    out[String(i)] = cmd;
  });
  return out;
}

function normalizeTarget(t: number): number {
  return TARGET_OPTIONS.some((o) => o.t === t) ? t : TARGET_RANDOM;
}

/** Seats for positions posMin .. posMin + size - 1 from a saved config keyed by position. */
export function seatsFromConf(conf: Readonly<Record<string, PPVESlot>> | undefined, posMin: number, size: number): LineupSeat[] {
  return Array.from({ length: size }, (_, i) => {
    const pos = posMin + i;
    const slot = conf?.[String(pos)];
    return slot && slot.pid > 0 ? { pos, pid: slot.pid, rows: cmdListToRows(slot.cmdList) } : { pos, pid: 0, rows: [] };
  });
}

/** The wire config of the filled seats (an empty config clears a PPVE line-up). */
export function confFromSeats(seats: readonly LineupSeat[]): Record<string, PPVESlot> {
  const out: Record<string, PPVESlot> = {};
  for (const s of seats) if (s.pid > 0) out[String(s.pos)] = { pid: s.pid, pos: s.pos, cmdList: rowsToCmdList(s.rows) };
  return out;
}

/** Bound pets whose template is not already seated (one pet per template); `keepPid` is the seat being replaced. */
export function eligiblePets(pets: readonly PetView[], seats: readonly LineupSeat[], keepPid = 0): PetView[] {
  const seated = new Set(seats.filter((s) => s.pid > 0 && s.pid !== keepPid).map((s) => s.pid));
  const tids = new Set(pets.filter((p) => seated.has(p.id)).map((p) => p.tid));
  return pets.filter((p) => p.binded > 0 && !seated.has(p.id) && !tids.has(p.tid));
}

export interface ScriptSkill {
  id: number;
  name: string;
  level: number;
}

/** Active learned skills of a pet (skill1..15 > 0, passives left out), named through `info` when it knows the id. */
export function scriptSkills(pet: PetView, info: (id: number) => PetSkillInfo | undefined): ScriptSkill[] {
  const out: ScriptSkill[] = [];
  for (let n = 1; n <= PET_SKILL_SLOT_COUNT; n++) {
    const id = pet[`skill${n as 1}`];
    if (!(id > 0) || out.some((s) => s.id === id)) continue;
    const i = info(id) ?? pet.skillInfo?.[id];
    if (i && i.type === PASSIVE_SKILL_TYPE) continue;
    out.push({ id, name: i?.name ?? `Kỹ năng ${id}`, level: i?.level ?? 1 });
  }
  return out;
}

/** The one-line summary of a row for the editor ("Tấn công thường · Ngẫu nhiên"). */
export function rowSummary(r: CmdRow, skills: readonly ScriptSkill[]): string {
  const act = r.action === CMD_SKILL ? (skills.find((s) => s.id === r.id)?.name ?? `Kỹ năng ${r.id}`) : 'Tấn công thường';
  return `${act} · ${targetLabel(r.t)}`;
}

/** A skill row whose skill the pet no longer knows is shown but flagged (the engine plays an attack instead). */
export const rowIsStale = (r: CmdRow, skills: readonly ScriptSkill[]): boolean => r.action === CMD_SKILL && !skills.some((s) => s.id === r.id);
