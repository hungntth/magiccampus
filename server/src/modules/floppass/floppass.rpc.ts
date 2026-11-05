// Lật Bài Truyền Thuyết RPCs (Flash FlopPassPanel, strip id 40): initFlopPassData, getFlopPassConf, flopCard(card) (true + onPassCard),
// flopDelBoss (true + onFlopDelBossClient), flopReborn / flopRestart (onFlopRestart), freshCharFlopPassItemByClient, loadFlopRank,
// takeFlopRankAward (onTakeFlopRankAward). Gold spends push onUPP, item grants push onAddItem; refusals are onSystemSay and a falsy reply.

import { Injectable } from '@nestjs/common';
import type { FlopConfReply, FlopInit, FlopRankReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FlopPassService, FlopRefusal } from './floppass.service';

@Injectable()
export class FlopPassRpc {
  constructor(private readonly flop: FlopPassService) {}

  @Rpc('initFlopPassData', { requireCharacter: true })
  init(session: Session): Promise<FlopInit | null> {
    return this.run(session, () => this.flop.init(session), null);
  }

  @Rpc('getFlopPassConf', { requireCharacter: true })
  conf(session: Session): Promise<FlopConfReply | null> {
    return this.run(session, () => this.flop.conf(session), null);
  }

  @Rpc('flopCard', { requireCharacter: true })
  card(session: Session, args: unknown[]): Promise<boolean> {
    return this.run(session, async () => {
      const { info, bossNum } = await this.flop.flip(session, Number(args[0]));
      session.callback('onPassCard', info, Number(args[0]), bossNum);
      return true;
    }, false);
  }

  @Rpc('flopDelBoss', { requireCharacter: true })
  delBoss(session: Session): Promise<boolean> {
    return this.run(session, async () => {
      session.callback('onFlopDelBossClient', ...(await this.flop.kill(session)));
      return true;
    }, false);
  }

  @Rpc('flopReborn', { requireCharacter: true })
  reborn(session: Session): Promise<null> {
    return this.run(session, async () => {
      session.callback('onFlopRestart', await this.flop.reborn(session));
      return null;
    }, null);
  }

  @Rpc('flopRestart', { requireCharacter: true })
  restart(session: Session): Promise<null> {
    return this.run(session, async () => {
      session.callback('onFlopRestart', await this.flop.restart(session));
      return null;
    }, null);
  }

  @Rpc('freshCharFlopPassItemByClient', { requireCharacter: true })
  refresh(session: Session): Promise<null> {
    return this.run(session, async () => {
      session.callback('onFreshCharFlopPassItemByClient', await this.flop.refresh(session));
      return null;
    }, null);
  }

  @Rpc('loadFlopRank', { requireCharacter: true })
  rank(session: Session): Promise<FlopRankReply | null> {
    return this.run(session, () => this.flop.rank(session), null);
  }

  @Rpc('takeFlopRankAward', { requireCharacter: true })
  takeAward(session: Session): Promise<null> {
    return this.run(session, async () => {
      await this.flop.takeAward(session);
      session.callback('onTakeFlopRankAward');
      return null;
    }, null);
  }

  /** Runs `fn`; a refusal becomes onSystemSay (when it has a text) and `fallback` is the reply. */
  private async run<T, F>(session: Session, fn: () => Promise<T>, fallback: F): Promise<T | F> {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof FlopRefusal)) throw e;
      if (e.message) session.callback('onSystemSay', e.message);
      return fallback;
    }
  }
}
