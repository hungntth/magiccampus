// World boss pushes: the HUD init (10 positional args), rank / HP refresh, online count, the result window and the activity icon state.
// Everything is addressed by character id through the scene manager; offline characters are skipped.

import { Injectable } from '@nestjs/common';
import type { InitWbViewArgs, UpdateWbRankArgs, WbResult } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { WB } from './wb-config';
import { WbPayoutService } from './wb-payout.service';
import { WbState, type WbParticipant } from './wb-state.service';
import { buildRank, rankLabel, sortedByDamage } from './wb-settle';

@Injectable()
export class WbPush {
  constructor(
    private readonly scenes: SceneManager,
    private readonly state: WbState,
    private readonly payout: WbPayoutService,
  ) {}

  send(cid: number, method: string, ...args: unknown[]): void {
    this.scenes.findByCharacter(cid)?.callback(method, ...args);
  }

  sayAll(text: string): void {
    this.scenes.broadcastAll('onSystemSay', [text]);
  }

  say(cid: number, text: string): void {
    this.send(cid, 'onSystemSay', text);
  }

  /** updateActivityState {id 15, flag}. */
  broadcastState(): void {
    this.scenes.broadcastAll('updateActivityState', [this.state.statePush()]);
  }

  inMapIds(): number[] {
    return [...this.state.event.participants.values()].filter((p) => p.inMap).map((p) => p.cid);
  }

  broadcastOnline(): void {
    const n = this.state.inMapCount();
    for (const cid of this.inMapIds()) this.send(cid, 'updateWbOnlineNum', n);
  }

  /** onBossHpChanged(hp) + the viewer's own onUpdateWbRank to everyone on the map. */
  pushRank(): void {
    const e = this.state.event;
    const sorted = sortedByDamage(e.participants.values());
    for (const p of e.participants.values()) {
      if (!p.inMap) continue;
      const { rank1, rank2 } = buildRank(sorted, p);
      const args: UpdateWbRankArgs = [rank1, rank2, p.damage];
      this.send(p.cid, 'onBossHpChanged', e.hp);
      this.send(p.cid, 'onUpdateWbRank', ...args);
    }
  }

  /** initWbView: the scene must already be the event map (the client copies posMapId into Core.wbMapId). */
  async initView(cid: number): Promise<void> {
    const e = this.state.event;
    const p = e.participants.get(cid);
    if (!p) return;
    const { rank1, rank2 } = buildRank(sortedByDamage(e.participants.values()), p);
    const preview = await this.payout.awardDtos([{ itemId: WB.CLASS_RANK_BAGS[0], num: 1 }]);
    const args: InitWbViewArgs = [this.state.secondsLeft(), p.auto, e.hp, e.maxHp, p.cheer, rank1, rank2, p.damage, this.state.inMapCount(), preview];
    this.send(cid, 'initWbView', ...args);
  }

  /** onUpdateWbResult + onStartWb(true) (the HUD restore and "đã kết thúc" note). */
  async sendResult(p: WbParticipant): Promise<void> {
    const result: WbResult = {
      award: await this.payout.awardDtos(p.pending), rank1: rankLabel(p.worldRank), rank2: rankLabel(p.classRank), hurt: p.damage, money: p.money,
      exp: p.exp, luckyNum: p.luckyNum, name: this.state.event.lastHitter || '-',
    };
    this.send(p.cid, 'onUpdateWbResult', result);
    this.send(p.cid, 'onStartWb', true);
  }
}
