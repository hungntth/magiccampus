// World boss settlement (Go application/worldboss settle.go): finish stops the run once, plans ranks and gift bags (class top 3, killing
// blow, lucky draw), grants every damage dealer the share bonus (persisted, offline too) and delivers: on the map and idle -> result
// window + onStartWb(true); in a battle or before its battlePlayEnd -> the window waits for battlePlayEnd; online off the map -> bags
// straight to the bag (the rest owed); offline -> owed. After the claim grace the map is evacuated.

import { Injectable, Logger } from '@nestjs/common';
import { SceneManager } from '../../gateway/scene.manager';
import { WB, WB_TEXT_SERVER as T } from './wb-config';
import { WbExitService } from './wb-exit.service';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { WbState, type WbParticipant } from './wb-state.service';
import { planSettlement, sortedByDamage } from './wb-settle';

@Injectable()
export class WbFinishService {
  private readonly logger = new Logger(WbFinishService.name);
  /** swappable in tests / tools */
  after: (ms: number, fn: () => void) => void = (ms, fn) => void setTimeout(fn, ms).unref();

  constructor(
    private readonly state: WbState,
    private readonly push: WbPush,
    private readonly payout: WbPayoutService,
    private readonly exit: WbExitService,
    private readonly scenes: SceneManager,
  ) {}

  async finish(reason: 'killed' | 'timeout' | 'manual'): Promise<void> {
    const e = this.state.event;
    if (e.phase !== 'running') return;
    e.phase = 'idle';
    const parts = [...e.participants.values()];
    const sorted = sortedByDamage(parts);
    const total = sorted.reduce((s, p) => s + p.damage, 0);
    const plans = planSettlement(sorted, reason === 'killed' ? e.lastHitterId : 0, this.state.rng);
    for (const p of parts) {
      const plan = plans.get(p.cid);
      p.worldRank = plan?.worldRank ?? 0;
      p.classRank = plan?.classRank ?? 0;
      p.luckyNum = plan?.luckyNum ?? 0;
      p.pending = plan ? plan.awards : [];
      p.resultPending = p.inMap && (p.inBattle || p.playPending);
    }
    this.logger.log(`world boss finished (${reason}): ${parts.length} participants, total damage ${total}`);
    this.push.broadcastState();
    if (reason === 'killed' && e.lastHitter) this.push.sayAll(T.KILLED_BY(e.lastHitter));
    const lucky = parts.filter((p) => p.luckyNum > 0).map((p) => p.name);
    if (lucky.length > 0) this.push.sayAll(T.LUCKY(lucky.join(', ')));
    for (const p of parts) {
      try {
        await this.settleOne(p, total);
      } catch (err) {
        this.logger.error(`world boss settlement of ${p.cid} failed: ${(err as Error).message}`);
      }
    }
    const seq = e.runSeq;
    this.after(WB.CLAIM_GRACE_MS, () => void this.exit.evacuate(seq).catch((err: Error) => this.logger.error(`evacuation failed: ${err.message}`)));
  }

  private async settleOne(p: WbParticipant, total: number): Promise<void> {
    if (p.damage > 0) {
      const gain = await this.payout.creditSettlement(p.cid, p.level, p.damage, total);
      p.exp += gain.exp;
      p.money += gain.money;
      const s = this.scenes.findByCharacter(p.cid);
      if (s && !p.resultPending) await this.payout.pushGain(s, gain.leveled);
      else if (s) p.leveled = p.leveled || gain.leveled;
    }
    const session = this.scenes.findByCharacter(p.cid);
    if (!session) return void (await this.exit.oweIfOver(p));
    if (p.resultPending) return; // the window follows battlePlayEnd
    if (p.inMap) return void (await this.push.sendResult(p));
    this.push.send(p.cid, 'onStartWb', true);
    if (p.pending.length === 0) return;
    if (await this.payout.deliver(session, p.pending)) p.pending = [];
    else await this.exit.oweIfOver(p);
  }
}
