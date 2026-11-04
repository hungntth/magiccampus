// Equipment chooser shared by the upgrade tabs: a grid of every equipment piece (bag and worn), click or bag double-click to
// select; the owning tab redraws its detail through onChange. Worn pieces show "M", stars show as "*N".

import type { BagItem } from '@mc/shared';
import { SlotType } from '@mc/shared';
import { el } from '../shopCell';
import { forgeCell } from './forgeCell';
import type { ForgeHost } from './forgeTypes';

export const isEquipment = (i: BagItem): boolean => i.itemType === 2 && (i.slotType === SlotType.BAG || i.slotType === SlotType.EQUIP);

export class EquipPicker {
  readonly root = el('div', 'forge-grid forge-picker');
  private selectedId: number | null = null;

  /** `allow` filters the choices (default: every bag / worn equipment). */
  constructor(
    private readonly host: ForgeHost,
    private readonly onChange: (item: BagItem | null) => void,
    private readonly allow: (i: BagItem) => boolean = isEquipment,
  ) {}

  selected(): BagItem | undefined {
    return this.host.items().find((i) => i.id === this.selectedId && this.allow(i));
  }

  accept(item: BagItem): boolean {
    if (!this.allow(item)) return false;
    this.selectedId = item.id;
    this.render();
    this.onChange(item);
    return true;
  }

  render(): void {
    const list = this.host.items().filter(this.allow).sort((a, b) => a.slotType - b.slotType || a.sid - b.sid);
    if (this.selectedId !== null && !list.some((i) => i.id === this.selectedId)) {
      this.selectedId = null;
      this.onChange(null);
    }
    this.root.replaceChildren(...(list.length === 0 ? [el('div', 'forge-hint', 'Không có trang bị phù hợp.')] : list.map((i) => {
      const count = i.slotType === SlotType.EQUIP ? 'M' : i.star ? `*${i.star}` : undefined;
      const cell = forgeCell({ iconCode: i.iconCode, name: i.name, color: i.color, count, title: `${i.name}${i.star ? `  *${i.star}` : ''}` });
      if (i.id === this.selectedId) cell.classList.add('selected');
      cell.onclick = () => this.accept(i);
      return cell;
    })));
  }
}
