// M8 phase D on the client (part 2): the wish tree (getLottoData / lottoByClient + the holding bag calls, push updateLottoBag), the
// magic array (getMagicArrayData / addPracticeExp, push updatePraView) and the mount (list / feed / evolve / ride; pushes onAddMountExp,
// onUpdateDressList; the rider sprite of onMountOn / onMountOff is AppearanceController's). Owned by ActivityController.

import {
  PRA_TRACKS, type AddMountExpReply, type AddMountUpExpReply, type LottoData, type LottoEntry, type MountListReply, type PlayerData, type PraView,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { LottoPanel } from '../ui/lottoPanel';
import { MountPanel } from '../ui/mountPanel';
import { PrabuffPanel } from '../ui/prabuffPanel';
import { toast } from '../ui/screens';

export interface StoreSystemsHost {
  client: GameClient;
  player: PlayerData;
  bagCount(templateId: number): number;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class StoreSystemsController {
  private readonly lotto: LottoPanel;
  private readonly pra: PrabuffPanel;
  private readonly mount: MountPanel;
  private lottoData: LottoData | null = null;
  private bag: LottoEntry[] = [];
  private readonly views = new Map<number, PraView>();
  private note = '';
  private mountData: MountListReply | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: StoreSystemsHost) {
    const { client } = host;
    this.lotto = new LottoPanel({
      data: () => this.lottoData, bag: () => this.bag,
      onDraw: (type, num) => void client.call('lottoByClient', { type, num }).then(() => this.loadLotto()).catch(fail),
      onClaim: (i) => void client.call<LottoEntry[]>('getSingleItem', i).catch(fail),
      onClaimAll: () => void client.call<LottoEntry[]>('getAllItem').catch(fail),
      onThrowAll: () => void client.call<LottoEntry[]>('throwAllItem').catch(fail),
      onClose: () => this.lotto.close(),
    });
    this.pra = new PrabuffPanel({
      view: (t) => this.views.get(t) ?? null, note: () => this.note,
      onPractice: (type, isGold) => void client.call<PraView>('addPracticeExp', type, isGold).catch(fail),
      onClose: () => this.pra.close(),
    });
    this.mount = new MountPanel({
      data: () => this.mountData, count: (id) => host.bagCount(id),
      onFeed: (mode) => void client.call<AddMountExpReply>('addMountExp', mode).then(() => this.loadMount()).catch(fail),
      onEvolve: () => void client.call<AddMountUpExpReply>('addMountUpExp').then((r) => {
        toast(r.upLv !== undefined ? 'Tiến hóa thành công!' : `Tiến hóa thất bại, điểm may mắn +${r.addExp}`);
        this.loadMount();
      }).catch(fail),
      onRide: (id) => void client.call('beginMounting', id).then(() => this.loadMount()).catch(fail),
      onStop: () => void client.call('stopMounting').then(() => this.loadMount()).catch(fail),
      onRenew: (id) => void client.call<number>('renewMount', id).then(() => this.loadMount()).catch(fail),
      onClose: () => this.mount.close(),
    });
    this.offs.push(
      client.on('updateLottoBag', (b) => {
        this.bag = (b ?? []) as LottoEntry[];
        this.lotto.render();
      }),
      client.on('updatePraView', (v) => {
        const view = v as PraView;
        this.views.set(view.praType, view);
        if (view.addExp) this.note = `Nạp năng lượng: +${view.addExp} exp${view.critMulit ? ' (Bạo kích)' : ''}`;
        this.pra.render();
        void this.refreshBalances(view.praType);
      }),
      client.on('onAddMountExp', () => this.mount.isOpen && this.loadMount()),
      client.on('onUpdateDressList', () => this.mount.isOpen && this.loadMount()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.lotto.close();
    this.pra.close();
    this.mount.close();
  }

  openLotto(): void {
    if (this.lotto.isOpen) return this.lotto.close();
    this.lotto.show();
    this.loadLotto();
    void this.host.client.call<LottoEntry[]>('getLottoBag').catch(fail);
  }

  private loadLotto(): void {
    void this.host.client.call<LottoData>('getLottoData').then((d) => {
      this.lottoData = d;
      this.lotto.render();
    }).catch(fail);
  }

  openPrabuff(): void {
    if (this.pra.isOpen) return this.pra.close();
    this.pra.show();
    for (let t = 1; t <= PRA_TRACKS; t++) void this.fetchTrack(t);
  }

  private async fetchTrack(type: number): Promise<void> {
    const v = await this.host.client.call<PraView>('getMagicArrayData', type).catch(fail);
    if (v) {
      this.views.set(type, v);
      this.pra.render();
    }
  }

  /** Wallet figures of the other tracks of the same currency follow a spend. */
  private async refreshBalances(except: number): Promise<void> {
    for (let t = 1; t <= PRA_TRACKS; t++) if (t !== except && this.pra.isOpen) await this.fetchTrack(t);
  }

  openMount(): void {
    if (this.mount.isOpen) return this.mount.close();
    this.mount.show();
    this.loadMount();
  }

  private loadMount(): void {
    void this.host.client.call<MountListReply>('getMountList').then((d) => {
      this.mountData = d;
      this.host.player.mountInfo = this.host.player.mountInfo ? { ...this.host.player.mountInfo, useDress: d.useDress, lv: d.lev, upLv: d.upLv, exp: d.exp } : this.host.player.mountInfo;
      this.mount.render();
    }).catch(fail);
  }
}
