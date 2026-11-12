// Năng Lượng Tự Nhiên client flow (strip icon 28): getAstrologicData -> onGetAstrologicData, refreshStars -> onAstrologicStarsRefresh,
// pickStar -> onPickStar (onAddMoney ignored), lookFormula -> {id, formula}. Refusals show as onSystemMidMsgOrNote and reject; silent here.

import { ASTRO_TEXT, lookFormulaCost, type AstrologicData, type LookFormulaReply, type PickStarPush, type PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { createAstrologyWindow, type AstrologyUiHost } from '../ui/astrology/astrologyPanel';
import { keepStars, pickConfirm, refreshConfirm, resultLine } from '../ui/astrology/astrologyRules';
import type { FeatureWindow } from '../ui/feature/featureWindow';

export interface AstrologyControllerHost {
  client: GameClient;
  player: PlayerData;
}

export class AstrologyController {
  private data: AstrologicData | null = null;
  private sel = 0;
  private result = '';
  private busy = false;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];
  private readonly ui: AstrologyUiHost;

  constructor(private readonly host: AstrologyControllerHost) {
    const { client, player } = host;
    this.ui = {
      data: () => this.data,
      selected: () => this.sel,
      result: () => this.result,
      npPnt: () => player.currencies?.npPnt ?? 0,
      gold: () => player.gold ?? 0,
      busy: () => this.busy,
      select: (sid) => {
        this.sel = this.sel === sid ? 0 : sid;
        this.render();
      },
      pick: () => this.pick(),
      refresh: () => this.refresh(),
      look: (fid) => this.look(fid),
    };
    this.win = createAstrologyWindow(() => this.ui, () => this.close());
    this.offs.push(
      client.on('onGetAstrologicData', (d) => {
        this.data = d as AstrologicData;
        this.render();
      }),
      client.on('onAstrologicStarsRefresh', (left, stars) => {
        if (this.data) {
          this.data.refreshCount = Number(left);
          this.data.starsToPick = stars as number[];
        }
        this.sel = 0;
        this.render();
      }),
      client.on('onPickStar', (p) => this.onPick(p as PickStarPush)),
      client.on('onUPP', () => this.render()),
    );
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.win.isOpen) return;
    this.result = '';
    this.sel = 0;
    this.host.client.call('getAstrologicData').then(() => {
      if (!this.win.isOpen) this.win.show(0);
    }).catch(() => undefined);
  }

  close(): void {
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  private render(): void {
    this.win.render();
  }

  /** One request at a time: the flag drops when the reply (or refusal) arrives. */
  private send(method: string, ...args: unknown[]): Promise<unknown> {
    this.busy = true;
    this.render();
    return this.host.client.call(method, ...args).catch(() => undefined).finally(() => {
      this.busy = false;
      this.render();
    });
  }

  private pick(): void {
    const d = this.data;
    if (!d || this.busy || this.sel <= 0) return;
    const go = (): void => void this.send('pickStar', this.sel);
    const text = pickConfirm(d);
    if (text) askConfirm(text, go);
    else go();
  }

  private refresh(): void {
    const d = this.data;
    if (!d || this.busy) return;
    const go = (): void => void this.send('refreshStars');
    const text = refreshConfirm(d);
    if (text) askConfirm(text, go);
    else go();
  }

  private look(fid: number): void {
    if (this.busy) return;
    askConfirm(ASTRO_TEXT.CONFIRM_LOOK(lookFormulaCost(fid)), () => {
      this.busy = true;
      this.render();
      this.host.client.call<LookFormulaReply>('lookFormula', fid).then((r) => {
        if (this.data) this.data.formula[fid] = r.formula;
      }).catch(() => undefined).finally(() => {
        this.busy = false;
        this.render();
      });
    });
  }

  private onPick(p: PickStarPush): void {
    const d = this.data;
    if (d) {
      d.pickCount = p.leftTimes;
      d.buyPickCount = p.buyTimes;
      d.refreshCount = p.refreshTimes;
      d.starsToPick = p.newStars;
      d.starsNow = p.result ? p.result.stars : keepStars(d.starsNow, p.sid);
      if (p.result) d.formula[Number(p.result.fid)] = p.result.formula;
    }
    this.result = resultLine(p.result);
    this.sel = 0;
    this.render();
  }
}
