// PPVE (Khong Gian Dieu Khac) RPCs with the Flash names: initPPVEPanel, savePPVEConf, challengeNextFloor, getPPVERank, replayPetPVEFight,
// ppLevelUpPetIcon, increaseChallengeTimeByGold, exchangeKP, exchangeKPByGold. All are push-style (the client passes a null Responder):
// onUpdatePPVEPanel(kp, ppve, conf | null, clear), changePPLoadingState, onSendReplayPPVEPanel, updatePPRankView, onBattleReplay,
// onBattlePlayList and notes (onSystemMidMsgOrNote). Logic lives in the services; this file validates args and sends the pushes.

import { Injectable } from '@nestjs/common';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { push, sendPushes } from '../inventory/pushes';
import { PpveChallengeService } from './ppve-challenge.service';
import { PpveRankService } from './ppve-rank.service';
import { PPVE_TEXT } from './ppve-rules';
import { PpveService } from './ppve.service';
import { ReplayPlayerService } from './replay-player.service';

const OPTS = { requireCharacter: true, forbidInBattle: true } as const;

@Injectable()
export class PpveRpc {
  constructor(
    private readonly ppve: PpveService,
    private readonly challenges: PpveChallengeService,
    private readonly ranks: PpveRankService,
    private readonly player: ReplayPlayerService,
  ) {}

  @Rpc('initPPVEPanel', { requireCharacter: true })
  async initPPVEPanel(session: Session): Promise<null> {
    sendPushes(session, await this.ppve.init(session.characterId!));
    return null;
  }

  @Rpc('savePPVEConf', OPTS)
  async savePPVEConf(session: Session, args: unknown[]): Promise<null> {
    sendPushes(session, await this.ppve.saveConfig(session.characterId!, args[0]));
    return null;
  }

  @Rpc('challengeNextFloor', OPTS)
  async challengeNextFloor(session: Session): Promise<null> {
    sendPushes(session, await this.challenges.challenge(session.characterId!));
    return null;
  }

  @Rpc('getPPVERank', { requireCharacter: true })
  async getPPVERank(session: Session): Promise<null> {
    const rank = await this.ranks.rank(session.characterId!);
    session.callback('updatePPRankView', rank.rankList, rank.myRank);
    return null;
  }

  /** The "[Chien tran]" log link: onBattleReplay now, onBattlePlayList 2.5 s later. */
  @Rpc('replayPetPVEFight', { requireCharacter: true })
  replayPetPVEFight(session: Session, args: unknown[]): null {
    const bid = args[0] === undefined || args[0] === null ? '' : String(args[0]);
    if (!bid || !this.player.play(session, session.characterId!, bid)) sendPushes(session, [push('onSystemMidMsgOrNote', PPVE_TEXT.replayGone)]);
    return null;
  }

  /** ppLevelUpPetIcon({partIndex 0..7, iconIndex 0..5, ...}): only the two indexes are trusted. */
  @Rpc('ppLevelUpPetIcon', OPTS)
  async ppLevelUpPetIcon(session: Session, args: unknown[]): Promise<null> {
    const o = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : {};
    sendPushes(session, await this.ppve.levelUpIcon(session.characterId!, Number(o.partIndex), Number(o.iconIndex)));
    return null;
  }

  @Rpc('increaseChallengeTimeByGold', OPTS)
  async increaseChallengeTimeByGold(session: Session): Promise<null> {
    sendPushes(session, await this.ppve.buyTry(session.characterId!));
    return null;
  }

  @Rpc('exchangeKP', OPTS)
  async exchangeKP(session: Session): Promise<null> {
    sendPushes(session, await this.ppve.exchangeKp(session.characterId!));
    return null;
  }

  @Rpc('exchangeKPByGold', OPTS)
  async exchangeKPByGold(session: Session): Promise<null> {
    sendPushes(session, await this.ppve.exchangeKpByGold(session.characterId!));
    return null;
  }
}
