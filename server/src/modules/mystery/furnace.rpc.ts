// Lò luyện thần bí RPCs (legacy MysteryFurnace, Flash names kept): MysteryExchangeItem({instanceId: true}, md5pass) -> {num, mysteryCrystal}, MysteryExchangeScore({type: count}, md5pass)
// -> {num} and the H5 read getFurnaceInfo -> FurnaceInfo. `md5pass` (secondary password) is accepted and ignored: H5 has none. A refusal shows onSystemMidMsgOrNote and rejects.

import { Injectable } from '@nestjs/common';
import type { FurnaceInfo, FurnaceReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { FurnaceService } from './furnace.service';

@Injectable()
export class FurnaceRpc {
  constructor(private readonly furnace: FurnaceService) {}

  @Rpc('getFurnaceInfo', { requireCharacter: true })
  getInfo(session: Session): Promise<FurnaceInfo> {
    return this.furnace.info(session.characterId!);
  }

  @Rpc('MysteryExchangeItem', { requireCharacter: true, forbidInBattle: true })
  exchangeItem(session: Session, args: unknown[]): Promise<FurnaceReply> {
    return midNoteOnFail(session, () => this.furnace.exchangeItems(session, args[0]));
  }

  @Rpc('MysteryExchangeScore', { requireCharacter: true, forbidInBattle: true })
  exchangeScore(session: Session, args: unknown[]): Promise<FurnaceReply> {
    return midNoteOnFail(session, () => this.furnace.exchangeScores(session, args[0]));
  }
}
