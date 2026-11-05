// Quiz event orchestration (Go application/quiz contest.go + handlers/quiz): the scheduled start (Tue / Thu / Sat 20:00 UTC+7, once a day),
// GM start / stop, the 500 ms tick that closes registration and runs the question cycles, the per-player RPC actions and the pushes
// (updateActivityState {id 16}, onStartQuestion, onShowQuestion, onQuestionRank, onQuestionNote). The contest rules are pure
// (quiz-contest.ts); the contest lives in memory, so a restart mid-contest drops it (as Go).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { QUIZ, dayKey, nextQuizStart, quizRegistrationStart, quizStartOn, type QuizApplyReply, type QuizItemReply } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { InstanceDataService } from '../gamedata/instance-data';
import { answerOptions } from '../gamedata/answer-quiz';
import type { QuizMsg, QuizQuestion, SettleRow } from './quiz-contest';
import { QuizSettleService } from './quiz-settle.service';
import { QuizState } from './quiz-state.service';

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);
  now = (): number => Date.now();
  rng: () => number = Math.random;
  private windowKey = '';
  private busy = false;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly scenes: SceneManager,
    private readonly data: InstanceDataService,
    private readonly state: QuizState,
    private readonly settle: QuizSettleService,
  ) {}

  private get contest() {
    return this.state.contest;
  }

  /** Draws the contest questions: a shuffle of the usable TBL_ANSWER rows, first 30. */
  private draw(): QuizQuestion[] {
    const pool = [...this.data.answers()];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, QUIZ.QUESTIONS).map((r) => ({
      id: r.id, right: r.r as QuizQuestion['right'], options: answerOptions(r).map((o) => o.key),
      text: { t: r.t, a: r.a, b: r.b, c: r.c, d: r.d },
    }));
  }

  /** Opens registration now (scheduler or GM). Returns false when a contest is already running or no question exists. */
  async start(regMs: number = QUIZ.REGISTRATION_MS): Promise<boolean> {
    const now = this.now();
    const questions = this.draw();
    if (questions.length === 0 || !this.contest.open(questions, now + regMs)) return false;
    this.logger.log(`quiz: registration opened (${Math.round(regMs / 1000)} s, ${questions.length} questions)`);
    this.broadcastState();
    await this.sendEligible('onStartQuestion', true);
    return true;
  }

  /** GM stop: ends the contest now (exp for the points so far); during today's window it also marks the day as used. */
  async stop(): Promise<boolean> {
    if (this.contest.phase === 'idle') return false;
    const now = this.now();
    const start = quizStartOn(now);
    if (start !== null && now >= start) this.windowKey = dayKey(now);
    await this.finish('manual');
    return true;
  }

  /** 500 ms scheduler tick; overlapping ticks are skipped. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.step(this.now());
    } catch (e) {
      this.logger.error(`quiz tick failed: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async step(now: number): Promise<void> {
    if (this.contest.phase === 'idle') {
      const start = quizRegistrationStart(now);
      if (start !== null && this.windowKey !== dayKey(now)) {
        this.windowKey = dayKey(now);
        const left = start + QUIZ.REGISTRATION_MS - now;
        if (!(await this.start(left))) this.logger.warn('quiz: scheduled start failed');
      }
      return;
    }
    const r = this.contest.tick(now);
    if (r.kind === 'empty') {
      await this.sendEligible('onStartQuestion', false);
      await this.finish('empty');
    } else if (r.kind === 'started') {
      await this.sendEligible('onStartQuestion', false);
      this.broadcastState();
      this.flush(r.msgs);
    } else if (r.kind === 'ranked') {
      this.flush(r.msgs);
      if (r.done) await this.finish('completed');
    }
  }

  /** Back to idle, hides the icon, settles everyone with points in rank order and sends the end note. */
  private async finish(reason: string): Promise<void> {
    const rows: SettleRow[] = this.contest.finish();
    this.logger.log(`quiz: finished (${reason}), ${rows.length} participants`);
    this.broadcastState();
    const now = this.now();
    for (const row of rows) {
      try {
        const note = await this.settle.settle(row, now);
        const s = this.scenes.findByCharacter(row.cid);
        if (s && !row.dropped) s.callback('onQuestionNote', note);
      } catch (e) {
        this.logger.error(`quiz settle ${row.cid} failed: ${(e as Error).message}`);
      }
    }
  }

  private flush(msgs: readonly QuizMsg[]): void {
    for (const m of msgs) this.scenes.findByCharacter(m.cid)?.callback(m.method, m.payload);
  }

  private broadcastState(): void {
    this.scenes.broadcastAll('updateActivityState', [this.state.statePush()]);
  }

  /** Online characters at the level gate. */
  private async eligible(): Promise<Session[]> {
    const online = this.scenes.onlineSessions().filter((s) => s.characterId !== null);
    if (online.length === 0) return [];
    const ok = await this.chars.find({ _id: { $in: online.map((s) => s.characterId!) }, level: { $gte: QUIZ.MIN_LEVEL } }, { _id: 1 }).lean();
    const ids = new Set(ok.map((d) => d._id));
    return online.filter((s) => ids.has(s.characterId!));
  }

  private async sendEligible(method: string, arg: unknown): Promise<void> {
    for (const s of await this.eligible()) s.callback(method, arg);
  }

  // --- player actions (RPCs) ---

  async apply(session: Session): Promise<QuizApplyReply> {
    const cid = session.characterId!;
    if (this.contest.players.has(cid) && this.contest.phase !== 'idle') return { apply: true };
    if (this.contest.phase !== 'registration') return { f: false };
    const doc = await this.chars.findById(cid, { name: 1, classId: 1, level: 1 }).lean();
    if (!doc) return { f: false };
    return this.contest.apply({ cid, name: doc.name, classId: doc.classId, level: doc.level }, this.now());
  }

  canJoin(cid: number): boolean {
    return this.contest.canJoin(cid);
  }

  drop(cid: number): void {
    this.contest.drop(cid);
  }

  answer(cid: number, option: string): number {
    return this.contest.answer(cid, option, this.now());
  }

  fdj(cid: number): QuizItemReply {
    return this.contest.useFdj(cid, this.now());
  }

  xyx(cid: number): QuizItemReply {
    return this.contest.useXyx(cid, this.now());
  }

  xly(cid: number, target: number): QuizItemReply {
    return this.contest.useXly(cid, target, this.now());
  }

  /** GM status line. */
  status(): string {
    const c = this.contest;
    const next = new Date(nextQuizStart(this.now()) + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16);
    return `Đố vui: ${c.phase}, câu ${Math.max(0, c.index + 1)}/${c.questions.length}, ${c.players.size} người báo danh. Lần sau (UTC+7): ${next}`;
  }
}
