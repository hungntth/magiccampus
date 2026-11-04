// Pure quest rules (no Nest/Mongo): accept gating (Go service.go:91-195 = Flash Player.canTakeQuest),
// H5 "supported quest" filter (grant / collect / kill), exp/level-up (Go character.go GainExperience), NPC quest states.

import { ATTR_POINTS_PER_LEVEL, AUTO_LEVEL_CAP, LEVEL_EXP, QuestState, QuestType } from '@mc/shared';
import type { QuestPreRow, QuestRequireRow, QuestTemplate } from '../gamedata/quest-data';

const GENDER_ANY = 2;

/** Quest types the H5 slice offers (newbie, main, world, growup; loop rounds are granted by the loop module, never offered by an NPC). */
export const SUPPORTED_QUEST_TYPES: ReadonlySet<number> = new Set([
  QuestType.NEWHAND, QuestType.MAIN, QuestType.WORLD, QuestType.GROWUP, QuestType.LOOP,
]);

export interface QuestChar {
  level: number;
  gender: number;
  classId: number;
}

/** "all" / "0" / "" -> [] (any class); "|1|3|" -> [1, 3]. */
export function parseReqClass(raw: string): number[] {
  return raw
    .split('|')
    .map((p) => Number(p.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

/** null when the character may take the quest, else a Vietnamese reason. */
export function acceptBlocker(
  char: QuestChar,
  tpl: QuestTemplate,
  active: ReadonlySet<number>,
  done: ReadonlySet<number>,
  pre: readonly QuestPreRow[],
): string | null {
  if (active.has(tpl.id)) return 'Đã nhận nhiệm vụ này';
  if (done.has(tpl.id)) return 'Đã hoàn thành nhiệm vụ này';
  if (char.level < tpl.minLevel) return 'Chưa đủ cấp độ';
  if (tpl.maxLevel > 0 && char.level > tpl.maxLevel) return 'Cấp độ quá cao';
  if (tpl.gender !== GENDER_ANY && tpl.gender !== char.gender) return 'Không đúng giới tính';
  const classes = parseReqClass(tpl.reqClass);
  if (classes.length > 0 && !classes.includes(char.classId)) return 'Không đúng nghề nghiệp';
  // Kind-1 pre rows need an item in the bag; there is no inventory yet, so they always block.
  if (pre.some((p) => p.kind === 1)) return 'Thiếu vật phẩm yêu cầu';
  const preQuests = pre.filter((p) => p.kind === 2).map((p) => p.itemId);
  if (preQuests.length > 0) {
    if (tpl.preQuestType === 1 && !preQuests.every((id) => done.has(id))) return 'Chưa hoàn thành nhiệm vụ trước';
    if (tpl.preQuestType === 2 && !preQuests.some((id) => done.has(id))) return 'Chưa hoàn thành nhiệm vụ trước';
  }
  return null;
}

export function canAccept(
  char: QuestChar,
  tpl: QuestTemplate,
  active: ReadonlySet<number>,
  done: ReadonlySet<number>,
  pre: readonly QuestPreRow[],
): boolean {
  return acceptBlocker(char, tpl, active, done, pre) === null;
}

/**
 * H5 slice: supported type and every require row is the accept-time granted item (pre-met), an item to collect
 * (kind 1, item table 29, any quality), a creature to kill (kind 2, type 12) or a pet to hand in (kind 3, type 12, phase D of
 * pets). Equipment objectives stay out.
 */
export function isSupported(tpl: QuestTemplate, require: readonly QuestRequireRow[]): boolean {
  if (!SUPPORTED_QUEST_TYPES.has(tpl.type)) return false;
  return require.every((r) => {
    if (r.kind === 1 && tpl.startGrantItem > 0 && r.itemId === tpl.startGrantItem) return true;
    if (r.kind === 1) return r.type === 29 && r.q < 0 && r.num > 0;
    return (r.kind === 2 || r.kind === 3) && r.type === 12 && r.num > 0;
  });
}

/** Cumulative exp needed to be at `level` (level 1 starts at 0). */
export function levelStartExp(level: number): number {
  if (level <= 1) return 0;
  return LEVEL_EXP[Math.min(level - 1, LEVEL_EXP.length - 1)];
}

export interface ExpResult {
  level: number;
  exp: number; // cumulative
  attrPoints: number;
  statGain: number; // +1 to each primary stat per level gained
  leveled: boolean;
}

export function applyExp(char: { level: number; exp: number; attrPoints: number }, gained: number): ExpResult {
  let { level, attrPoints } = char;
  const exp = char.exp + Math.max(0, gained);
  let statGain = 0;
  while (level < AUTO_LEVEL_CAP && level < LEVEL_EXP.length && exp >= levelStartExp(level + 1)) {
    level++;
    attrPoints += ATTR_POINTS_PER_LEVEL;
    statGain++;
  }
  return { level, exp, attrPoints, statGain, leveled: statGain > 0 };
}

export interface ActiveQuestInfo {
  tpl: QuestTemplate;
  met: boolean; // all objectives met
}

/**
 * Quest entries an NPC shows (Go npc_interaction.go:60-110): offerable quests starting here -> 102,
 * active quests finishing here -> 104 / 103 (overrides a 102 entry).
 */
export function npcQuestStates(npcId: number, offerable: readonly QuestTemplate[], active: readonly ActiveQuestInfo[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const tpl of offerable) if (tpl.startNpc === npcId) out.set(tpl.id, QuestState.CAN_TAKE);
  for (const a of active) {
    if (a.tpl.finishNpc === npcId) out.set(a.tpl.id, a.met ? QuestState.CAN_FINISH : QuestState.TAKEN);
  }
  return out;
}

/** NPC head-marker state: max entry state, -1 when none. */
export function npcStateOf(states: ReadonlyMap<number, number>): number {
  let best = -1;
  for (const v of states.values()) best = Math.max(best, v);
  return best;
}
