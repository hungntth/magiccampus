// Wing RPCs, part 1: wingJoin(mainId, {w1..w4}), wingSeniorJoin(mainId, subIds), addWingStar(count, wingId, stoneId, upToNum),
// addWingHole(wingId, materialId) and the dead checkLimitWingEffect (answers null). Replies keep the Flash shapes; a refusal shows
// onSystemMidMsgOrNote and answers the failure shape.

import { Injectable } from '@nestjs/common';
import type { AddWingHoleReply, WingJoinReply, WingStarReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { WingJoinService } from './wing-join.service';
import { WingUpgradeService } from './wing-upgrade.service';
import { idOf, intArg, out } from './wing-rpc-util';

@Injectable()
export class WingRpc {
  constructor(
    private readonly join: WingJoinService,
    private readonly upgrade: WingUpgradeService,
  ) {}

  @Rpc('wingJoin', { requireCharacter: true, forbidInBattle: true })
  wingJoin(session: Session, args: unknown[]): Promise<WingJoinReply> {
    const mainId = idOf(args[0]);
    const subs = typeof args[1] === 'object' && args[1] !== null ? (args[1] as Record<string, unknown>) : null;
    if (!mainId || !subs) throw RpcException.invalidArgs('wings');
    const ids = ['w1', 'w2', 'w3', 'w4'].map((k) => idOf(subs[k]));
    if (ids.some((id) => id <= 0)) throw RpcException.invalidArgs('wings');
    return out<WingJoinReply>(session, { f: false }, () => this.join.join(session.characterId!, mainId, ids, false));
  }

  /** The Flash panel sends the sub ids as an Array; the wire may deliver it as an object {"0": id, ...}. */
  @Rpc('wingSeniorJoin', { requireCharacter: true, forbidInBattle: true })
  wingSeniorJoin(session: Session, args: unknown[]): Promise<WingJoinReply> {
    const mainId = idOf(args[0]);
    const raw = Array.isArray(args[1]) ? args[1] : typeof args[1] === 'object' && args[1] !== null ? Object.values(args[1]) : [];
    const ids = raw.map(idOf);
    if (!mainId || ids.length === 0 || ids.some((id) => id <= 0)) throw RpcException.invalidArgs('wings');
    return out<WingJoinReply>(session, { f: false }, () => this.join.join(session.characterId!, mainId, ids, true));
  }

  @Rpc('addWingStar', { requireCharacter: true, forbidInBattle: true })
  addWingStar(session: Session, args: unknown[]): Promise<WingStarReply> {
    const [count, wingId, stoneId, upTo] = [intArg(args[0]), idOf(args[1]), idOf(args[2]), intArg(args[3])];
    const fail: WingStarReply = { equSlotId: wingId, itemSlotId: stoneId, num: 0, upgradeNum: 0, flag: false };
    return out(session, fail, () => this.upgrade.star(session.characterId!, count, wingId, stoneId, upTo));
  }

  @Rpc('addWingHole', { requireCharacter: true, forbidInBattle: true })
  addWingHole(session: Session, args: unknown[]): Promise<AddWingHoleReply> {
    const [wingId, materialId] = [idOf(args[0]), idOf(args[1])];
    return out<AddWingHoleReply>(session, { f: false }, () => this.upgrade.hole(session.characterId!, wingId, materialId));
  }

  /** Timed wing effects: dead in the legacy server (hasWing false), the H5 client never polls it. */
  @Rpc('checkLimitWingEffect', { requireCharacter: true })
  checkLimitWingEffect(): null {
    return null;
  }
}
