// Chân Hồn Thần Thú client flow (strip icon 58, legacy PRSPanel): initPRSPanel -> panel; the mutators answer null and push updatePRSPanel /
// updatePRSChipBag / updatePRSExcBag / onGetPRSChip (toast) / onReplacePRSShow (map-wide: the owner's prsUseId). Refusals arrive as
// onSystemMidMsgOrNote and reject the call (silent here). Gold collects ask first (PRS_PANEL[35]/[36]); a 60 s timer asks the server to drop
// expired timed forms while the window is open (Flash refreshPRSShow).

import {
  PRS, PRS_TEXT, emptyPrsPanel, prsExpiredForms, type GetPrsChipPush, type PlayerData, type PrsChipBag, type PrsPanel, type PrsShowRow,
  type ReplacePrsShowPush,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { createPrsWindow } from '../ui/pet/prsPanel';
import { chipOf, type PrsCollectKind, type PrsUiHost } from '../ui/pet/prs/prsTypes';
import { toast } from '../ui/screens';

export interface PrsControllerHost {
  client: GameClient;
  player: PlayerData;
  bagCount(templateId: number): number;
}

const EXPIRY_CHECK_MS = 60_000;

export class PrsController {
  private panel: PrsPanel | null = null;
  private busy = false;
  private formTab = 0;
  private chipPage = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];
  private readonly ui: PrsUiHost;

  constructor(private readonly host: PrsControllerHost) {
    const { client, player } = host;
    const cur = (k: 'realSoulStone' | 'realSoulCrystal' | 'realSoulWater'): number => player.currencies?.[k] ?? 0;
    this.ui = {
      panel: () => this.panel,
      now: () => Date.now(),
      stone: () => cur('realSoulStone'),
      crystal: () => cur('realSoulCrystal'),
      water: () => cur('realSoulWater'),
      gold: () => player.gold ?? 0,
      busy: () => this.busy,
      formTab: () => this.formTab,
      setFormTab: (t) => {
        this.formTab = t;
        this.render();
      },
      chipPage: () => this.chipPage,
      setChipPage: (p) => {
        this.chipPage = Math.max(1, p);
        this.render();
      },
      itemCount: (id) => host.bagCount(id),
      treeUp: () => void this.send('addSoulTreeLvl', player.id),
      collect: (kind) => this.collect(kind),
      activate: (show) => this.activate(show),
      equip: (id) => void this.send('replacePRSShow', player.id, id),
      cancel: () => void this.send('cancelPRSShow', player.id, this.panel?.useSid ?? 0),
      move: (from, to, dir) => void this.send('movePRSChip', player.id, from, to, dir),
      exchange: (id) => void this.send('exchangePRSChip', player.id, id),
      swap: (all) => void this.send(all ? 'swapPRSChipTimes' : 'swapPRSChip', player.id),
    };
    this.win = createPrsWindow(() => this.ui, () => this.close());
    this.offs.push(
      client.on('updatePRSPanel', (d) => this.setPanel(d as PrsPanel)),
      client.on('updatePRSChipBag', (bag) => this.patch({ chipBag: (bag ?? {}) as PrsChipBag })),
      client.on('updatePRSExcBag', (bag) => this.patch({ excBag: (bag ?? {}) as PrsChipBag })),
      client.on('onGetPRSChip', (d) => {
        const r = d as GetPrsChipPush;
        toast(PRS_TEXT.GOT(chipOf(r.id)?.name ?? `#${r.id}`, r.num));
      }),
      client.on('onReplacePRSShow', (d) => {
        const r = d as ReplacePrsShowPush;
        if (r.cid !== player.id) return;
        player.prsUseId = r.prsUseId;
        this.patch({ useSid: r.prsUseId });
      }),
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
    this.host.client.call<PrsPanel>('initPRSPanel', this.host.player.id).then((p) => {
      this.setPanel(p);
      if (!this.win.isOpen) this.win.show(0);
      this.timer ??= setInterval(() => this.checkExpiry(), EXPIRY_CHECK_MS);
    }).catch(() => undefined);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  private render(): void {
    this.win.render();
  }

  private setPanel(p: PrsPanel): void {
    this.panel = { ...emptyPrsPanel(), ...p };
    this.render();
  }

  private patch(part: Partial<PrsPanel>): void {
    if (!this.panel) return;
    this.panel = { ...this.panel, ...part };
    this.render();
  }

  /** One request at a time: the flag drops when the reply (or refusal) arrives. */
  private send(method: string, ...args: unknown[]): Promise<unknown> {
    if (this.busy) return Promise.resolve(null);
    this.busy = true;
    this.render();
    return this.host.client.call(method, ...args).catch(() => undefined).finally(() => {
      this.busy = false;
      this.render();
    });
  }

  private collect(kind: PrsCollectKind): void {
    const id = this.host.player.id;
    if (kind === 'free') void this.send('freePRSCollect', id);
    else if (kind === 'gold') askConfirm(PRS_TEXT.CONFIRM_GOLD(PRS.GOLD_COLLECT), () => void this.send('goldPRSCollect', id));
    else askConfirm(PRS_TEXT.CONFIRM_SIX(PRS.GOLD_COLLECT_SIX), () => void this.send('goldPRSCollectThree', id));
  }

  private activate(show: PrsShowRow): void {
    void this.send(show.tab === PRS.TAB_SPECIAL ? 'activePRSShowSpe' : 'activePRSShow', this.host.player.id, show.id);
  }

  /** Flash refreshPRSShow: report the expired timed forms; the server prunes by its own clock and answers updatePRSPanel. */
  private checkExpiry(): void {
    const p = this.panel;
    if (!p || !this.win.isOpen) return;
    const expired = prsExpiredForms(p, Date.now());
    if (expired.length > 0) void this.send('updateActivePRSShow', Object.fromEntries(expired.map((id) => [String(id), id])));
    else this.render();
  }
}
