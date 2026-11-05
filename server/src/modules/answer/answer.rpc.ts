// Daily answer RPCs (Flash AnswerPanel): getAnswer(), getAnswerByMoney() reply null and push onGetAnswer {f, n, d?}; selAnswer(opt)
// replies 1 right / 2 wrong / 3 invalid / 4 timeout (a right answer pushes onUPP + level-up). Opened from NPC 9001 (answer.hooks.ts).

import { Injectable } from '@nestjs/common';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { AnswerService } from './answer.service';

@Injectable()
export class AnswerRpc {
  constructor(private readonly answers: AnswerService) {}

  @Rpc('getAnswer', { requireCharacter: true })
  async getAnswer(session: Session): Promise<null> {
    await this.answers.draw(session, false);
    return null;
  }

  @Rpc('getAnswerByMoney', { requireCharacter: true })
  async getAnswerByMoney(session: Session): Promise<null> {
    await this.answers.draw(session, true);
    return null;
  }

  @Rpc('selAnswer', { requireCharacter: true })
  selAnswer(session: Session, args: unknown[]): Promise<number> {
    const option = args[0];
    if (typeof option !== 'string' || option.length > 8) throw RpcException.invalidArgs('option');
    return this.answers.select(session, option);
  }
}
