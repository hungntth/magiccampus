// Pure rules for Sư đồ (Go application/mentor/rules.go): pair eligibility reasons for the IM requests and NPC 49, the Flash
// `f` codes and refusal texts per reason, the NPC lock and the level-exp lookup behind the report gain. No Mongo or sockets.

import { FindTsCode, MENTOR_MIN_TEACHER_LEVEL, NPC_TUTOR, RelationType, studentCap, type FindTsCodeId } from '@mc/shared';
import { expForNextLevel } from '../character/character-points';

export type PairReason = 'ok' | 'self' | 'hasTeacher' | 'offline' | 'reversed' | 'noRank' | 'level' | 'full' | 'pair' | 'notFound';

export interface PairFacts {
  /** NPC 49 recommendation (leader Lv >= 30, member Lv <= 20, rank 0 allowed) instead of an IM request. */
  npc: boolean;
  teacherLevel: number;
  studentLevel: number;
  teacherRank: number;
  teacherStudents: number;
  studentHasTeacher: boolean;
  /** The prospective student already is the prospective teacher's teacher. */
  reversed: boolean;
  /** Relationship row types of the pair, both directions. */
  rowTypes: readonly number[];
}

/** A black row, or any row other than friend / tutor (enemy, couple, brother), blocks a mentor link. */
export function pairBlocked(rowTypes: readonly number[]): boolean {
  return rowTypes.some((t) => t !== RelationType.FRIEND && t !== RelationType.TUTOR);
}

/** IM pair: teacher rank >= 1, Lv >= 30 and not below the student (gap 0), a free slot. NPC pair: see PairFacts.npc. */
export function checkPair(f: PairFacts): PairReason {
  if (f.studentHasTeacher) return 'hasTeacher';
  if (f.reversed) return 'reversed';
  if (f.npc) {
    if (f.teacherLevel < MENTOR_MIN_TEACHER_LEVEL || f.studentLevel > NPC_TUTOR.maxStudentLevel) return 'level';
    if (f.teacherStudents >= studentCap(Math.max(f.teacherRank, 1))) return 'full';
  } else {
    if (f.teacherRank < 1) return 'noRank';
    if (f.teacherLevel < MENTOR_MIN_TEACHER_LEVEL || f.teacherLevel < f.studentLevel) return 'level';
    if (f.teacherStudents >= studentCap(f.teacherRank)) return 'full';
  }
  return pairBlocked(f.rowTypes) ? 'pair' : 'ok';
}

const TEACHER_CODES: Record<PairReason, FindTsCodeId> = {
  ok: FindTsCode.WAITING, offline: FindTsCode.OFFLINE, notFound: FindTsCode.NOT_FOUND, level: FindTsCode.LEVEL,
  hasTeacher: FindTsCode.HAS_TEACHER, self: FindTsCode.NOT_ELIGIBLE, reversed: FindTsCode.NOT_ELIGIBLE,
  noRank: FindTsCode.NOT_ELIGIBLE, full: FindTsCode.NOT_ELIGIBLE, pair: FindTsCode.NOT_ELIGIBLE,
};

const STUDENT_CODES: Record<PairReason, FindTsCodeId> = { ...TEACHER_CODES, reversed: FindTsCode.IS_TEACHER };

/** `f` of the reply: findTeacher (the student asked) or findStudent (the teacher asked). */
export const findCode = (reason: PairReason, byStudent: boolean): FindTsCodeId => (byStudent ? TEACHER_CODES : STUDENT_CODES)[reason];

export const REFUSAL = {
  pair: 'Hai bên đang là kẻ thù, phu thê, huynh đệ kết bái hoặc có người trong danh sách đen, không thể kết sư đồ!',
  notFound: 'Người chơi không tồn tại!',
  self: 'Không thể kết sư đồ với chính mình!',
  npcLevel: 'Nhóm trưởng (người tiến cử) phải từ cấp 30 trở lên, người được tiến cử phải từ cấp 20 trở xuống!',
  npcFull: 'Số lượng đồ đệ của nhóm trưởng đã đầy!',
  noTeam: 'Hãy lập nhóm với người tiến cử (nhóm trưởng) rồi đến gặp ta!',
  isLeader: 'Người được tiến cử (thành viên nhóm) hãy đến gặp ta để xác nhận nhóm trưởng là người tiến cử!',
  leaderOffline: 'Nhóm trưởng không online hoặc không cùng kênh!',
  farNpc: 'Hãy đến gặp Quản Lý Tiến Cử để tiến cử.',
} as const;

/** Refusal text of an accept / NPC path (`actorIsTeacher`: the one answering is the teacher). */
export function refusalText(reason: PairReason, actorIsTeacher: boolean): string {
  const pick = (teacher: string, student: string): string => (actorIsTeacher ? teacher : student);
  switch (reason) {
    case 'self': return REFUSAL.self;
    case 'notFound': return REFUSAL.notFound;
    case 'hasTeacher': return pick('Đối phương đã có sư phụ!', 'Bạn đã có sư phụ rồi!');
    case 'offline': return pick('Người chơi bạn muốn nhận đồ đệ không online!', 'Người bạn muốn bái sư không online!');
    case 'reversed': return pick('Dám nhận sự phụ của mình làm đồ đệ, không sợ bị trục xuất khỏi sư môn sao?', 'Đối phương là đồ đệ của bạn!');
    case 'noRank': return pick('Bạn vẫn chưa thể nhận đồ đệ!', 'Số lượng đồ đệ của đối phương đã đầy hoặc không đủ điều kiện nhận đồ đệ!');
    case 'level': return pick('Cấp độ của bạn không đủ, không thể nhận đối phương làm đồ đệ!', 'Cấp độ đối phương không đủ, không thể nhận bạn làm đồ đệ!');
    case 'full': return pick('Đồ đệ của bạn đã đầy hoặc bạn không phù hợp điều kiện nhận đồ đệ!', 'Số lượng đồ đệ của đối phương đã đầy hoặc không đủ điều kiện nhận đồ đệ!');
    case 'pair': return REFUSAL.pair;
    case 'ok': return '';
  }
}

export function npcRefusalText(reason: PairReason): string {
  if (reason === 'level') return REFUSAL.npcLevel;
  if (reason === 'full') return REFUSAL.npcFull;
  if (reason === 'offline') return REFUSAL.leaderOffline;
  return refusalText(reason, false);
}

/** NPC-recommended pairs cannot be dissolved until the student reaches Lv 30. */
export const npcLocked = (npc: boolean, studentLevel: number): boolean => npc && studentLevel < NPC_TUTOR.lockLevel;

/** Exp level `level` needs on top of level - 1 (Go PlayerLevelRequiredExp); 0 below level 2 or past the table. */
export function levelExp(level: number): number {
  if (level <= 1) return 0;
  return (expForNextLevel(level - 1) ?? 0) - (expForNextLevel(level - 2) ?? 0);
}

/** Character name boundary of the legacy handler: at most 30 bytes, no control characters. */
export function validName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (!name || Buffer.byteLength(name, 'utf8') > 30 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}
