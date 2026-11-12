// Ấn Chương (medal) client flow: owns the window and every medal RPC (getMedalCatalog, getMedalInfo, moveMedal, upMedal, breakMedal,
// arrangeMedalBag). Local state follows the pushes onMoveMedal / onUpMedal / onBreakMedal / updateMedalInBag; the replies of upMedal / breakMedal
// carry the same payload and are applied idempotently. A refusal shows as onSystemMidMsgOrNote (BagController) and rejects: silent here.

import {
  MEDAL_RARE_REPLY, type MedalBagMap, type MedalCatalog, type MedalEntry, type MedalInfo, type MedalOpPush, type MedalRow, type MoveMedalPush,
  type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { createMedalWindow } from '../ui/medal/medalWindow';
import { applyBagEntry, applyMovePush, applyOpPush, buildLookup, type MedalLookup } from '../ui/medal/medalRules';
import { MEDAL_P } from '../ui/medal/medalText';
import { newMedalView, type MedalActions, type MedalUiHost } from '../ui/medal/medalTypes';

export interface MedalControllerHost {
  client: GameClient;
  player: PlayerData;
}

const ARRANGE_THROTTLE_MS = 5000;

export class MedalController {
  private rows: MedalRow[] = [];
  private look: MedalLookup = buildLookup([]);
  private loaded = false;
  private bag: MedalBagMap = {};
  private exp = 0;
  private charLine = 0;
  private petLine = 0;
  private busy = false;
  private lastArrange = 0;
  private readonly view = newMedalView();
  private readonly ui: MedalUiHost;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: MedalControllerHost) {
    this.ui = {
      info: () => ({ medalExp: this.exp, charBuff: { t: this.charLine }, petBuff: { t: this.petLine } }),
      bag: () => this.bag,
      look: () => this.look,
      row: (id) => this.look.row(id),
      charLevel: () => this.host.player.level,
      view: this.view,
      actions: this.actions(),
    };
    this.win = createMedalWindow(() => this.ui, () => this.close());
    const c = host.client;
    this.offs.push(
      c.on('onMoveMedal', (d) => this.onMove(d as MoveMedalPush)),
      c.on('onUpMedal', (d) => this.onOp(d as MedalOpPush)),
      c.on('onBreakMedal', (d) => this.onOp(d as MedalOpPush)),
      c.on('updateMedalInBag', (d) => {
        this.bag = applyBagEntry(this.bag, d as MedalEntry);
        this.refresh();
      }),
    );
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else void this.open();
  }

  /** Loads the catalog (once) and the player's medals, then shows the window. */
  async open(): Promise<void> {
    if (this.win.isOpen) return;
    try {
      if (!this.loaded) {
        const cat = await this.host.client.call<MedalCatalog>('getMedalCatalog');
        this.rows = cat.medals;
        this.look = buildLookup(this.rows);
        this.loaded = true;
      }
      const info = await this.host.client.call<MedalInfo>('getMedalInfo');
      this.bag = info.medalBag;
      this.exp = info.medalExp;
      this.charLine = info.charBuff.t;
      this.petLine = info.petBuff.t;
    } catch {
      return;
    }
    if (!this.win.isOpen) this.win.show(0);
  }

  close(): void {
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  private onMove(p: MoveMedalPush): void {
    this.bag = applyMovePush(this.bag, p);
    this.charLine = p.joinTid;
    this.petLine = p.petJoinTid;
    this.refresh();
  }

  private onOp(p: MedalOpPush): void {
    this.bag = applyOpPush(this.bag, p);
    this.exp = p.medalExp;
    this.refresh();
  }

  /** Drops a selection whose slot became empty, then redraws. */
  private refresh(): void {
    if (this.view.sel && !this.bag[String(this.view.sel)]) this.view.sel = 0;
    this.win.render();
  }

  /** One RPC at a time; null when refused. */
  private async run<T>(method: string, ...args: unknown[]): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }

  private actions(): MedalActions {
    return {
      equip: (bagSlot, sid) => void this.run('moveMedal', bagSlot, sid),
      unequip: (slot) => {
        for (let i = 1; i <= 600; i++) {
          if (this.bag[String(i)]) continue;
          void this.run('moveMedal', slot, i);
          return;
        }
      },
      upgrade: (slot) => void this.run<MedalOpPush>('upMedal', slot).then((r) => r && this.onOp(r)),
      dissolve: (slot, count, row) => {
        const go = (): void => void this.run<MedalOpPush | typeof MEDAL_RARE_REPLY>('breakMedal', slot, count, count > 1 ? 2 : 1).then((r) => {
          if (r && r !== MEDAL_RARE_REPLY) this.onOp(r);
        });
        if (row.q >= 2 && row.q < 4) askConfirm(MEDAL_P[58] ?? '', go);
        else go();
      },
      arrange: () => {
        const now = Date.now();
        if (now - this.lastArrange < ARRANGE_THROTTLE_MS) return;
        this.lastArrange = now;
        void this.run<MedalBagMap>('arrangeMedalBag').then((r) => {
          if (!r) return;
          // Worn slots are untouched by the arrange: keep them, replace the bag part.
          const worn = Object.fromEntries(Object.entries(this.bag).filter(([k]) => Number(k) > 600));
          this.bag = { ...worn, ...r };
          this.view.sel = 0;
          this.refresh();
        });
      },
      render: () => this.win.render(),
    };
  }
}
