// Không Gian Điêu Khắc flow (legacy PetPVESystem): owns the window, the RPCs -- initPPVEPanel, savePPVEConf, challengeNextFloor, getPPVERank,
// replayPetPVEFight, ppLevelUpPetIcon, increaseChallengeTimeByGold, exchangeKP, exchangeKPByGold -- and the pushes onUpdatePPVEPanel,
// changePPLoadingState, onSendReplayPPVEPanel, updatePPRankView. The replay itself is played by the battle WatchMode (onBattleReplay).
// Most requests are fire-and-forget: refusals arrive as onSystemMidMsgOrNote notes (shown by BagController).

import type { PetSkillInfo, PetView, PlayerData, PPVEConfig, PPVEData, PPVEKpData, PPVERank, PPVERankRow, PPVESlot } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { PPVE_TEXT as T } from '../ui/petbattle/petBattleText';
import type { PpveActions, PpveModel } from '../ui/petbattle/petBattleTypes';
import { logText } from '../ui/petbattle/ppveRules';
import { PpveWindow } from '../ui/petbattle/ppveWindow';

export interface PpveControllerHost {
  client: GameClient;
  player: PlayerData;
  pets(): PetView[];
  skillInfo(id: number): PetSkillInfo | undefined;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class PpveController {
  private readonly win: PpveWindow;
  private readonly offs: (() => void)[] = [];
  private readonly state: PpveModel = { kp: null, ppve: null, log: [], rank: null, loading: false, autoWatch: true };
  /** Set by the savePPVEConf echo (onUpdatePPVEPanel arg 3): the reply is always null, a refusal is only a note. */
  private echoed = false;

  constructor(private readonly host: PpveControllerHost) {
    this.win = new PpveWindow({ model: () => this.state, actions: this.actions(), gold: () => host.player.gold }, () => this.win.close());
    const c = host.client;
    this.offs.push(
      c.on('onUpdatePPVEPanel', (kp, ppve, conf, clear) => this.onPanel(kp as PPVEKpData, ppve as PPVEData, conf as PPVEConfig | null, clear === true)),
      c.on('changePPLoadingState', () => this.setLoading(false)),
      c.on('onSendReplayPPVEPanel', (outcome, floor, bid, list, mine) => this.onResult(Number(outcome), Number(floor), String(bid), list, mine)),
      c.on('updatePPRankView', (list, mine) => this.onRank(list, mine)),
    );
  }

  /** Entry point (HUD "Điêu Khắc"): toggles the window and refreshes the panel + rank. */
  toggle(): void {
    if (this.win.isOpen) {
      this.win.close();
      return;
    }
    this.win.show();
    this.actions().refresh();
    this.actions().loadRank();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
  }

  private actions(): PpveActions {
    const c = this.host.client;
    const send = (method: string, ...args: unknown[]): void => void c.call(method, ...args).catch(fail);
    return {
      pets: () => this.host.pets(),
      skillInfo: (id) => this.host.skillInfo(id),
      refresh: () => send('initPPVEPanel'),
      loadRank: () => send('getPPVERank'),
      saveConf: (conf) => this.saveConf(conf),
      challenge: () => void this.challenge(),
      buyTry: () => send('increaseChallengeTimeByGold'),
      exchange: () => send('exchangeKP'),
      exchangeGold: () => send('exchangeKPByGold'),
      levelUp: (part, icon) => send('ppLevelUpPetIcon', { partIndex: part, iconIndex: icon }),
      replay: (bid) => send('replayPetPVEFight', bid),
      setAutoWatch: (on) => {
        this.state.autoWatch = on;
      },
    };
  }

  private async saveConf(conf: Record<string, PPVESlot>): Promise<boolean> {
    this.echoed = false;
    try {
      await this.host.client.call('savePPVEConf', conf);
    } catch (e) {
      fail(e);
      return false;
    }
    return this.echoed;
  }

  private async challenge(): Promise<void> {
    if (this.state.loading) return;
    this.setLoading(true);
    try {
      await this.host.client.call('challengeNextFloor', null);
    } catch (e) {
      fail(e);
    } finally {
      this.setLoading(false);
    }
  }

  private setLoading(on: boolean): void {
    this.state.loading = on;
    this.win.render();
  }

  private onPanel(kp: PPVEKpData, ppve: PPVEData, conf: PPVEConfig | null, clear: boolean): void {
    this.state.kp = kp;
    this.state.ppve = conf ? { ...ppve, ppveConfig: conf } : ppve;
    if (clear) this.state.log = [];
    if (conf) {
      this.echoed = true;
      toast(T.saved);
    }
    this.win.render();
  }

  private onResult(outcome: number, floor: number, bid: string, list: unknown, mine: unknown): void {
    this.state.log = [...this.state.log, { text: logText(outcome, floor), bid }].slice(-40);
    if (Array.isArray(list)) this.onRank(list, mine);
    else this.win.render();
    if (this.state.autoWatch && bid) void this.host.client.call('replayPetPVEFight', bid).catch(fail);
  }

  private onRank(list: unknown, mine: unknown): void {
    if (!Array.isArray(list)) return;
    const rank: PPVERank = { rankList: list as PPVERankRow[], myRank: Number(mine) };
    this.state.rank = Number.isFinite(rank.myRank) ? rank : { ...rank, myRank: -1 };
    this.win.render();
  }
}
