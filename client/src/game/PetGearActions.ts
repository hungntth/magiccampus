// Pet skill / equipment / slot actions of the pet window (phase E): client gates and confirms, then fire-and-forget RPCs
// (petOpenSkill, petDelSkill, petEquipOn, petEquipOff, petOpenSlot) and the awaited petBook. Failures arrive as
// onSystemMidMsgOrNote pushes. Bag double-click routing (BagActions.petGear): books learn, pet equipment is worn.

import {
  ItemKind, ITEM_TYPE_PET_BOOK, PET_SLOT_GOLD, PetLimits, isPetEquipPosition, petLevelOfExp, petSkillOpenCost,
  type BagItem, type PetBookReply, type PetSkillInfo, type PetView, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { createThrottle } from '../net/throttle';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';

const OP_DELAY = 500;

export interface PetGearHost {
  client: GameClient;
  player: PlayerData;
  pets(): PetView[];
  /** Pet selected in the open window, null when the window is closed. */
  panelPet(): PetView | null;
}

export class PetGearActions {
  private readonly allow = createThrottle();
  private readonly info = new Map<number, PetSkillInfo>();

  constructor(private readonly host: PetGearHost) {}

  /** onPetSkillInfo push: display facts of a freshly learned skill. */
  remember(map: Record<number, PetSkillInfo>): void {
    for (const s of Object.values(map)) this.info.set(s.id, s);
  }

  skillInfo(id: number): PetSkillInfo | undefined {
    const known = this.info.get(id);
    if (known) return known;
    for (const p of this.host.pets()) {
      const s = p.skillInfo?.[id];
      if (s) return s;
    }
    return undefined;
  }

  /** Bag double-click: true when the item is a pet book or pet equipment (handled here, nothing else to do). */
  use(item: BagItem): boolean {
    const book = item.tplType === ITEM_TYPE_PET_BOOK;
    const gear = item.itemType === ItemKind.EQUIP && isPetEquipPosition(item.position);
    if (!book && !gear) return false;
    const pet = this.host.panelPet();
    if (!pet) {
      toast('Hãy mở bảng quản lý pet và chọn pet trước!');
      return true;
    }
    if (!this.allow('petGear', OP_DELAY)) return true;
    if (gear) {
      if (petLevelOfExp(pet.exp) < item.reqLevel) toast('Cấp độ pet chưa đủ!');
      else this.send('petEquipOn', pet.id, item.id);
    } else void this.host.client.call<PetBookReply>('petBook', pet.id, item.id).catch(() => undefined);
    return true;
  }

  equipOff(pet: PetView, item: BagItem): void {
    if (this.allow('petGear', OP_DELAY)) this.send('petEquipOff', pet.id, item.id);
  }

  openSkill(pet: PetView, slot: number): void {
    const cost = petSkillOpenCost(slot, pet.qLevel);
    if (cost === null) return;
    const p = this.host.player;
    if (p.goldBind < cost && p.gold < cost) return void toast('Không đủ vàng để mở ô kỹ năng!');
    askConfirm(`Dùng ${cost} Kim phiếu (hoặc Vàng) để mở ô kỹ năng ${slot}?`, () => {
      if (this.allow('petGear', OP_DELAY)) this.send('petOpenSkill', pet.id, slot);
    });
  }

  delSkill(pet: PetView, slot: number): void {
    if (!pet.binded) return void toast('Phải khóa pet mới xóa được');
    const name = this.skillInfo(pet[`skill${slot as 1}`])?.name ?? 'kỹ năng này';
    askConfirm(`Xóa ${name}? Cần 1 Thuốc Tẩy Kỹ Năng Pet.`, () => {
      if (this.allow('petGear', OP_DELAY)) this.send('petDelSkill', pet.id, slot, '');
    });
  }

  /** Pet gear repair (10 silver per point; the cost arrives as onUPP, a refusal as a note): one piece or everything the pet wears. */
  repair(pet: PetView, item: BagItem): void {
    if (this.allow('petRepair', OP_DELAY)) this.send('repairPetEqu', pet.id, item.id, 1);
  }

  repairAll(pet: PetView): void {
    if (this.allow('petRepair', OP_DELAY)) this.send('repairPetEquAll', pet.id, 1);
  }

  openSlot(): void {
    const p = this.host.player;
    if (p.petMaxNum >= PetLimits.maxSlots) return void toast('Số ô pet đã đạt tối đa');
    if (p.goldBind < PET_SLOT_GOLD && p.gold < PET_SLOT_GOLD) return void toast('Không đủ vàng để mở thêm ô pet!');
    askConfirm(`Dùng ${PET_SLOT_GOLD} Kim phiếu (hoặc Vàng) để mở thêm 1 ô pet?`, () => {
      if (this.allow('petGear', OP_DELAY)) this.send('petOpenSlot');
    });
  }

  private send(method: string, ...args: unknown[]): void {
    void this.host.client.call(method, ...args).catch(() => undefined);
  }
}
