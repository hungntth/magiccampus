// Wing panel flow (Cải tạo cánh): owns the window, the view state and every wing RPC (wingJoin / wingSeniorJoin, addWingStar, addWingHole,
// addWingFeather, featherDel, featherUpdate, featherMix, changeWingPrefix / sureChangeWingPrefix, changeWingBind / sureChangeWingBind,
// newWingAdvanced, showNewWingPro, buyCritItem, changeWingRes, changeWingColor / onSureChangeWingColor). A refusal arrives as
// onSystemMidMsgOrNote (BagController toast) plus the failure reply. Pushes handled here: onShowNewWingPro, updateCritItemNum, showWingColorPanel.
// The look reaches the map through onWingOn / onWingOff (AppearanceController).

import type {
  AddWingHoleReply, BagItem, ChangeWingBindReply, ChangeWingPrefixReply, ChangeWingResReply, CritItemNum, FeatherMixReply, FeatherUpdateReply, NewWingProState,
  PlayerData, SureChangeWingBindReply, SureChangeWingPrefixReply, WingColorOption, WingJoinReply, WingStarReply,
} from '@mc/shared';
import { WING_TEXT } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askAmount } from '../ui/amountDialog';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { stageEl } from '../ui/stage';
import { newWingViewState, type WingActions, type WingUiHost } from '../ui/wing/wingTypes';
import { createWingWindow } from '../ui/wing/wingWindow';
import type { FeatureWindow } from '../ui/feature/featureWindow';

export interface WingControllerHost {
  client: GameClient;
  player: PlayerData;
  /** Bag + worn items. */
  items(): BagItem[];
}

/** NPC 1502 (Thợ Nhuộm): the argument the Flash client sends with changeWingColor (ignored by the server). */
const DYE_NPC = 1502;

export class WingController {
  private readonly view = newWingViewState();
  private readonly ui: WingUiHost;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];
  private busy = false;
  private closePicker: (() => void) | null = null;

  constructor(private readonly host: WingControllerHost) {
    this.ui = { items: () => host.items(), state: this.view, actions: this.actions(), render: () => this.win.render() };
    this.win = createWingWindow(() => this.ui, () => this.close());
    const { client } = host;
    this.offs.push(
      client.on('onShowNewWingPro', (d) => {
        this.view.advance = d as NewWingProState;
        this.win.render();
      }),
      client.on('updateCritItemNum', (d) => {
        const n = d as CritItemNum;
        if (this.view.advance) this.view.advance = { ...this.view.advance, num1: n.num1, num2: n.num2 };
        this.win.render();
      }),
      client.on('showWingColorPanel', (d) => this.pickDye(d as WingColorOption[])),
    );
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else this.open();
  }

  open(tab = 0): void {
    if (this.win.isOpen) return;
    const worn = this.host.items().find((i) => i.itemType === 2 && i.position === 22 && i.slotType === 1);
    if (!this.view.sel || !this.host.items().some((i) => i.id === this.view.sel)) this.view.sel = worn?.id ?? this.host.items().find((i) => i.position === 22 && i.itemType === 2)?.id ?? 0;
    this.win.show(tab);
  }

  close(): void {
    this.closePicker?.();
    this.closePicker = null;
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  /** Bag changed (items, stacks, stat pushes): redraw the open window. */
  refresh(): void {
    this.win.render();
  }

  private note(text: string): void {
    this.view.note = text;
    this.win.render();
  }

  /** One RPC at a time; null when it was rejected (the message is toasted). */
  private async run<T>(method: string, ...args: unknown[]): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch (e) {
      toast((e as Error).message, true);
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async pickDye(options: WingColorOption[]): Promise<void> {
    this.closePicker?.();
    const root = document.createElement('div');
    root.className = 'amount-dialog confirm-dialog wing-dye';
    const msg = document.createElement('div');
    msg.className = 'amount-total confirm-text';
    msg.textContent = 'Chọn màu nhuộm cho cánh:';
    const row = document.createElement('div');
    row.className = 'amount-row';
    const close = (): void => {
      root.remove();
      this.closePicker = null;
    };
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'amount-btn';
      b.textContent = `Màu ${o.color}`;
      b.dataset.series = String(o.color);
      b.onclick = () => {
        close();
        void this.run<boolean>('onSureChangeWingColor', o.color).then((ok) => this.note(ok ? 'Nhuộm cánh thành công.' : 'Nhuộm cánh thất bại.'));
      };
      row.appendChild(b);
    }
    root.append(msg, row);
    stageEl().appendChild(root);
    this.closePicker = close;
  }

  private actions(): WingActions {
    const v = this.view;
    return {
      join: (mainId, subIds, senior) => void this.joinWings(mainId, subIds, senior),
      star: (count, wingId, stoneId, upTo) => void this.run<WingStarReply>('addWingStar', count, wingId, stoneId, upTo).then((r) => {
        if (r) this.note(`${r.flag ? 'Thăng tinh thành công' : 'Thăng tinh thất bại'}: ${r.upgradeNum} sao.`);
      }),
      hole: (wingId, materialId) => void this.run<AddWingHoleReply>('addWingHole', wingId, materialId).then((r) => {
        if (r?.f) this.note(WING_TEXT.HOLE_OK);
      }),
      inlay: (wingId, slot, featherId) => void this.run<number>('addWingFeather', wingId, { [String(slot)]: { idx: featherId, flag: false } }).then((n) => {
        if (n) this.note(WING_TEXT.INLAY_OK(n));
      }),
      remove: (wingId, slot, name, silver) => askConfirm(WING_TEXT.REMOVE_CONFIRM(silver, name), () => void this.run<boolean>('featherDel', wingId, slot).then((ok) => {
        if (ok) this.note(`Đã bỏ ${name}; Lông Vũ trở về túi (đã khóa).`);
      })),
      upgrade: (featherId, luckId, luckCount, once) => void this.run<FeatherUpdateReply>('featherUpdate', featherId, luckId, luckCount, once, false).then((r) => {
        if (r) this.note(r.flag ? WING_TEXT.FEATHER_UP_OK(r.finalNum) : WING_TEXT.FEATHER_UP_FAIL);
      }),
      mix: (formulaId, inputs, luckId, luckCount) => void this.run<FeatherMixReply>(
        'featherMix', { idx: formulaId, flag: false }, { 1: { idx: inputs[0], flag: false }, 2: { idx: inputs[1], flag: false } }, luckId, luckCount, false,
      ).then((r) => {
        if (r) this.note(r.f ? 'Dung hợp lông vũ thành công.' : 'Dung hợp lông vũ thất bại.');
      }),
      prefix: (wingId, materialId) => void this.run<ChangeWingPrefixReply>('changeWingPrefix', { e: wingId, i: materialId }).then((r) => {
        if (r?.f) {
          v.prefix = { wingId, lines: r.n };
          this.note('');
        }
      }),
      decidePrefix: (accept) => void this.run<SureChangeWingPrefixReply>('sureChangeWingPrefix', accept ? 1 : -1).then((r) => {
        v.prefix = null;
        this.note(accept && r?.f === 'sure' ? WING_TEXT.PREFIX_OK : '');
      }),
      bind: (wingId, materialId) => void this.run<ChangeWingBindReply>('changeWingBind', wingId, materialId).then((r) => {
        if (r?.f) {
          v.bind = { wingId, cur: [r.b1, r.b2], next: [r.b11, r.b12] };
          this.note('');
        }
      }),
      decideBind: (accept) => void this.run<SureChangeWingBindReply>('sureChangeWingBind', accept ? 1 : -1).then((r) => {
        v.bind = null;
        this.note(accept && r?.f === 'sure' ? WING_TEXT.BIND_OK : '');
      }),
      advance: (useCrit, mode) => void this.run<null>('newWingAdvanced', useCrit, mode),
      buyCrit: () => askAmount({
        title: 'Mua Linh Phiến Bạo Kích Phù', max: 99_999, totalText: (n) => `Thành tiền: ${n * 10} Vàng`, onOk: (n) => void this.run<null>('buyCritItem', n),
      }),
      setLook: (index) => void this.run<ChangeWingResReply>('changeWingRes', index).then((r) => {
        if (r?.flag) this.ui.actions.refreshState();
      }),
      dye: () => void this.run<null>('changeWingColor', DYE_NPC),
      refreshState: () => void this.host.client.call('showNewWingPro').catch(() => undefined),
    };
  }

  private async joinWings(mainId: number, subIds: number[], senior: boolean): Promise<void> {
    const r = senior
      ? await this.run<WingJoinReply>('wingSeniorJoin', mainId, subIds)
      : await this.run<WingJoinReply>('wingJoin', mainId, { w1: subIds[0], w2: subIds[1], w3: subIds[2], w4: subIds[3] });
    if (!r) return;
    this.view.subs = [];
    this.note(r.f ? WING_TEXT.JOIN_OK : WING_TEXT.JOIN_FAIL);
  }
}
