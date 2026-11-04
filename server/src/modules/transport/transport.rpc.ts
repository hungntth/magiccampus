// Transport RPCs (Flash names): useTransport(mapId[, flag]) personal, useTransportGroup(mapId) (a party leader pays senior and takes the
// followers along), useItemGold({tid, mid}) buy-and-use with gold, plus the H5 helper getTransportMaps() for the map picker.
// Pushes: onSceneEnter (scene reload), onUPP{gold key}, slot pushes for a consumed scroll, onSystemMidMsgOrNote on refusal.

import { Injectable } from '@nestjs/common';
import { isSeniorScroll, type TransportMapsReply, type TransportReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { TransportService } from './transport.service';

const mapArg = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs('mapId');
  return n;
};

@Injectable()
export class TransportRpc {
  constructor(private readonly transport: TransportService) {}

  /** Personal transport: regular scrolls first, then senior; gold fallback 3. A leader moves alone (followers stay put). */
  @Rpc('useTransport', { requireCharacter: true, forbidInBattle: true })
  useTransport(session: Session, args: unknown[]): Promise<TransportReply> {
    const mapId = mapArg(args[0]);
    return midNoteOnFail(session, () => this.transport.travel(session, mapId, false));
  }

  /** Leader: senior scrolls / 5 gold and the followers come along; anyone else: same as useTransport. */
  @Rpc('useTransportGroup', { requireCharacter: true, forbidInBattle: true })
  useTransportGroup(session: Session, args: unknown[]): Promise<TransportReply> {
    const mapId = mapArg(args[0]);
    return midNoteOnFail(session, () => this.transport.travel(session, mapId, this.transport.isLeader(session)));
  }

  /** Buy-and-use: `tid` a senior scroll -> senior list and price; `mid <= 0` is a no-op reply (Go: buy-only is not ported). */
  @Rpc('useItemGold', { requireCharacter: true, forbidInBattle: true })
  useItemGold(session: Session, args: unknown[]): Promise<TransportReply> {
    const o = (args[0] ?? {}) as Record<string, unknown>;
    const tid = Number(o.tid);
    const mid = o.mid === undefined ? 0 : mapArg(o.mid);
    if (!Number.isInteger(tid)) throw RpcException.invalidArgs('tid');
    if (mid <= 0) return Promise.resolve({ success: true, tid: 0, gold: 0 });
    return midNoteOnFail(session, () => this.transport.travel(session, mid, isSeniorScroll(tid)));
  }

  /** H5 helper: destinations for the scroll picker and whether the caller leads a party. */
  @Rpc('getTransportMaps', { requireCharacter: true })
  getTransportMaps(session: Session): TransportMapsReply {
    return { maps: this.transport.maps(), leader: this.transport.isLeader(session), current: session.mapId };
  }
}
