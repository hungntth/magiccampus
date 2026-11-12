// Sư đồ report (reportTS), the teacher's student grid (initTS) and the login fields. A report needs a teacher online and a student
// level above the last reported one: gain = floor(sum levelExp(last+1..level) x 10 %) goes to the teacher's points and the pair's
// reported exp, the levels gained to the student's honor. The pair ledger is updated first (CAS on lastLevel), then the points.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ReportTsCode, formatLl, reportGain,
  type InitTsRow, type MentorLogin, type ReportTsPush, type ReportTsReply,
} from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { levelExp } from './mentor-rules';
import { MentorStateService, teacherLock } from './mentor-state.service';
import { MentorLink } from './mentor.schema';

const fail = (f: ReportTsReply['f']): ReportTsReply => ({ t: 2, f });

@Injectable()
export class MentorReportService {
  constructor(
    @InjectModel(MentorLink.name) private readonly links: Model<MentorLink>,
    private readonly characters: CharacterService,
    private readonly state: MentorStateService,
    private readonly scenes: SceneManager,
  ) {}

  /** reportTS: reply `{t:2, f, ll?}`; on success the online teacher gets `onReportTS`. */
  async report(session: Session): Promise<ReportTsReply> {
    const cid = session.characterId!;
    const link = await this.links.findOne({ studentId: cid }).lean();
    if (!link) return fail(ReportTsCode.NO_TEACHER);
    const me = await this.characters.getById(cid);
    if (me.level <= link.lastLevel) return fail(ReportTsCode.FAILED);
    const teacher = this.scenes.findByCharacter(link.teacherId);
    if (!teacher) return fail(ReportTsCode.TEACHER_OFFLINE);
    const done = await teacherLock(link.teacherId, async () => {
      const cur = await this.links.findOne({ studentId: cid, teacherId: link.teacherId }).lean();
      if (!cur) return fail(ReportTsCode.NO_TEACHER);
      if (me.level <= cur.lastLevel) return fail(ReportTsCode.FAILED);
      const gain = reportGain(cur.lastLevel, me.level, levelExp);
      const next = await this.links.findOneAndUpdate(
        { studentId: cid, teacherId: link.teacherId, lastLevel: cur.lastLevel },
        { $set: { lastLevel: me.level }, $inc: { exp: gain, honor: me.level - cur.lastLevel } },
        { new: true },
      ).lean();
      if (!next) return fail(ReportTsCode.FAILED);
      return { tp: await this.state.addPointsLocked(link.teacherId, gain), ll: formatLl(next.lastLevel, next.exp) };
    });
    if ('f' in done) return done;
    const push: ReportTsPush = { t: 1, i: cid, n: me.name, tp: done.tp, ll: done.ll };
    teacher.callback('onReportTS', push);
    return { t: 2, f: ReportTsCode.OK, ll: done.ll };
  }

  /** initTS: the teacher's students, oldest first (`onInitTS` array). */
  async students(teacherId: number): Promise<InitTsRow[]> {
    const rows = await this.links.find({ teacherId }).sort({ since: 1 }).lean();
    const names = new Map((await this.characters.findByIds(rows.map((r) => r.studentId))).map((c) => [c._id, c.name]));
    return rows.flatMap((r) => (names.has(r.studentId) ? [{ id: r.studentId, name: names.get(r.studentId)!, ll: formatLl(r.lastLevel, r.exp), honor: r.honor }] : []));
  }

  /** chooseCharactor extras ti / tn / tl / tp / ll; promotes a Lv 30+ rank-0 character who already finished quest 692 (silently). */
  async loginFields(characterId: number): Promise<MentorLogin> {
    const me = await this.characters.findByIds([characterId]);
    const rank = await this.state.qualify(characterId, me[0]?.level ?? 0, { announce: false });
    const link = await this.links.findOne({ studentId: characterId }).lean();
    const fields: MentorLogin = { ti: '-1', tn: '', tl: rank.tl, tp: rank.tp, ll: '0|0' };
    if (!link) return fields;
    const teacher = (await this.characters.findByIds([link.teacherId]))[0];
    return { ...fields, ti: String(link.teacherId), tn: teacher?.name ?? '', ll: formatLl(link.lastLevel, link.exp) };
  }
}
