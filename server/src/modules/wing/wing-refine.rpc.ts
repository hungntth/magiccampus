// Wing RPCs, part 3 (refine, look, level): changeWingPrefix({e, i}) / sureChangeWingPrefix(1 | -1), changeWingBind(wingId, materialId) /
// sureChangeWingBind(1 | -1), changeWingColor(npcId) + onSureChangeWingColor(series) -> boolean, changeWingRes(index) -> {flag, newResCode},
// newWingAdvanced(useCrit, mode) / showNewWingPro / buyCritItem(n) (no reply: the state arrives as onShowNewWingPro, buyCritItem also pushes
// updateCritItemNum). Refusals show onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import type { ChangeWingBindReply, ChangeWingPrefixReply, ChangeWingResReply, SureChangeWingBindReply, SureChangeWingPrefixReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { guarded } from '../forge/forge-guard';
import { sendPushes } from '../inventory/pushes';
import { WingAdvanceService } from './wing-advance.service';
import { WingRefineService } from './wing-refine.service';
import { idOf, intArg, out } from './wing-rpc-util';

@Injectable()
export class WingRefineRpc {
  constructor(
    private readonly refine: WingRefineService,
    private readonly advance: WingAdvanceService,
  ) {}

  @Rpc('changeWingPrefix', { requireCharacter: true, forbidInBattle: true })
  changeWingPrefix(session: Session, args: unknown[]): Promise<ChangeWingPrefixReply> {
    const req = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : null;
    if (!req) throw RpcException.invalidArgs('request');
    return out<ChangeWingPrefixReply>(session, { f: false }, () => this.refine.prefix(session.characterId!, idOf(req.e), idOf(req.i)));
  }

  @Rpc('sureChangeWingPrefix', { requireCharacter: true, forbidInBattle: true })
  sureChangeWingPrefix(session: Session, args: unknown[]): Promise<SureChangeWingPrefixReply> {
    return out<SureChangeWingPrefixReply>(session, { f: 'false' }, () => this.refine.surePrefix(session.characterId!, intArg(args[0])));
  }

  @Rpc('changeWingBind', { requireCharacter: true, forbidInBattle: true })
  changeWingBind(session: Session, args: unknown[]): Promise<ChangeWingBindReply> {
    return out<ChangeWingBindReply>(session, { f: false }, () => this.refine.bind(session.characterId!, idOf(args[0]), idOf(args[1])));
  }

  @Rpc('sureChangeWingBind', { requireCharacter: true, forbidInBattle: true })
  sureChangeWingBind(session: Session, args: unknown[]): Promise<SureChangeWingBindReply> {
    return out<SureChangeWingBindReply>(session, { f: 'false' }, () => this.refine.sureBind(session.characterId!, intArg(args[0])));
  }

  /** The NPC id argument (1502) is ignored: the H5 panel calls this directly after its own confirm. */
  @Rpc('changeWingColor', { requireCharacter: true, forbidInBattle: true })
  changeWingColor(session: Session): Promise<null> {
    return out<null>(session, null, () => this.refine.dye(session.characterId!));
  }

  @Rpc('onSureChangeWingColor', { requireCharacter: true, forbidInBattle: true })
  onSureChangeWingColor(session: Session, args: unknown[]): Promise<boolean> {
    return out(session, false, () => this.refine.sureDye(session.characterId!, intArg(args[0])));
  }

  @Rpc('changeWingRes', { requireCharacter: true, forbidInBattle: true })
  changeWingRes(session: Session, args: unknown[]): Promise<ChangeWingResReply> {
    return out<ChangeWingResReply>(session, { flag: false }, () => this.refine.look(session.characterId!, intArg(args[0])));
  }

  @Rpc('showNewWingPro', { requireCharacter: true })
  async showNewWingPro(session: Session): Promise<null> {
    sendPushes(session, (await this.advance.show(session.characterId!)).pushes);
    return null;
  }

  /** The panel state is pushed even when the request is refused (the legacy handler defers it). */
  @Rpc('newWingAdvanced', { requireCharacter: true, forbidInBattle: true })
  async newWingAdvanced(session: Session, args: unknown[]): Promise<null> {
    const cid = session.characterId!;
    const done = await guarded<boolean>(session, false, async () => {
      sendPushes(session, (await this.advance.advance(cid, args[0] === true, intArg(args[1]))).pushes);
      return true;
    });
    if (!done) sendPushes(session, (await this.advance.show(cid)).pushes);
    return null;
  }

  @Rpc('buyCritItem', { requireCharacter: true, forbidInBattle: true })
  buyCritItem(session: Session, args: unknown[]): Promise<null> {
    return out<null>(session, null, () => this.advance.buyCrit(session.characterId!, intArg(args[0])));
  }
}
