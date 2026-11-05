// Star instance RPCs (Flash StarInstanceMap): getWarMap() -> {d, s, p, pnt}, clickWarMap(sid, level) -> {c, d?}, addWarMapTime(smax) -> new
// smax (0 = failed). Pushes (via the service): updateWarMapStatus {smax} | {snum}, setStarPoint(n), onAddMoney / onUPP on a purchase. The palace
// battle ends through battlePlayEnd (reply = star report, see StarInstanceService). Registered WITHOUT quiet while the feature is new.

import { Injectable } from '@nestjs/common';
import { WAR_MAP_LEVELS, WAR_MAP_SIDS, type ClickWarMapReply, type WarMapReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { StarInstanceService } from './starinstance.service';

function cell(args: unknown[]): { sid: number; level: number } {
  const sid = Number(args[0]);
  const level = Number(args[1]);
  if (!Number.isInteger(sid) || sid < 1 || sid > WAR_MAP_SIDS) throw RpcException.invalidArgs('sid');
  if (!Number.isInteger(level) || level < 1 || level > WAR_MAP_LEVELS) throw RpcException.invalidArgs('level');
  return { sid, level };
}

@Injectable()
export class StarInstanceRpc {
  constructor(private readonly star: StarInstanceService) {}

  @Rpc('getWarMap', { requireCharacter: true })
  getWarMap(session: Session): Promise<WarMapReply> {
    return this.star.getWarMap(session.characterId!);
  }

  @Rpc('clickWarMap', { requireCharacter: true, forbidInBattle: true })
  clickWarMap(session: Session, args: unknown[]): Promise<ClickWarMapReply> {
    const { sid, level } = cell(args);
    return this.star.click(session, sid, level);
  }

  @Rpc('addWarMapTime', { requireCharacter: true })
  addWarMapTime(session: Session, args: unknown[]): Promise<number> {
    const max = Number(args[0]);
    if (!Number.isInteger(max)) throw RpcException.invalidArgs('smax');
    return this.star.addTime(session, max);
  }
}
