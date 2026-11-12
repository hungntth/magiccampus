// Sư đồ RPCs (Flash names): initTS (-> onInitTS rows), findTeacher / findStudent (Responder {t, f}; the target gets onFindTeacher /
// onFindStudent), acceptStudent / acceptTeacher (-> onMakeTS x2, onInitViewImC x2), reportTS (Responder {t:2, f, ll}; teacher gets
// onReportTS), delST / delTeacher (-> onDelST x2, onInitViewImC x2), upTeacher (-> onUPP {tl, tp} + title; reply {t:1, tl, tp}),
// npcFuncOther(49, 1) (-> tutorFuncAlert {i}) and confirmTutor. Refusals are RpcException toasts except where Flash reads the reply.

import { Injectable } from '@nestjs/common';
import { NPC_TUTOR, type FindTsReply, type ReportTsReply, type UpTeacherReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { MentorNpcService } from './mentor-npc.service';
import { MentorReportService } from './mentor-report.service';
import { MentorStateService } from './mentor-state.service';
import { MentorService } from './mentor.service';

const idArg = (v: unknown, field: string): number => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs(field);
  return id;
};

@Injectable()
export class MentorRpc {
  constructor(
    private readonly mentor: MentorService,
    private readonly report: MentorReportService,
    private readonly state: MentorStateService,
    private readonly npc: MentorNpcService,
  ) {}

  @Rpc('initTS', { requireCharacter: true })
  async initTS(session: Session): Promise<null> {
    session.callback('onInitTS', await this.report.students(session.characterId!));
    return null;
  }

  @Rpc('findTeacher', { requireCharacter: true })
  findTeacher(session: Session, args: unknown[]): Promise<FindTsReply> {
    return this.mentor.find(session, args[0], true);
  }

  @Rpc('findStudent', { requireCharacter: true })
  findStudent(session: Session, args: unknown[]): Promise<FindTsReply> {
    return this.mentor.find(session, args[0], false);
  }

  @Rpc('acceptStudent', { requireCharacter: true, forbidInBattle: true })
  async acceptStudent(session: Session, args: unknown[]): Promise<null> {
    await this.mentor.accept(session, idArg(args[0], 'studentId'), true);
    return null;
  }

  @Rpc('acceptTeacher', { requireCharacter: true, forbidInBattle: true })
  async acceptTeacher(session: Session, args: unknown[]): Promise<null> {
    await this.mentor.accept(session, idArg(args[0], 'teacherId'), false);
    return null;
  }

  @Rpc('reportTS', { requireCharacter: true })
  reportTS(session: Session): Promise<ReportTsReply> {
    return this.report.report(session);
  }

  @Rpc('delST', { requireCharacter: true, forbidInBattle: true })
  async delST(session: Session, args: unknown[]): Promise<null> {
    await this.mentor.removeStudent(session, idArg(args[0], 'studentId'));
    return null;
  }

  @Rpc('delTeacher', { requireCharacter: true, forbidInBattle: true })
  async delTeacher(session: Session): Promise<null> {
    await this.mentor.leaveTeacher(session);
    return null;
  }

  @Rpc('upTeacher', { requireCharacter: true, forbidInBattle: true })
  async upTeacher(session: Session): Promise<UpTeacherReply> {
    const { tl, tp } = await this.state.upgrade(session.characterId!);
    return { t: 1, tl, tp };
  }

  /** NPC function pick of the legacy dialog: only (49, 1) exists. */
  @Rpc('npcFuncOther', { requireCharacter: true, forbidInBattle: true })
  async npcFuncOther(session: Session, args: unknown[]): Promise<null> {
    if (Number(args[0]) !== NPC_TUTOR.npcId || Number(args[1]) !== NPC_TUTOR.funcId) throw RpcException.invalidArgs('npcFuncOther');
    await this.npc.ask(session);
    return null;
  }

  @Rpc('confirmTutor', { requireCharacter: true, forbidInBattle: true })
  async confirmTutor(session: Session): Promise<null> {
    await this.npc.confirm(session);
    return null;
  }
}
