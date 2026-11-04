// Train soul + awakening RPCs. Flash: trainSoul (reply {soulLvl, soulExp}), awakening(autoBuy), ensureBuyAwaken, addAwakenPoint(skillId),
// reduceAwakenPoint(skillId). H5 reads: getTrainSoulInfo, getAwakenInfo. Refusals reach the player as onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import type { AwakenInfo, AwakenPointReply, AwakenReply, TrainSoulInfo, TrainSoulResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { AwakenService } from './awaken.service';
import { SoulService } from './soul.service';

function skillArg(args: unknown[]): number {
  const id = Number(args[0]);
  if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('skillId');
  return id;
}

@Injectable()
export class SoulRpc {
  constructor(
    private readonly soul: SoulService,
    private readonly awaken: AwakenService,
  ) {}

  @Rpc('trainSoul', { requireCharacter: true, forbidInBattle: true })
  trainSoul(session: Session): Promise<TrainSoulResult> {
    return midNoteOnFail(session, () => this.soul.train(session));
  }

  @Rpc('getTrainSoulInfo', { requireCharacter: true })
  getTrainSoulInfo(session: Session): Promise<TrainSoulInfo> {
    return this.soul.info(session.characterId!);
  }

  @Rpc('awakening', { requireCharacter: true, forbidInBattle: true })
  awakening(session: Session, args: unknown[]): Promise<AwakenReply> {
    return midNoteOnFail(session, () => this.awaken.attempt(session, args[0] === true));
  }

  @Rpc('ensureBuyAwaken', { requireCharacter: true, forbidInBattle: true })
  ensureBuyAwaken(session: Session): Promise<AwakenReply> {
    return midNoteOnFail(session, () => this.awaken.attempt(session, true));
  }

  @Rpc('addAwakenPoint', { requireCharacter: true, forbidInBattle: true })
  addAwakenPoint(session: Session, args: unknown[]): Promise<AwakenPointReply> {
    const id = skillArg(args);
    return midNoteOnFail(session, () => this.awaken.point(session, id, true));
  }

  @Rpc('reduceAwakenPoint', { requireCharacter: true, forbidInBattle: true })
  reduceAwakenPoint(session: Session, args: unknown[]): Promise<AwakenPointReply> {
    const id = skillArg(args);
    return midNoteOnFail(session, () => this.awaken.point(session, id, false));
  }

  @Rpc('getAwakenInfo', { requireCharacter: true })
  getAwakenInfo(session: Session): Promise<AwakenInfo> {
    return this.awaken.info(session.characterId!);
  }
}
