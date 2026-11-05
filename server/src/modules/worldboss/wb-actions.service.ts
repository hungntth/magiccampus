// World boss player actions (Go application/worldboss actions.go): wbStrongBattle (cheer: charge first, silver rolls 100/85/65/45/25 %,
// gold always succeeds, always answers updateWbStrongLabel with the resulting level), wbBattleCheck (relive timer ran out) and
// wbReliveNow (10 gold, then onClearTimer); in the lobby both only answer with the start time and charge nothing.

import { Injectable, Logger } from '@nestjs/common';
import { WB_CHEER, WB_RELIVE, WbCheerType } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { systemSay } from '../npcscript/menu';
import { WB, WB_TEXT_SERVER as T } from './wb-config';
import { WbBattleService } from './wb-battle.service';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { cheerCost, cheerRate } from './wb-rules';
import { wbClockLabel } from './wb-schedule';
import { WbState, type WbParticipant } from './wb-state.service';

@Injectable()
export class WbActionsService {
  private readonly logger = new Logger(WbActionsService.name);

  constructor(
    private readonly state: WbState,
    private readonly push: WbPush,
    private readonly payout: WbPayoutService,
    private readonly battles: WbBattleService,
    private readonly characters: CharacterService,
  ) {}

  /** wbStrongBattle(type): 1 pays gold, anything else silver. */
  async cheer(session: Session, rawType: number): Promise<void> {
    const cid = session.characterId!;
    const type = rawType === WbCheerType.GOLD ? WbCheerType.GOLD : WbCheerType.SILVER;
    const p = this.state.event.participants.get(cid);
    const level = p?.cheer ?? 0;
    const answer = (): void => this.push.send(cid, 'updateWbStrongLabel', p?.cheer ?? level);
    if (!p || !this.state.running || level >= WB_CHEER.MAX_LEVEL) return answer();
    const cost = cheerCost(type);
    const charged = type === WbCheerType.GOLD ? await this.chargeGold(cid, cost) : await this.chargeSilver(cid, cost);
    if (!charged) {
      this.push.say(cid, type === WbCheerType.GOLD ? T.NO_GOLD : T.NO_SILVER);
      return answer();
    }
    const ok = Math.floor(this.state.rng() * 100) < cheerRate(type, level);
    if (ok && p.cheer < WB_CHEER.MAX_LEVEL) p.cheer++;
    this.push.say(cid, ok ? T.CHEER_OK(p.cheer * WB.CHEER_STEP_PCT) : T.CHEER_FAILED);
    answer();
  }

  private async chargeGold(cid: number, cost: number): Promise<boolean> {
    const total = await this.payout.spendGold(cid, cost);
    if (total === null) return false;
    this.push.send(cid, 'onUPP', { gold: total });
    return true;
  }

  private async chargeSilver(cid: number, cost: number): Promise<boolean> {
    const key = (await this.characters.paymentPrefs(cid)).money; // the selected silver type (bound / unbound)
    const total = await this.characters.spendMoney(cid, key, cost);
    if (total === null) return false;
    this.push.send(cid, 'onUPP', { [key]: total });
    return true;
  }

  private canFight(p: WbParticipant | undefined): p is WbParticipant {
    return this.state.running && !!p && p.inMap && !p.inBattle && this.state.event.hp > 0;
  }

  private lobbyNote(session: Session): boolean {
    if (!this.state.lobby) return false;
    systemSay(session, T.LOBBY_WAIT(wbClockLabel(this.state.event.fightAt)));
    return true;
  }

  /** wbBattleCheck: the 25 s timer ran out, the next fight starts. */
  async battleCheck(session: Session): Promise<void> {
    if (this.lobbyNote(session)) return;
    const p = this.state.event.participants.get(session.characterId!);
    if (!this.canFight(p)) return;
    p.dead = false;
    await this.battles.start(p.cid);
  }

  /** wbReliveNow: 10 gold buys the next fight at once. */
  async reliveNow(session: Session): Promise<void> {
    if (this.lobbyNote(session)) return;
    const cid = session.characterId!;
    if (!this.canFight(this.state.event.participants.get(cid))) return;
    if (!(await this.chargeGold(cid, WB_RELIVE.GOLD))) return systemSay(session, T.NO_GOLD);
    this.push.send(cid, 'onClearTimer');
    this.logger.log(`character ${cid} bought an instant world boss fight`);
    await this.battleCheck(session);
  }
}
