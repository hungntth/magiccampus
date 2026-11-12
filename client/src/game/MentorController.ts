// Sư đồ client wiring (M14 B): owns the teacher state (login ti / tn / tl / tp / ll, kept fresh by onUPP / onMakeTS / onDelST /
// onReportTS), the student grid (initTS -> onInitTS), the IM "Sư đồ" tab, the request prompts (onFindTeacher / onFindStudent ->
// acceptStudent / acceptTeacher) and the NPC 49 confirm (tutorFuncAlert -> confirmTutor). Flash refuses findStudent locally while
// tl == 0 (IMPANEL_S[37]). The tab is re-rendered through the host's registerTab (same id replaces the tab).

import {
  FIND_STUDENT_TEXT, FIND_TEACHER_TEXT, MENTOR_TEXT, REPORT_TEXT, ReportTsCode, formatLl, parseLl,
  type DelStPush, type FindTsPush, type FindTsReply, type InitTsRow, type MakeTsPush, type MentorUpdate, type PlayerData,
  type PlayerLevelUp, type ReportTsPush, type ReportTsReply, type UpTeacherReply,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import type { ImTabSpec } from '../ui/im/imTabs';
import { mentorTabSpec, type MentorActions, type MentorView } from '../ui/im/mentorTab';
import { showMentorWarn } from '../ui/im/mentorWarn';
import { toast } from '../ui/screens';

export interface MentorHost {
  client: GameClient;
  chat: { notice(text: string): void };
  player: PlayerData;
  /** The IM window: registering a tab with the same id replaces it and re-renders. */
  registerTab(spec: ImTabSpec): void;
}

const STALE_MS = 5000;

export class MentorController {
  private readonly offs: (() => void)[] = [];
  private readonly spec: ImTabSpec;
  private tl: number;
  private tp: number;
  private teacherId: number;
  private teacherName: string;
  private last: { level: number; exp: number };
  private level: number;
  private students: InitTsRow[] = [];
  private selected: number | null = null;
  private draft = '';
  private fetchedAt = 0;
  private quiet = false; // our own delST / delTeacher: skip the "X đã giải trừ" line

  constructor(private readonly host: MentorHost) {
    const p = host.player;
    this.tl = Number(p.tl ?? 0);
    this.tp = Number(p.tp ?? 0);
    this.teacherId = Number(p.ti ?? -1);
    this.teacherName = String(p.tn ?? '');
    this.last = parseLl(p.ll);
    this.level = p.level;
    this.spec = mentorTabSpec(this.actions());
    host.registerTab(this.spec);
    const { client } = host;
    this.offs.push(
      client.on('onInitTS', (rows) => this.onInitTS(rows)),
      client.on('onUPP', (d) => this.onUpp(d as MentorUpdate & { level?: number })),
      client.on('onPlayerLevelUp', (d) => this.setLevel((d as PlayerLevelUp).level)),
      client.on('onFindTeacher', (d) => this.onFindTeacher(d as FindTsPush)),
      client.on('onFindStudent', (d) => this.onFindStudent(d as FindTsPush)),
      client.on('onMakeTS', (d) => this.onMake(d as MakeTsPush)),
      client.on('onDelST', (d) => this.onDel(d as DelStPush)),
      client.on('onReportTS', (d) => this.onReport(d as ReportTsPush)),
      client.on('tutorFuncAlert', () => this.onTutorAlert()),
    );
    if (this.tl > 0) this.fetchStudents();
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  private render(): void {
    this.host.registerTab(this.spec);
  }

  private view(): MentorView {
    return {
      tl: this.tl, tp: this.tp, teacherId: this.teacherId, teacherName: this.teacherName, last: this.last, level: this.level,
      students: this.students, selected: this.selected, draft: this.draft,
    };
  }

  private fail(e: unknown): void {
    toast((e as Error).message, true);
  }

  private fetchStudents(): void {
    this.fetchedAt = Date.now();
    void this.host.client.call('initTS').catch(() => undefined);
  }

  private actions(): MentorActions {
    return {
      view: () => this.view(),
      draft: (name) => void (this.draft = name),
      findTeacher: (name) => this.find('findTeacher', name),
      findStudent: (name) => {
        if (this.tl === 0) return toast(MENTOR_TEXT.cannotTeach, true);
        this.find('findStudent', name);
      },
      report: () => this.reportTs(),
      delTeacher: () => askConfirm('Xác nhận giải trừ quan hệ sư đồ với sư phụ?', () => this.del('delTeacher')),
      delStudent: (id) => askConfirm(MENTOR_TEXT.deleteStudent, () => this.del('delST', id)),
      upgrade: () => void this.host.client.call<UpTeacherReply>('upTeacher').then((r) => this.setRank(r.tl, r.tp), (e) => this.fail(e)),
      select: (id) => {
        this.selected = id;
        this.render();
      },
      shown: () => {
        if (this.tl > 0 && Date.now() - this.fetchedAt > STALE_MS) this.fetchStudents();
      },
    };
  }

  private find(method: 'findTeacher' | 'findStudent', name: string): void {
    if (!name) return toast('Hãy nhập tên người chơi.', true);
    const texts = method === 'findTeacher' ? FIND_TEACHER_TEXT : FIND_STUDENT_TEXT;
    void this.host.client.call<FindTsReply>(method, name).then(
      (r) => toast(texts[r.f] ?? '', r.f !== 1),
      (e) => this.fail(e),
    );
  }

  private reportTs(): void {
    void this.host.client.call<ReportTsReply>('reportTS').then((r) => {
      if (r.f !== ReportTsCode.OK) return toast(REPORT_TEXT[r.f] ?? MENTOR_TEXT.reportFailed, true);
      this.last = parseLl(r.ll);
      this.render();
      toast('Hồi báo thành công!');
    }, (e) => this.fail(e));
  }

  private del(method: 'delTeacher' | 'delST', id?: number): void {
    this.quiet = true;
    const call = id === undefined ? this.host.client.call(method) : this.host.client.call(method, id);
    void call.then(() => toast('Đã giải trừ quan hệ sư đồ.'), (e) => this.fail(e)).finally(() => void (this.quiet = false));
  }

  private setLevel(level: number): void {
    if (!Number.isFinite(level) || level === this.level) return;
    this.level = level;
    this.render();
  }

  private setRank(tl: number, tp?: number): void {
    this.tl = tl;
    if (tp !== undefined) this.tp = tp;
    this.render();
    toast(`Chức nghiệp hiện tại: ${this.tl}`);
  }

  private onUpp(d: MentorUpdate & { level?: number }): void {
    if (d.level !== undefined) this.setLevel(Number(d.level));
    if (d.tl === undefined) return;
    const rankUp = d.tl !== this.tl;
    this.tl = d.tl;
    if (d.tp !== undefined) this.tp = d.tp;
    if (rankUp && this.tl > 0) this.fetchStudents();
    this.render();
  }

  private onInitTS(rows: unknown): void {
    this.students = (Array.isArray(rows) ? rows : []) as InitTsRow[];
    if (this.selected !== null && !this.students.some((s) => s.id === this.selected)) this.selected = null;
    this.render();
  }

  private onFindTeacher(d: FindTsPush): void {
    showMentorWarn(MENTOR_TEXT.askStudent(d.n), () => void this.host.client.call('acceptStudent', d.i).catch((e) => this.fail(e)));
  }

  private onFindStudent(d: FindTsPush): void {
    showMentorWarn(MENTOR_TEXT.askTeacher(d.n), () => void this.host.client.call('acceptTeacher', d.i).catch((e) => this.fail(e)));
  }

  private onMake(d: MakeTsPush): void {
    if (d.t === 1) {
      this.host.chat.notice(MENTOR_TEXT.newStudent(d.n));
      this.fetchStudents();
    } else {
      this.teacherId = d.i;
      this.teacherName = d.n;
      this.last = parseLl(formatLl(d.l, 0));
      this.host.chat.notice(MENTOR_TEXT.newTeacher(d.n));
    }
    this.render();
  }

  private onDel(d: DelStPush): void {
    if (d.t === 1) {
      this.students = this.students.filter((s) => s.id !== d.i);
      if (this.selected === d.i) this.selected = null;
    } else {
      this.teacherId = -1;
      this.teacherName = '';
      this.last = { level: 0, exp: 0 };
    }
    if (!this.quiet) this.host.chat.notice(MENTOR_TEXT.refusedBy(d.n));
    this.render();
  }

  private onReport(d: ReportTsPush): void {
    this.tp = d.tp;
    this.host.chat.notice(MENTOR_TEXT.reported(d.n));
    this.fetchStudents();
    this.render();
  }

  private onTutorAlert(): void {
    askConfirm(MENTOR_TEXT.npcConfirm, () => void this.host.client.call('confirmTutor').catch((e) => this.fail(e)));
  }
}
