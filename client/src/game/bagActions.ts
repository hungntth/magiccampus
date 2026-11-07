// Bag / equipment RPC calls with the client gates and throttles of the legacy client (Player.useItem, RPCConfig.RPC_DELAY).
// All calls are fire-and-forget: failures arrive as onSystemMidMsgOrNote pushes, so rejections are ignored.

import {
  BankQuickMove, EQUIP_SLOT_COUNT, ItemKind, PLAYER_USE_TEXT, batchUseKind, petGrowMaxUnits, petLevelOfExp, useGate,
  type BagItem, type PlayerData, type RecoverEntry,
} from '@mc/shared';

/** Template type of pet life-restore items (useItem targetType 2). */
const PET_FUNC_TYPE = 507;
/** Quy Nguyen Chau: the reset asks for a confirmation first (Language.PLAYER_S[10]). */
const RESET_POINT_ITEM = 995;
import type { GameClient } from '../net/client';
import type { PetGearActions } from './PetGearActions';
import { RPC_DELAY, createThrottle } from '../net/throttle';
import { askAmount } from '../ui/amountDialog';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { HP_POTION, MP_POTION } from './potions';

export class BagActions {
  private readonly allow = createThrottle();
  /** Set by PetController: the pet a life item is used on (selected in the open panel, else the battle pet). */
  petTarget: () => number | null = () => null;
  /** Set by PetController: pet skill books and pet equipment double-clicks (needs the pet window open). */
  petGear: Pick<PetGearActions, 'use'> | null = null;
  /** Set by BagController: teleport scrolls and the rename card open their own dialogs (true = handled). */
  funcHook: ((item: BagItem) => boolean) | null = null;

  constructor(
    private readonly client: GameClient,
    private readonly player: () => PlayerData,
    private readonly items: () => Iterable<BagItem>,
  ) {}

  /** Double-click on a bag item: equipment is equipped, anything else is used (Flash Player.useItem gates, then useItem / useMultiItem). */
  use(item: BagItem): void {
    if (this.petGear?.use(item)) return;
    const equip = item.itemType === ItemKind.EQUIP;
    const onPet = !equip && (item.tplType === PET_FUNC_TYPE || item.useType === 2); // pet-only items go to the selected / battle pet
    if (!onPet && this.player().level < item.reqLevel) return void toast(PLAYER_USE_TEXT.LEVEL);
    if (this.funcHook?.(item)) return;
    if (equip && (item.position < 1 || item.position > EQUIP_SLOT_COUNT)) return void toast(PLAYER_USE_TEXT.NOT_FOR_CHAR);
    if (!this.allow('useItem', RPC_DELAY.useItem)) return;
    if (equip) return this.send('useItem', 1, -1, item.id);
    let petId = -1;
    if (onPet) {
      const target = this.petTarget();
      if (target === null) return void toast('Bạn chưa có pet để sử dụng vật phẩm này!');
      petId = target;
    }
    const pet = onPet ? this.player().petList[petId] : undefined;
    if (onPet && !pet) return;
    if (item.useType !== undefined && item.tplType !== PET_FUNC_TYPE) {
      const refusal = useGate(onPet ? 'pet' : 'char', { useType: item.useType, reqLevel: item.reqLevel, reqClass: item.reqClass }, {
        charLevel: this.player().level, classId: this.player().classId, petLevel: pet ? petLevelOfExp(pet.exp) : 0,
      });
      if (refusal) return void toast(refusal);
    }
    const target = onPet ? 2 : 1;
    const kind = batchUseKind(item.tid);
    if (kind !== null && item.stackNum > 1) return this.askBatch(item, kind, target, petId, pet?.exp ?? 0);
    if (item.tid === RESET_POINT_ITEM) return void askConfirm('Xác nhận tẩy điểm?', () => this.send('useItem', target, petId, item.id));
    this.send('useItem', target, petId, item.id);
  }

  /** Quantity dialog of Player.useItem (ids 5375-5697, BATCH_ITEM_LIST, wallets, pet grow potions), then useMultiItem. */
  private askBatch(item: BagItem, kind: 'stack' | 'one' | 'petGrow', target: 1 | 2, petId: number, petExp: number): void {
    const max = kind === 'petGrow' ? Math.min(item.stackNum, petGrowMaxUnits(item.tid, petExp, this.player().level)) : item.stackNum;
    if (max <= 0) return void toast(PLAYER_USE_TEXT.PET_GROW_CAP);
    askAmount({
      title: PLAYER_USE_TEXT.QTY_PROMPT,
      max,
      initial: kind === 'stack' ? max : 1,
      totalText: (n) => `${PLAYER_USE_TEXT.QTY_TITLE} ${n} / ${item.stackNum}`,
      onOk: (n) => this.send('useMultiItem', target, petId, item.id, n),
    });
  }

  /** Drag from the bag onto the character panel. */
  equipOn(item: BagItem): void {
    if (item.itemType !== ItemKind.EQUIP) return void toast('Vật phẩm này bạn không dùng được!');
    if (this.player().level < item.reqLevel) return void toast('Cấp độ bạn chưa đủ!');
    if (!this.allow('equip', RPC_DELAY.equip)) return;
    this.send('equipOn', item.id);
  }

  /** toSid -1 = first free bag slot. */
  equipOff(item: BagItem, toSid: number): void {
    if (!this.allow('equip', RPC_DELAY.equip)) return;
    this.send('equipOff', item.id, toSid);
  }

  move(from: BagItem, toSid: number): void {
    if (from.sid === toSid || !this.allow('move', RPC_DELAY.move)) return;
    this.send('moveItem', from.sid, toSid);
  }

  /** Drop on a page tab (or double-click between bag and bank): first free slot of that page. pageType 1 bag, 2 bank. */
  moveToPage(from: BagItem, pageType: number, tab: number): void {
    if (!this.allow('move', RPC_DELAY.move)) return;
    this.send('moveItemToPage', from.sid, pageType, tab);
  }

  /** Repair tool click on one item: mode 1 (bag tool) or 2 (shop tool); the cost arrives as onUPP, no cost is shown. */
  repair(item: BagItem, mode: 1 | 2): void {
    if (!this.allow('repair', RPC_DELAY.repair)) return;
    this.send('repair', item.id, mode);
  }

  repairAll(mode: 1 | 2): void {
    askConfirm('Sửa chữa toàn bộ trang bị?', () => {
      if (this.allow('repair', RPC_DELAY.repair)) this.send('repairAll', mode);
    });
  }

  /** Double-click while the bank is open: dir 1 bag -> bank, 2 bank -> bag (whole stack, merges when it can). */
  bagToBank(item: BagItem, toBank: boolean): void {
    if (!this.allow('move', RPC_DELAY.move)) return;
    this.send('bagToBank', item.sid, toBank ? BankQuickMove.TO_BANK : BankQuickMove.TO_BAG);
  }

  /** Bank Sắp xếp button (the panel disables it for 30 s). */
  bankSort(onSent: () => void): void {
    askConfirm('Xác nhận sắp xếp kho?', () => {
      this.send('bankSort');
      onSent();
    });
  }

  /** Vứt bỏ multi-select: one confirm with the count, then delBagItems(ids). */
  deleteItems(items: readonly BagItem[], done: () => void): void {
    if (items.length === 0) return;
    askConfirm(`Xác nhận xóa ${items.length} vật phẩm đã chọn?`, () => {
      if (this.allow('drop', RPC_DELAY.drop)) this.send('delBagItems', items.map((i) => i.id), '');
      done();
    });
  }

  /** The bank window was closed: the server stops accepting moves to and from bank slots. */
  closeBank(): void {
    this.send('closeBank');
  }

  /** Shift-drop of a stack onto an empty slot: asks how many to take, then moveItemNum. */
  split(from: BagItem, toSid: number): void {
    if (from.stackNum < 2) return this.move(from, toSid);
    askAmount({
      title: 'Chọn số lượng',
      max: from.stackNum - 1,
      totalText: (n) => `Tách ${n} / ${from.stackNum}`,
      onOk: (n) => {
        if (this.allow('move', RPC_DELAY.move)) this.send('moveItemNum', from.sid, toSid, n);
      },
    });
  }

  drop(item: BagItem): void {
    askConfirm('Xác nhận hủy vật phẩm này?', () => {
      if (this.allow('drop', RPC_DELAY.drop)) this.send('dropItem', item.id);
    });
  }

  sort(): void {
    askConfirm('Xác nhận sắp xếp túi đồ?', () => {
      if (this.allow('bagSort', RPC_DELAY.bagSort)) this.send('bagSort');
    });
  }

  /** HP / MP bar click: bag potions of the known template tables, lowest priority first (bound before unbound). */
  recover(kind: 'hp' | 'mp'): void {
    if (!this.allow('recover', RPC_DELAY.recover)) return;
    const table = kind === 'hp' ? HP_POTION : MP_POTION;
    const entries: RecoverEntry[] = [];
    for (const it of this.items()) {
      const amount = it.slotType === 0 ? table[it.tid] : undefined;
      if (amount !== undefined) entries.push({ sid: it.id, priority: amount - (it.binded ? 1 : 0) });
    }
    entries.sort((a, b) => a.priority - b.priority);
    this.send(kind === 'hp' ? 'fullHpRecoverByItem' : 'fullMpRecoverByItem', 1, -1, entries);
  }

  private send(method: string, ...args: unknown[]): void {
    void this.client.call(method, ...args).catch(() => undefined);
  }
}
