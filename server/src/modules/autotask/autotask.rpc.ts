// Auto-task panel RPCs (Flash AutoTaskPanel / AutoTaskBox): getAutoTaskData() -> payload, autoTaskStart(tid), autoTaskCancel(tid),
// autoTaskComplete(tid), autoTaskCompleteByGold(tid, quote) (true = return the gold quote, false = pay it) and
// autoTaskGetAward(tid). Like Go the actions reply null and push onAutoTaskStart(payload); a refusal pushes
// onSystemMidMsgOrNote with Go's text and replies null. Wallet pushes (onAddMoney / onUPP) come from the service.

import { Injectable } from '@nestjs/common';
import type { AutoTaskPayload } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { AutoTaskRefusal, AutoTaskService } from './autotask.service';

function tidOf(args: unknown[]): number {
  const tid = Number(args[0]);
  if (!Number.isInteger(tid)) throw RpcException.invalidArgs('tid');
  return tid;
}

const truthy = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1';

@Injectable()
export class AutoTaskRpc {
  constructor(private readonly tasks: AutoTaskService) {}

  /** Runs an action; pushes the payload on success, the refusal note on a refusal. Always null. */
  private async act(session: Session, action: () => Promise<AutoTaskPayload>): Promise<null> {
    try {
      session.callback('onAutoTaskStart', await action());
    } catch (e) {
      if (!(e instanceof AutoTaskRefusal)) throw e;
      session.callback('onSystemMidMsgOrNote', e.message);
    }
    return null;
  }

  @Rpc('getAutoTaskData', { requireCharacter: true })
  getAutoTaskData(session: Session): Promise<AutoTaskPayload> {
    return this.tasks.getData(session);
  }

  @Rpc('autoTaskStart', { requireCharacter: true })
  autoTaskStart(session: Session, args: unknown[]): Promise<null> {
    const tid = tidOf(args);
    return this.act(session, () => this.tasks.start(session, tid));
  }

  @Rpc('autoTaskCancel', { requireCharacter: true })
  autoTaskCancel(session: Session, args: unknown[]): Promise<null> {
    const tid = tidOf(args);
    return this.act(session, () => this.tasks.cancel(session, tid));
  }

  /** The client countdown reached 0: the server advances by the wall clock, so this is only a refresh. */
  @Rpc('autoTaskComplete', { requireCharacter: true })
  autoTaskComplete(session: Session, args: unknown[]): Promise<null> {
    tidOf(args);
    return this.act(session, () => this.tasks.getData(session));
  }

  @Rpc('autoTaskCompleteByGold', { requireCharacter: true })
  async autoTaskCompleteByGold(session: Session, args: unknown[]): Promise<number | null> {
    const tid = tidOf(args);
    if (!truthy(args[1])) return this.act(session, () => this.tasks.completeByGold(session, tid));
    try {
      return await this.tasks.quote(session, tid);
    } catch (e) {
      if (!(e instanceof AutoTaskRefusal)) throw e;
      session.callback('onSystemMidMsgOrNote', e.message);
      return null;
    }
  }

  @Rpc('autoTaskGetAward', { requireCharacter: true })
  autoTaskGetAward(session: Session, args: unknown[]): Promise<null> {
    const tid = tidOf(args);
    return this.act(session, () => this.tasks.getAward(session, tid));
  }
}
