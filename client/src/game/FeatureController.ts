// Stat features on the client: the "Tu luyện" window (character panel button) with train soul (trainSoul), awakening (awakening /
// ensureBuyAwaken / addAwakenPoint / reduceAwakenPoint), war sprite (getSpWarData, add(War|Battle)Sprite[Gold], push updateWSPPanel)
// and magic crystal (initMagicCrystalData, MagicCrystal*, push onInitMagicCrystalData). H5 reads: getTrainSoulInfo, getAwakenInfo.
// Tabs 4-5 (heiyaoshi, zodiac stars) live in FeatureStarController. Refusals arrive as server toasts (onSystemMidMsgOrNote); the buttons are re-enabled when the call settles.

import type {
  AwakenInfo, AwakenReply, MagicCrystalData, PlayerData, TrainSoulInfo, TrainSoulResult, WspPanelData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { renderAwaken } from '../ui/feature/awakenTab';
import { renderCrystal } from '../ui/feature/crystalTab';
import { FeatureWindow } from '../ui/feature/featureWindow';
import { FeatureStarController } from './FeatureStarController';
import { renderSoul } from '../ui/feature/soulTab';
import { renderWarSprite } from '../ui/feature/warSpriteTab';

export class FeatureController {
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];
  private soul: TrainSoulInfo | null = null;
  private awaken: AwakenInfo | null = null;
  private wsp: WspPanelData | null = null;
  private crystals: MagicCrystalData | null = null;
  private busy = false;
  private autoBuy = false;
  private awakenResult = '';
  private wspPage: 0 | 1 = 0;
  private wspSel = 0;
  private crystalPage = 0;
  private pointType: '1' | '2' = '1';
  private readonly stars: FeatureStarController;

  constructor(private readonly client: GameClient, private readonly player: PlayerData) {
    this.win = new FeatureWindow({
      renderTab: (tab, body) => this.renderTab(tab, body),
      onTab: (tab) => void this.load(tab),
      onClose: () => this.win.close(),
    });
    this.stars = new FeatureStarController(client, player, () => this.win.render());
    this.offs.push(
      client.on('updateWSPPanel', (d) => {
        this.wsp = d as WspPanelData;
        this.win.render();
      }),
      client.on('onInitMagicCrystalData', (d) => {
        this.crystals = d as MagicCrystalData;
        this.win.render();
      }),
      client.on('onUPP', () => this.win.render()),
    );
  }

  destroy(): void {
    this.stars.destroy();
    for (const off of this.offs) off();
    this.win.close();
  }

  /** Character panel "Tu luyện" button. */
  toggle(): void {
    if (this.win.isOpen) this.win.close();
    else this.win.show();
  }

  private cur(key: keyof NonNullable<PlayerData['currencies']>): number {
    return this.player.currencies?.[key] ?? 0;
  }

  private renderTab(tab: number, body: HTMLElement): void {
    const busy = this.busy;
    if (tab === 0) {
      renderSoul(body, { info: this.soul, crystals: this.cur('mysteryCrystal'), playerLevel: this.player.level, busy, onTrain: () => this.trainSoul() });
    } else if (tab === 1) {
      renderAwaken(body, {
        info: this.awaken, classId: this.player.classId, silver: (this.player.money ?? 0) + (this.player.moneyBind ?? 0), autoBuy: this.autoBuy,
        busy, lastResult: this.awakenResult,
        onAutoBuy: (on) => { this.autoBuy = on; },
        onAwaken: () => this.doAwaken(),
        onPoint: (id, add) => void this.run(async () => {
          await this.client.call(add ? 'addAwakenPoint' : 'reduceAwakenPoint', id);
          await this.load(1);
        }),
      });
    } else if (tab === 2) {
      renderWarSprite(body, {
        data: this.wsp, page: this.wspPage, selected: this.wspSel, busy,
        stones: this.cur(this.wspPage === 0 ? 'warSprite' : 'battleSprite'), gold: this.player.gold ?? 0,
        onPage: (p) => { this.wspPage = p; this.wspSel = 0; this.win.render(); },
        onSelect: (i) => { this.wspSel = i; this.win.render(); },
        onUpgrade: (gold) => this.upgradeWsp(gold),
      });
    } else if (tab === 4) {
      this.stars.renderHeiyaoshi(body);
    } else if (tab === 5) {
      this.stars.renderStar(body);
    } else {
      renderCrystal(body, {
        data: this.crystals, page: this.crystalPage, pointType: this.pointType, busy,
        dust: this.cur('magiccystalrec'), pre: this.cur('magiccystalpre'), limit: this.cur('magiccystallimit'),
        onPage: (p) => { this.crystalPage = p; this.win.render(); },
        onType: (t) => { this.pointType = t; this.win.render(); },
        onActivate: (i) => void this.run(() => this.client.call('MagicCrystalActive', i)),
        onUp: (i) => void this.run(() => this.client.call('MagicCrystalUp', i)),
        onRecover: (i) => void this.run(() => this.client.call('MagicCrystalRecovery', i)),
        onAdd: (i, n) => void this.run(() => this.client.call('MagicCrystalAddPower', i, n, this.pointType)),
      });
    }
  }

  private async load(tab: number): Promise<void> {
    try {
      if (tab === 0) this.soul = await this.client.call<TrainSoulInfo>('getTrainSoulInfo');
      else if (tab === 1) this.awaken = await this.client.call<AwakenInfo>('getAwakenInfo');
      else if (tab === 2) this.wsp = await this.client.call<WspPanelData>('getSpWarData');
      else if (tab >= 4) await this.stars.load(tab);
      else this.crystals = await this.client.call<MagicCrystalData>('initMagicCrystalData');
    } catch {
      // the tab keeps showing "loading"; switching tabs retries
    }
    this.win.render();
  }

  /** Runs one server action with the buttons disabled; the server shows refusals as toasts. */
  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.win.render();
    try {
      await action();
    } catch {
      // refused: already toasted by the server
    }
    this.busy = false;
    this.win.render();
  }

  private trainSoul(): void {
    void this.run(async () => {
      const r = await this.client.call<TrainSoulResult>('trainSoul');
      this.player.trainSoulLvl = r.soulLvl;
      this.player.trainSoulExp = r.soulExp;
      await this.load(0);
    });
  }

  private doAwaken(): void {
    void this.run(async () => {
      const r = await this.client.call<AwakenReply>('awakening', this.autoBuy);
      if ('needGold' in r) {
        askConfirm(`Giác ngộ lần này cần ${r.needGold} vàng, xác nhận thực hiện?`, () => {
          void this.run(async () => {
            this.apply(await this.client.call<AwakenReply>('ensureBuyAwaken'));
            await this.load(1);
          });
        });
        return;
      }
      this.apply(r);
      await this.load(1);
    });
  }

  private apply(r: AwakenReply): void {
    if ('needGold' in r) return;
    if (r.success) {
      this.player.awakenLevel = r.awakenLevel;
      this.player.awakenPoint = r.awakenPoint;
      this.awakenResult = `Giác ngộ thành công! Lên cấp ${r.awakenLevel}.`;
    } else {
      this.awakenResult = `Giác ngộ thất bại, còn ${r.itemNum} Hỗn Độn Ma Tinh (tỉ lệ lần sau +${r.awakenAdd}%).`;
    }
  }

  private upgradeWsp(gold: boolean): void {
    const slot = (this.wspPage === 0 ? this.wsp?.view?.war : this.wsp?.view?.battle)?.[this.wspSel];
    if (!slot?.next) return;
    const idx = this.wspSel + 1;
    const rpc = this.wspPage === 0 ? (gold ? 'addWarSpriteGold' : 'addWarSprite') : (gold ? 'addBattleSpriteGold' : 'addBattleSprite');
    const go = (): void => void this.run(() => this.client.call(rpc, idx));
    if (gold) {
      const verb = this.wspPage === 0 ? 'thăng cấp' : 'tiến hóa';
      askConfirm(`Xác nhận dùng ${slot.cur.costGold} Vàng để ${verb} Chiến Hồn?`, go);
    } else {
      go();
    }
  }
}
