// Pure quiz contest state machine (Go application/quiz contest.go / actions.go / items.go / ranking.go): registration, the question
// cycle (read + write + grace), answers, the three helper items, scoring at ranking time and the final order. Every method takes the
// clock as `now` and returns the pushes to send; no Nest, no I/O. The service wires it to sessions, rewards and the scheduler.

import {
  QUIZ, QUIZ_CYCLE_MS, QuizAnswerCode, quizClientClass, quizOrder, quizPoints,
  type QuizApplyReply, type QuizItemReply, type QuizQuestionText, type QuizRankPush, type QuizShowPush,
} from '@mc/shared';

export type QuizPhase = 'idle' | 'registration' | 'running';
export type OptionKey = 'A' | 'B' | 'C' | 'D';
const KEYS: readonly OptionKey[] = ['A', 'B', 'C', 'D'];

export interface QuizQuestion {
  id: number;
  right: OptionKey;
  /** the non-empty options */
  options: readonly OptionKey[];
  /** question text for the onShowQuestion push */
  text?: QuizQuestionText;
}

interface AnswerRec {
  option: OptionKey | '';
  right: boolean;
  /** ms since the write phase opened */
  elapsedMs: number;
}

export interface QuizPlayer {
  cid: number;
  name: string;
  classId: number;
  level: number;
  seq: number;
  dropped: boolean;
  points: number;
  fdj: number;
  xyx: number;
  xly: number;
  answers: Map<number, AnswerRec>;
  doubled: Set<number>;
  removed: Map<number, Set<OptionKey>>;
}

export interface QuizMsg {
  cid: number;
  method: 'onShowQuestion' | 'onQuestionRank';
  payload: QuizShowPush | QuizRankPush;
}

export type TickResult =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'started'; msgs: QuizMsg[] }
  | { kind: 'ranked'; msgs: QuizMsg[]; done: boolean };

export interface SettleRow {
  cid: number;
  name: string;
  points: number;
  /** 0-based final rank */
  rank: number;
  dropped: boolean;
}

export const normalizeOption = (v: string): OptionKey | '' => {
  const o = v.trim().toUpperCase();
  return (KEYS as readonly string[]).includes(o) ? (o as OptionKey) : '';
};

export class QuizContest {
  phase: QuizPhase = 'idle';
  regEndsAt = 0;
  index = -1;
  shownAt = 0;
  questions: QuizQuestion[] = [];
  readonly players = new Map<number, QuizPlayer>();
  private seq = 0;

  /** Opens registration with the drawn questions (false when a contest is already running). */
  open(questions: QuizQuestion[], regEndsAt: number): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'registration';
    this.questions = questions;
    this.regEndsAt = regEndsAt;
    this.index = -1;
    this.players.clear();
    this.seq = 0;
    return true;
  }

  /** subQuestionApply: {apply:true} already in, {f:true,...} registered, {f:false} closed or below the level gate. */
  apply(who: { cid: number; name: string; classId: number; level: number }, now: number): QuizApplyReply {
    if (this.players.has(who.cid) && this.phase !== 'idle') return { apply: true };
    if (this.phase !== 'registration' || now >= this.regEndsAt || who.level < QUIZ.MIN_LEVEL) return { f: false };
    this.seq += 1;
    this.players.set(who.cid, {
      ...who, seq: this.seq, dropped: false, points: 0, fdj: 0, xyx: 0, xly: 0,
      answers: new Map(), doubled: new Set(), removed: new Map(),
    });
    return { f: true, rtime: QUIZ.READ_MS, wtime: QUIZ.WRITE_MS, qnum: this.questions.length, sec: Math.ceil((this.regEndsAt - now) / 1000) };
  }

  /** canQuest: registered, not dropped, contest running. */
  canJoin(cid: number): boolean {
    const p = this.players.get(cid);
    return !!p && !p.dropped && this.phase === 'running';
  }

  drop(cid: number): void {
    const p = this.players.get(cid);
    if (p) p.dropped = true;
  }

  private active(cid: number): { p: QuizPlayer; q: QuizQuestion } | null {
    if (this.phase !== 'running' || this.index < 0 || this.index >= this.questions.length) return null;
    const p = this.players.get(cid);
    return p && !p.dropped ? { p, q: this.questions[this.index] } : null;
  }

  private submit(p: QuizPlayer, q: QuizQuestion, option: OptionKey | '', now: number): number {
    if (now < this.shownAt + QUIZ.READ_MS) return QuizAnswerCode.EARLY;
    if (now > this.shownAt + QUIZ_CYCLE_MS) return QuizAnswerCode.LATE;
    if (p.answers.has(this.index)) return QuizAnswerCode.ALREADY;
    const right = option !== '' && option === q.right;
    p.answers.set(this.index, { option, right, elapsedMs: now - (this.shownAt + QUIZ.READ_MS) });
    return right ? QuizAnswerCode.RIGHT : QuizAnswerCode.WRONG;
  }

  /** subAnswer(opt): 1 right / -1 wrong / 4 already / 3 late (or not playing) / 2 too early. An invalid option counts as wrong. */
  answer(cid: number, option: string, now: number): number {
    if (this.phase === 'registration' && this.players.has(cid)) return QuizAnswerCode.EARLY;
    const a = this.active(cid);
    return a ? this.submit(a.p, a.q, normalizeOption(option), now) : QuizAnswerCode.LATE;
  }

  private usable(cid: number, now: number): { p: QuizPlayer; q: QuizQuestion } | null {
    const a = this.active(cid);
    return a && now < this.shownAt + QUIZ_CYCLE_MS ? a : null;
  }

  /** Phóng Đại Đồng: removes the first wrong, non-empty, not yet removed option. */
  useFdj(cid: number, now: number): QuizItemReply {
    const a = this.usable(cid, now);
    if (!a || a.p.fdj >= QUIZ.ITEM_USES) return { f: false };
    const removed = a.p.removed.get(this.index) ?? new Set<OptionKey>();
    const pick = a.q.options.find((k) => k !== a.q.right && !removed.has(k));
    if (!pick) return { f: false };
    removed.add(pick);
    a.p.removed.set(this.index, removed);
    a.p.fdj += 1;
    return { f: true, d: pick, num: a.p.fdj };
  }

  /** Sao May Mắn: this question's points double; one use per question. */
  useXyx(cid: number, now: number): QuizItemReply {
    const a = this.usable(cid, now);
    if (!a || a.p.xyx >= QUIZ.ITEM_USES || a.p.doubled.has(this.index)) return { f: false };
    a.p.doubled.add(this.index);
    a.p.xyx += 1;
    return { f: true, num: a.p.xyx };
  }

  /** Tả Luân Nhãn: copies the target's answer as the caller's own (timed now); no use is spent when the caller already answered. */
  useXly(cid: number, targetCid: number, now: number): QuizItemReply {
    const a = this.usable(cid, now);
    if (!a || a.p.xly >= QUIZ.ITEM_USES || targetCid === cid) return { f: false };
    const rec = this.players.get(targetCid)?.answers.get(this.index);
    if (!rec || rec.option === '') return { f: false };
    if (a.p.answers.has(this.index)) return { f: true, a: rec.option, num: a.p.xly, aR: QuizAnswerCode.ALREADY };
    const code = this.submit(a.p, a.q, rec.option, now);
    if (code === QuizAnswerCode.RIGHT || code === QuizAnswerCode.WRONG) a.p.xly += 1;
    return { f: true, a: rec.option, num: a.p.xly, aR: code };
  }

  private showMsgs(): QuizMsg[] {
    const q = this.questions[this.index];
    const payload: QuizShowPush = { qid: q.id, qnum: this.index, ...(q.text ? { q: q.text } : {}) };
    return [...this.players.values()].filter((p) => !p.dropped).map((p) => ({ cid: p.cid, method: 'onShowQuestion', payload }));
  }

  /** Credits the current question by answer speed and builds one onQuestionRank per non-dropped player. */
  private rank(): QuizMsg[] {
    for (const p of this.players.values()) {
      const a = p.answers.get(this.index);
      if (a?.right) p.points += quizPoints(a.elapsedMs, p.doubled.has(this.index));
    }
    const ordered = quizOrder([...this.players.values()]);
    const rows = ordered.slice(0, QUIZ.RANK_ROWS).map((p) => ({ cid: p.cid, cName: p.name, pnt: p.points, cl: quizClientClass(p.classId) }));
    return ordered.flatMap((p, order) =>
      p.dropped ? [] : [{ cid: p.cid, method: 'onQuestionRank' as const, payload: { rank: rows, self: { order, pnt: p.points } } }]);
  }

  /** Scheduler tick: closes registration (first question) or ends the current question cycle (ranking + next question). */
  tick(now: number): TickResult {
    if (this.phase === 'registration') {
      if (now < this.regEndsAt) return { kind: 'none' };
      if (this.players.size === 0) return { kind: 'empty' };
      this.phase = 'running';
      this.index = 0;
      this.shownAt = now;
      return { kind: 'started', msgs: this.showMsgs() };
    }
    if (this.phase !== 'running' || now < this.shownAt + QUIZ_CYCLE_MS) return { kind: 'none' };
    const msgs = this.rank();
    this.index += 1;
    const done = this.index >= this.questions.length;
    if (!done) {
      this.shownAt = now;
      msgs.push(...this.showMsgs());
    }
    return { kind: 'ranked', msgs, done };
  }

  /** Final order of everyone with points (dropped included), then back to idle. */
  finish(): SettleRow[] {
    const rows = quizOrder([...this.players.values()]).map((p, rank) => ({ cid: p.cid, name: p.name, points: p.points, rank, dropped: p.dropped }));
    this.phase = 'idle';
    this.players.clear();
    this.questions = [];
    this.index = -1;
    return rows;
  }
}
