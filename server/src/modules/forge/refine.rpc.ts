// Refinement RPCs (Flash names): changeElement / sureChangeElement, changeBind / sureChangeBind, changeSoul / sureChangeSoul,
// changePrefix / sureChangePrefix and changeName. Previews of element / bind / soul charge at once and are kept in memory per
// character; sureChange*(1|0) applies or drops them. A refusal shows onSystemMidMsgOrNote and answers {f:false}.

import { Injectable } from '@nestjs/common';
import type {
  ChangeBindReply, ChangeElementReply, ChangeNameResult, ChangePrefixReply, ChangeSoulResult, SureBindReply, SureElementReply,
  SurePrefixReply, SureSoulReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes, type Push } from '../inventory/pushes';
import { guarded, idArg, parseUpgradeRequest } from './forge-guard';
import { PrefixService } from './prefix.service';
import { RefineService } from './refine.service';

const decisionOf = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs('decision');
  return n;
};

@Injectable()
export class RefineRpc {
  constructor(private readonly refine: RefineService, private readonly prefix: PrefixService) {}

  @Rpc('changeElement', { requireCharacter: true, forbidInBattle: true })
  changeElement(session: Session, args: unknown[]): Promise<ChangeElementReply> {
    const [equipId, matId] = [idArg(args[0], 'equipId'), idArg(args[1], 'material')];
    return this.send<ChangeElementReply>(session, { f: false }, () => this.refine.element(session.characterId!, equipId, matId));
  }

  @Rpc('sureChangeElement', { requireCharacter: true, forbidInBattle: true })
  sureChangeElement(session: Session, args: unknown[]): Promise<SureElementReply> {
    const d = decisionOf(args[0]);
    return this.send(session, { f: 'false' }, () => this.refine.sureElement(session.characterId!, d));
  }

  @Rpc('changeBind', { requireCharacter: true, forbidInBattle: true })
  changeBind(session: Session, args: unknown[]): Promise<ChangeBindReply> {
    const [equipId, matId] = [idArg(args[0], 'equipId'), idArg(args[1], 'material')];
    return this.send<ChangeBindReply>(session, { f: false }, () => this.refine.bind(session.characterId!, equipId, matId));
  }

  @Rpc('sureChangeBind', { requireCharacter: true, forbidInBattle: true })
  sureChangeBind(session: Session, args: unknown[]): Promise<SureBindReply> {
    const d = decisionOf(args[0]);
    return this.send(session, { f: 'false' }, () => this.refine.sureBind(session.characterId!, d));
  }

  /** `changeSoul(equipId, materialItemId, mode 1 full re-roll | 2 value only)`. */
  @Rpc('changeSoul', { requireCharacter: true, forbidInBattle: true })
  changeSoul(session: Session, args: unknown[]): Promise<ChangeSoulResult> {
    const [equipId, matId, mode] = [idArg(args[0], 'equipId'), idArg(args[1], 'material'), Number(args[2])];
    return this.send<ChangeSoulResult>(session, { f: false }, () => this.refine.soul(session.characterId!, equipId, matId, mode));
  }

  @Rpc('sureChangeSoul', { requireCharacter: true, forbidInBattle: true })
  sureChangeSoul(session: Session, args: unknown[]): Promise<SureSoulReply> {
    const d = decisionOf(args[0]);
    return this.send(session, { f: 'false' }, () => this.refine.sureSoul(session.characterId!, d));
  }

  @Rpc('changePrefix', { requireCharacter: true, forbidInBattle: true })
  changePrefix(session: Session, args: unknown[]): Promise<ChangePrefixReply> {
    const req = parseUpgradeRequest(args[0]);
    return this.send<ChangePrefixReply>(session, { f: false }, () => this.prefix.preview(session.characterId!, req));
  }

  @Rpc('sureChangePrefix', { requireCharacter: true, forbidInBattle: true })
  sureChangePrefix(session: Session, args: unknown[]): Promise<SurePrefixReply> {
    const d = decisionOf(args[0]);
    return this.send(session, { f: false }, () => this.prefix.confirm(session.characterId!, d));
  }

  /** Maker signature (`changeName(equipId, materialItemId, tempBagFlag)`): applied at once, no confirm step. */
  @Rpc('changeName', { requireCharacter: true, forbidInBattle: true })
  changeName(session: Session, args: unknown[]): Promise<ChangeNameResult> {
    const [equipId, matId] = [idArg(args[0], 'equipId'), idArg(args[1], 'material')];
    return this.send<ChangeNameResult>(session, { f: false }, () => this.refine.name(session.characterId!, equipId, matId, session.characterName ?? ''));
  }

  private send<R>(session: Session, fail: R, op: () => Promise<{ reply: R; pushes: Push[] }>): Promise<R> {
    return guarded(session, fail, async () => {
      const r = await op();
      sendPushes(session, r.pushes);
      return r.reply;
    });
  }
}
