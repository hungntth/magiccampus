// Consumable item functions opened from the bag: teleport scrolls (double-click -> map picker -> useTransport / useTransportGroup,
// or useItemGold when no scroll is owned), the intimacy gift items (name + quantity dialog -> useIntimacyItem), the divorce card
// (122: confirm -> useGoodCard), the wedding cards 1691-1693 (-> useWeddingBag) and red envelope 1710 (-> useRedBag) and the rename card
// (double-click -> name dialog -> changeNameByCard). Also the /tp command.
// Server refusals arrive as onSystemMidMsgOrNote (announced by BagController); only the battle gate has no note, so it is toasted here.

import {
  MARRIAGE, MARRIAGE_TEXT, RENAME_CARD_TID, WEDDING_ITEMS, TRANSPORT_GOLD_COST, TRANSPORT_PRIORITY, TRANSPORT_SENIOR, TRANSPORT_SENIOR_BUY_TID, TRANSPORT_SENIOR_GOLD_COST,
  TRANSPORT_BUY_TID, isTransportScroll, type BagItem, type ChangeNameByCardReply, type TransportMapsReply,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { RPC_DELAY, createThrottle } from '../net/throttle';
import { askConfirm } from '../ui/confirmDialog';
import { isIntimacyItem, openIntimacyGift } from '../ui/im/intimacyGift';
import { askNewName } from '../ui/renameDialog';
import { toast } from '../ui/screens';
import { openTransportPicker } from '../ui/transportPicker';

const IN_BATTLE = 'Đang chiến đấu';

export class ItemFuncs {
  private readonly allow = createThrottle();
  private pickerOpen = false;

  constructor(
    private readonly client: GameClient,
    private readonly countOf: (templateId: number) => number,
  ) {}

  /** Bag double-click: true when the item is a scroll or a rename card (handled here). */
  handle(item: BagItem): boolean {
    if (isTransportScroll(item.tid)) {
      void this.openTransport();
      return true;
    }
    if (isIntimacyItem(item.tid)) {
      openIntimacyGift(this.client, item);
      return true;
    }
    if (item.tid === MARRIAGE.divorceCardTid) {
      askConfirm(MARRIAGE_TEXT.cardConfirm, () => this.divorce());
      return true;
    }
    const wedding = item.tid === WEDDING_ITEMS.redBag ? 'useRedBag' : (WEDDING_ITEMS.invites as readonly number[]).includes(item.tid) ? 'useWeddingBag' : null;
    if (wedding) {
      this.weddingBag(wedding, item.id);
      return true;
    }
    if (item.tid === RENAME_CARD_TID) {
      this.openRename();
      return true;
    }
    return false;
  }

  /** Map picker; pays with the first owned scroll, else the confirm line names the gold price (useItemGold). */
  async openTransport(): Promise<void> {
    if (this.pickerOpen) return;
    let info: TransportMapsReply;
    try {
      info = await this.client.call<TransportMapsReply>('getTransportMaps');
    } catch (e) {
      return void toast((e as Error).message, true);
    }
    const owns = (group: boolean): boolean => (group ? TRANSPORT_SENIOR : TRANSPORT_PRIORITY).some((tid) => this.countOf(tid) > 0);
    this.pickerOpen = true;
    openTransportPicker({
      maps: info.maps,
      current: info.current,
      leader: info.leader,
      payText: (group) => this.payText(owns(group), group),
      onClose: () => {
        this.pickerOpen = false;
      },
      onPick: (mapId, group) => {
        askConfirm(this.confirmText(owns(group), group), () => this.travel(mapId, group, owns(group)));
      },
    });
  }

  /** World map pin click (legacy Player.mapTrans): the same scroll / gold confirm as the picker; a party leader brings the party. */
  travelTo(mapId: number, group: boolean): void {
    const owns = (group ? TRANSPORT_SENIOR : TRANSPORT_PRIORITY).some((tid) => this.countOf(tid) > 0);
    askConfirm(this.confirmText(owns, group), () => this.travel(mapId, group, owns));
  }

  /** Flash Player.useGoodCard: the server ends the marriage first, then takes the card; refusals ("Bạn chưa kết hôn.") are toasted. */
  private divorce(): void {
    if (!this.allow('divorce', RPC_DELAY.useItem)) return;
    this.client.call('useGoodCard').then(() => toast('Quan hệ hôn nhân đã được giải trừ.'), (e) => toast((e as Error).message, true));
  }

  /** Flash Player.useItem: the invitation cards and the red envelope have their own RPCs taking the slot (item) id; refusals are toasted. */
  private weddingBag(method: 'useWeddingBag' | 'useRedBag', itemId: number): void {
    if (!this.allow(method, RPC_DELAY.useItem)) return;
    this.client.call(method, itemId).catch((e) => toast((e as Error).message, true));
  }

  openRename(): void {
    askNewName((name) => {
      if (!this.allow('rename', RPC_DELAY.useItem)) return;
      this.client.call<ChangeNameByCardReply>('changeNameByCard', name).catch((e) => this.fail(e));
    });
  }

  private payText(owned: boolean, group: boolean): string {
    if (owned) return group ? 'Dùng Tiêu Diêu Phù Cao Cấp trong túi.' : 'Dùng Tiêu Diêu Phù trong túi.';
    return `Không có Tiêu Diêu Phù: tốn ${group ? TRANSPORT_SENIOR_GOLD_COST : TRANSPORT_GOLD_COST} Vàng.`;
  }

  // Flash WORLDMAPICON_S[1] / [0].
  private confirmText(owned: boolean, group: boolean): string {
    if (owned) return 'Dùng Tiêu Diêu Phù sẽ đến được đây, xác nhận sử dụng?';
    return `Bạn không có Tiêu Diêu Phù, xác nhận mua và dịch chuyển? (${group ? TRANSPORT_SENIOR_GOLD_COST : TRANSPORT_GOLD_COST} Vàng)`;
  }

  private travel(mapId: number, group: boolean, owned: boolean): void {
    if (!this.allow('transport', RPC_DELAY.useItem)) return;
    const call = owned
      ? group ? this.client.call('useTransportGroup', mapId) : this.client.call('useTransport', mapId, false)
      : this.client.call('useItemGold', { tid: group ? TRANSPORT_SENIOR_BUY_TID : TRANSPORT_BUY_TID, mid: mapId });
    call.catch((e) => this.fail(e));
  }

  private fail(e: unknown): void {
    const msg = (e as Error).message;
    if (msg === IN_BATTLE) toast(msg, true);
  }
}
