// Sư đồ pairing: findTeacher / findStudent (request + f code), acceptStudent / acceptTeacher, the shared link step (NPC 49 reuses
// it) and delST / delTeacher. Links live in `mentor_links` (one row per student) plus type 5 relationship rows in both directions
// (RelationshipService.link keeps friend intimacy). Linking and dissolving run under the teacher lock; the persisted change comes
// first, pushes after (Go handlers/mentor/handler.go order: onMakeTS x2, [onUPP + title], onInitViewImC x2).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FindTsCode, MENTOR_TEXT, RelationType,
  type DelStPush, type FindTsPush, type FindTsReply, type MakeTsPush,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import type { CharacterDocument } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { RelationshipService } from '../social/relationship.service';
import { NpcDrafts, PendingRequests } from './mentor-pending';
import { REFUSAL, checkPair, findCode, npcLocked, npcRefusalText, refusalText, validName, type PairReason } from './mentor-rules';
import { MentorStateService, teacherLock } from './mentor-state.service';
import { MentorLink, type MentorLinkDocument } from './mentor.schema';

interface PairView {
  reason: PairReason;
  teacher?: CharacterDocument;
  student?: CharacterDocument;
  hadFriendRow: boolean;
}

@Injectable()
export class MentorService {
  readonly pending = new PendingRequests();
  readonly drafts = new NpcDrafts();
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    @InjectModel(MentorLink.name) private readonly links: Model<MentorLink>,
    private readonly characters: CharacterService,
    private readonly relations: RelationshipService,
    private readonly state: MentorStateService,
    private readonly scenes: SceneManager,
  ) {}

  online(characterId: number): Session | undefined {
    return this.scenes.findByCharacter(characterId);
  }

  forget(characterId: number): void {
    this.pending.dropFor(characterId);
    this.drafts.dropFor(characterId);
  }

  /**
   * Eligibility of a (teacher, student) pair from the current data. `qualify` lazily promotes a Lv 30+ rank-0 teacher who finished
   * quest 692 (pushes onUPP + title); it must stay false while the caller holds the teacher lock.
   */
  async pairView(teacherId: number, studentId: number, npc: boolean, qualify: boolean): Promise<PairView> {
    if (teacherId === studentId) return { reason: 'self', hadFriendRow: false };
    const chars = await this.characters.findByIds([teacherId, studentId]);
    const teacher = chars.find((c) => c._id === teacherId);
    const student = chars.find((c) => c._id === studentId);
    if (!teacher || !student) return { reason: 'notFound', hadFriendRow: false };
    if (qualify && !npc) await this.state.qualify(teacherId, teacher.level, { announce: true });
    const [rank, students, hasTeacher, reversed, ab, ba] = await Promise.all([
      this.state.rank(teacherId),
      this.links.countDocuments({ teacherId }),
      this.links.exists({ studentId }),
      this.links.exists({ teacherId: studentId, studentId: teacherId }),
      this.relations.get(teacherId, studentId),
      this.relations.get(studentId, teacherId),
    ]);
    const rowTypes = [ab?.type, ba?.type].filter((t): t is number => t !== undefined);
    const reason = checkPair({
      npc, teacherLevel: teacher.level, studentLevel: student.level, teacherRank: rank.tl, teacherStudents: students,
      studentHasTeacher: hasTeacher !== null, reversed: reversed !== null, rowTypes,
    });
    return { reason, teacher, student, hadFriendRow: rowTypes.includes(RelationType.FRIEND) };
  }

  /** findTeacher (`byStudent`: the caller is the student) / findStudent. Replies with the f code; on f 1 the target gets the warn push. */
  async find(session: Session, rawName: unknown, byStudent: boolean): Promise<FindTsReply> {
    const selfId = session.characterId!;
    const t = byStudent ? 2 : 1;
    const reply = (reason: PairReason): FindTsReply => ({ t, f: findCode(reason, byStudent) });
    const name = validName(rawName);
    const target = name ? await this.characters.findByName(name) : null;
    if (!target) return reply('notFound');
    if (target._id !== selfId && !this.online(target._id)) return reply('offline');
    const [teacherId, studentId] = byStudent ? [target._id, selfId] : [selfId, target._id];
    const { reason } = await this.pairView(teacherId, studentId, false, true);
    if (reason !== 'ok') return reply(reason);
    this.pending.remember(teacherId, studentId, byStudent, this.now());
    const selfName = session.characterName ?? (await this.characters.getById(selfId)).name;
    const push: FindTsPush = byStudent ? { t: 1, i: selfId, n: selfName } : { t: 2, i: selfId, n: selfName };
    this.online(target._id)?.callback(byStudent ? 'onFindTeacher' : 'onFindStudent', push);
    return { t, f: FindTsCode.WAITING };
  }

  /** acceptStudent(studentId) (`actorIsTeacher`) / acceptTeacher(teacherId): consumes the request, re-checks, links. */
  async accept(session: Session, otherId: number, actorIsTeacher: boolean): Promise<void> {
    const selfId = session.characterId!;
    const [teacherId, studentId] = actorIsTeacher ? [selfId, otherId] : [otherId, selfId];
    if (!this.pending.consume(teacherId, studentId, actorIsTeacher, this.now())) throw RpcException.forbidden(MENTOR_TEXT.expired);
    if (!this.online(otherId)) throw RpcException.forbidden(refusalText('offline', actorIsTeacher));
    const { reason } = await this.pairView(teacherId, studentId, false, true);
    if (reason !== 'ok') throw RpcException.forbidden(refusalText(reason, actorIsTeacher));
    await this.linkPair(teacherId, studentId, false, actorIsTeacher);
  }

  /** Re-checks under the teacher lock, writes the link + tutor rows, then announces. `npc` links also promote a rank-0 teacher. */
  async linkPair(teacherId: number, studentId: number, npc: boolean, actorIsTeacher: boolean): Promise<void> {
    const made = await teacherLock(teacherId, async () => {
      const v = await this.pairView(teacherId, studentId, npc, false);
      if (v.reason !== 'ok' || !v.teacher || !v.student) {
        throw RpcException.forbidden(npc ? npcRefusalText(v.reason) : refusalText(v.reason, actorIsTeacher));
      }
      try {
        await this.links.create({ studentId, teacherId, lastLevel: v.student.level, exp: 0, honor: 0, npc, fb: v.hadFriendRow, since: new Date(this.now()) });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) throw RpcException.forbidden(refusalText('hasTeacher', actorIsTeacher));
        throw e;
      }
      try {
        await this.relations.link(teacherId, studentId, RelationType.TUTOR);
      } catch (e) {
        await this.links.deleteOne({ studentId, teacherId });
        throw e;
      }
      const promoted = npc && (await this.state.rank(teacherId)).tl < 1 ? await this.state.setRankLocked(teacherId, 1, false) : null;
      return { teacher: v.teacher, student: v.student, promoted };
    });
    const toTeacher: MakeTsPush = { t: 1, i: studentId, n: made.student.name, l: made.student.level };
    const toStudent: MakeTsPush = { t: 2, i: teacherId, n: made.teacher.name, l: made.student.level };
    this.online(teacherId)?.callback('onMakeTS', toTeacher);
    this.online(studentId)?.callback('onMakeTS', toStudent);
    if (made.promoted) await this.state.announceRank(teacherId, made.promoted, false);
    await Promise.all([this.relations.pushSnapshot(teacherId), this.relations.pushSnapshot(studentId)]);
  }

  /** delST(studentId) by the teacher. */
  removeStudent(session: Session, studentId: number): Promise<void> {
    return this.dissolve(session.characterId!, studentId, MENTOR_TEXT.noStudent);
  }

  /** delTeacher() by the student. */
  async leaveTeacher(session: Session): Promise<void> {
    const link = await this.links.findOne({ studentId: session.characterId! }).lean();
    if (!link) throw RpcException.forbidden(MENTOR_TEXT.noTeacher);
    await this.dissolve(link.teacherId, session.characterId!, MENTOR_TEXT.noTeacher);
  }

  private async dissolve(teacherId: number, studentId: number, missingText: string): Promise<void> {
    const gone = await teacherLock(teacherId, async () => {
      const link: MentorLinkDocument | null = await this.links.findOne({ studentId, teacherId });
      if (!link) throw RpcException.forbidden(missingText);
      const chars = await this.characters.findByIds([teacherId, studentId]);
      const student = chars.find((c) => c._id === studentId);
      if (npcLocked(link.npc, student?.level ?? 0)) throw RpcException.forbidden(MENTOR_TEXT.npcLocked);
      await this.links.deleteOne({ _id: link._id });
      if (link.fb) await this.relations.convert(teacherId, studentId, RelationType.FRIEND);
      else await this.relations.unlink(teacherId, studentId);
      return { teacherName: chars.find((c) => c._id === teacherId)?.name ?? '', studentName: student?.name ?? '' };
    });
    const toTeacher: DelStPush = { t: 1, i: studentId, n: gone.studentName };
    const toStudent: DelStPush = { t: 2, i: teacherId, n: gone.teacherName };
    this.online(teacherId)?.callback('onDelST', toTeacher);
    this.online(studentId)?.callback('onDelST', toStudent);
    await Promise.all([this.relations.pushSnapshot(teacherId), this.relations.pushSnapshot(studentId)]);
  }

  /** NPC 49 pair check with the Go refusals (toasts): throws unless the member and the leader may link. */
  async checkNpc(studentId: number, leaderId: number): Promise<void> {
    if (leaderId <= 0) throw RpcException.forbidden(REFUSAL.noTeam);
    if (leaderId === studentId) throw RpcException.forbidden(REFUSAL.isLeader);
    if (!this.online(leaderId)) throw RpcException.forbidden(REFUSAL.leaderOffline);
    const { reason } = await this.pairView(leaderId, studentId, true, false);
    if (reason !== 'ok') throw RpcException.forbidden(npcRefusalText(reason));
  }
}
