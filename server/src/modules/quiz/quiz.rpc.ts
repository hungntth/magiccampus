// Quiz event RPCs (Flash QuestioningPanel): canQuest(playerId) -> bool, subQuestionApply() -> QuizApplyReply, subAnswer(opt) -> 1 right /
// -1 wrong / 2 early / 3 late / 4 already, useFDJ() / useXYX() / useXLY(cid) -> QuizItemReply, dropQuestion() -> null, and the GM
// test RPC gmQuiz(action, regSeconds?) behind chat /quiz start|stop|status. Pushes come from QuizService.

import { Injectable } from '@nestjs/common';
import { QUIZ, type QuizApplyReply, type QuizItemReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { QuizService } from './quiz.service';

const MIN_REG_SECONDS = 5;
const MAX_REG_SECONDS = 600;

@Injectable()
export class QuizRpc {
  constructor(private readonly quiz: QuizService) {}

  @Rpc('canQuest', { requireCharacter: true })
  canQuest(session: Session): boolean {
    return this.quiz.canJoin(session.characterId!);
  }

  @Rpc('subQuestionApply', { requireCharacter: true })
  subQuestionApply(session: Session): Promise<QuizApplyReply> {
    return this.quiz.apply(session);
  }

  @Rpc('subAnswer', { requireCharacter: true })
  subAnswer(session: Session, args: unknown[]): number {
    const option = args[0];
    if (typeof option !== 'string' || option.length > 8) throw RpcException.invalidArgs('option');
    return this.quiz.answer(session.characterId!, option);
  }

  @Rpc('useFDJ', { requireCharacter: true })
  useFDJ(session: Session): QuizItemReply {
    return this.quiz.fdj(session.characterId!);
  }

  @Rpc('useXYX', { requireCharacter: true })
  useXYX(session: Session): QuizItemReply {
    return this.quiz.xyx(session.characterId!);
  }

  @Rpc('useXLY', { requireCharacter: true })
  useXLY(session: Session, args: unknown[]): QuizItemReply {
    const target = Number(args[0]);
    if (!Number.isInteger(target) || target <= 0) throw RpcException.invalidArgs('cid');
    return this.quiz.xly(session.characterId!, target);
  }

  @Rpc('dropQuestion', { requireCharacter: true })
  dropQuestion(session: Session): null {
    this.quiz.drop(session.characterId!);
    return null;
  }

  @Rpc('gmQuiz', { requireCharacter: true, requireGm: true })
  async gmQuiz(session: Session, args: unknown[]): Promise<string> {
    const action = args[0];
    if (action === 'status') return this.quiz.status();
    if (action === 'start') {
      const secs = args[1] === undefined ? QUIZ.REGISTRATION_MS / 1000 : Number(args[1]);
      if (!Number.isInteger(secs) || secs < MIN_REG_SECONDS || secs > MAX_REG_SECONDS) throw RpcException.invalidArgs('regSeconds');
      if (!(await this.quiz.start(secs * 1000))) throw RpcException.forbidden('Đố vui đang diễn ra hoặc chưa có câu hỏi.');
      return `Đã mở báo danh Đố Vui Có Thưởng (${secs} giây).`;
    }
    if (action === 'stop') {
      if (!(await this.quiz.stop())) throw RpcException.forbidden('Đố vui không diễn ra.');
      return 'Đã kết thúc Đố Vui Có Thưởng.';
    }
    throw RpcException.invalidArgs('action');
  }
}
