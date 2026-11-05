// M10 phase H on the client: the Phòng Tu Luyện Ảo Ma window (strip id 81: getHMTXLSData, enterPubRoom, endHMTXLRoom, getHMTAward;
// pushes onHMTXLSData, onHMTXLSMSG, resetHMTAlert(gold) -> confirm -> onResetHMTProgress(cid)) and the Khóa Học Đặc Huấn window
// (strip id 80: getTXKCData + the seven action RPCs; push onTXKCGetData). Owned by ActivityController; the server answers every
// panel RPC with its push, so the windows only call and re-render from the pushes.

import type { HmtxlData, PlayerData, TxkcData, TxkcItemInfo } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { HmtxlPanel } from '../ui/hmtxlPanel';
import { stripTags } from '../ui/npcDialog';
import { toast } from '../ui/screens';
import { TxkcPanel } from '../ui/txkcPanel';

export interface TrainingHost {
  client: GameClient;
  player: PlayerData;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class TrainingController {
  private readonly hmtxl: HmtxlPanel;
  private readonly txkc: TxkcPanel;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: TrainingHost) {
    const { client, player } = host;
    const call = (m: string, ...a: unknown[]): void => void client.call(m, ...a).catch(fail);
    this.hmtxl = new HmtxlPanel({ call, onClose: () => this.hmtxl.close() });
    this.txkc = new TxkcPanel({ call, onClose: () => this.txkc.close() });
    this.offs.push(
      client.on('onHMTXLSData', (d) => this.hmtxl.setData(d as HmtxlData)),
      client.on('onHMTXLSMSG', (t) => this.hmtxl.addLog(stripTags(String(t ?? '')))),
      client.on('resetHMTAlert', (gold) => {
        askConfirm(`Tái thiết lập tiến độ Ảo Ma Tháp tốn ${Number(gold)} vàng (mỗi tuần 1 lần). Xác nhận?`, () => call('onResetHMTProgress', player.id));
      }),
      client.on('onTXKCGetData', (d) => this.txkc.setData(d as TxkcData)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.hmtxl.close();
    this.txkc.close();
  }

  /** Strip icon 81. */
  openHmtxl(): void {
    if (this.hmtxl.isOpen) return this.hmtxl.close();
    this.hmtxl.show();
    void this.host.client.call('getHMTXLSData').catch(fail);
  }

  /** Strip icon 80. */
  openTxkc(): void {
    if (this.txkc.isOpen) return this.txkc.close();
    this.txkc.show();
    void this.host.client.call<TxkcItemInfo>('getTXKCData').then((items) => this.txkc.setItems(items ?? {})).catch(fail);
  }
}
