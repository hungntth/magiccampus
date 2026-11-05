// Base of the "T.bị Pet" forge tabs (M12 slice 5 client): a pet gear picker (bag, pet item page and gear worn by pets), a detail
// column with the material slots, and the busy / toast plumbing every tab shares. Subclasses implement renderDetail(eq).

import type { BagItem, UpgradeMaterial } from '@mc/shared';
import { isPetEquipPosition, ItemKind, SlotType } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import { EquipPicker } from './equipPicker';
import type { ForgeHost, ForgeTabView } from './forgeTypes';
import { MaterialSlots } from './materialSlots';

/** Names of the pet upgrade materials (item templates 2528 / 2529 are not in the seeds: generic names). */
export const PET_MATERIAL_NAMES: Readonly<Record<number, string>> = {
  2333: 'Mảnh Vỡ Linh Giáp', 2334: 'Tinh Túy Linh Giáp', 2335: 'Tinh Hồn Linh Giáp', 2528: 'Tinh Túy Linh Giáp (đặc biệt)',
  2529: 'Mảnh Vỡ Linh Giáp (đặc biệt)', 2809: 'Linh Giáp Tinh Thạch', 3491: 'Tinh Nguyên Linh Giáp', 4841: 'Bụi Vô Hạn', 4842: 'Bụi Ma Pháp',
};

export const isPetGear = (i: BagItem): boolean => i.itemType === ItemKind.EQUIP && isPetEquipPosition(i.position);

export const material = (tid: number, num: number): UpgradeMaterial => ({ slot: 1, tid, name: PET_MATERIAL_NAMES[tid] ?? `#${tid}`, num });

/** Units of an item template in the main bag (every stack). */
export function bagCount(host: ForgeHost, tid: number): number {
  return host.items().filter((i) => i.slotType === SlotType.BAG && i.itemType === 1 && i.tid === tid).reduce((n, i) => n + i.stackNum, 0);
}

/** The biggest bag stack of a template, or undefined. */
export function bigStack(host: ForgeHost, tid: number): BagItem | undefined {
  return host.items().filter((i) => i.slotType === SlotType.BAG && i.itemType === 1 && i.tid === tid).sort((a, b) => b.stackNum - a.stackNum)[0];
}

export abstract class PetGearView implements ForgeTabView {
  protected readonly picker: EquipPicker;
  protected readonly detail = el('div', 'forge-detail');
  protected readonly slots: MaterialSlots;
  protected busy = false;
  protected disposed = false;

  protected constructor(protected readonly host: ForgeHost, body: HTMLElement) {
    this.slots = new MaterialSlots(host, () => this.renderDetail());
    this.picker = new EquipPicker({ ...host, items: () => host.petGear() }, () => this.renderDetail(), isPetGear, true);
    body.append(this.picker.root, this.detail);
  }

  /** Subclass constructors call this last (field initialisers of the subclass must exist before the first render). */
  protected start(): void {
    this.refresh();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    this.picker.render();
    this.renderDetail();
  }

  accept(item: BagItem): boolean {
    return this.picker.accept(item);
  }

  protected abstract renderDetail(): void;

  protected hint(text: string): void {
    this.detail.replaceChildren(el('div', 'forge-hint', text));
  }

  /** One-line description of the chosen piece. */
  protected title(eq: BagItem): HTMLElement {
    const owner = eq.slotType === SlotType.PET_EQUIP ? '  (pet đang mặc)' : '';
    return el('div', 'forge-title', `${eq.name}  cấp ${eq.reqLevel}${eq.binded ? '  (đã khóa)' : ''}${eq.star ? `  *${eq.star}` : ''}${owner}`);
  }

  /** Runs one action: busy guard, error toast, redraw. */
  protected async act(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.renderDetail();
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.refresh();
    }
  }
}
