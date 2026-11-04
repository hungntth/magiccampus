// Material slots of the upgrade tabs: one slot per required template, auto-filled from the bag; clicking a slot cycles
// through the candidate stacks (different ColorCode). Rendering only: the owner reads `ids()` / `ready()`.

import type { BagItem, UpgradeMaterial } from '@mc/shared';
import { SlotType } from '@mc/shared';
import { el } from '../shopCell';
import { forgeCell } from './forgeCell';
import type { ForgeHost } from './forgeTypes';

export class MaterialSlots {
  readonly root = el('div', 'forge-slots');
  private chosen = new Map<number, number | null>(); // slot -> bag item id
  private needs: UpgradeMaterial[] = [];

  constructor(private readonly host: ForgeHost, private readonly onChange: () => void = () => undefined) {}

  /** Replaces the requirement list (resets the choices when it changed) and redraws. */
  set(needs: UpgradeMaterial[]): void {
    const same = needs.length === this.needs.length && needs.every((n, i) => n.tid === this.needs[i].tid && n.slot === this.needs[i].slot);
    this.needs = needs;
    if (!same) this.chosen.clear();
    this.render();
  }

  /** Bag item id per slot, in slot order; null while any slot is empty. */
  ids(): number[] | null {
    const out = this.needs.map((n) => this.chosen.get(n.slot) ?? null);
    return out.some((id) => id === null) ? null : (out as number[]);
  }

  ready(): boolean {
    return this.needs.length > 0 && this.ids() !== null;
  }

  id(slot: number): number | null {
    return this.chosen.get(slot) ?? null;
  }

  private candidates(n: UpgradeMaterial): BagItem[] {
    const used = new Set([...this.chosen.entries()].filter(([s]) => s !== n.slot).map(([, id]) => id));
    return this.host.items()
      .filter((i) => i.slotType === SlotType.BAG && i.itemType === 1 && i.tid === n.tid && i.stackNum >= n.num && !used.has(i.id))
      .sort((a, b) => a.color - b.color || a.sid - b.sid);
  }

  render(): void {
    const byId = new Map(this.host.items().map((i) => [i.id, i]));
    for (const n of this.needs) {
      const cur = byId.get(this.chosen.get(n.slot) ?? -1);
      if (!cur || cur.tid !== n.tid || cur.stackNum < n.num) this.chosen.set(n.slot, this.candidates(n)[0]?.id ?? null);
    }
    this.root.replaceChildren(...this.needs.map((n) => {
      const it = byId.get(this.chosen.get(n.slot) ?? -1);
      const have = this.host.items().filter((i) => i.tid === n.tid && i.slotType === SlotType.BAG && i.itemType === 1)
        .reduce((a, i) => a + i.stackNum, 0);
      const cell = forgeCell({
        iconCode: it?.iconCode ?? '0', name: n.name, color: it?.color ?? 0, count: `${it?.stackNum ?? have}/${n.num}`, lacking: !it,
        title: `${n.name} x${n.num}${it ? ` (cấp ${it.color + 1})` : ' (thiếu)'}\nNhấp để đổi chồng nguyên liệu`,
      }, 'forge-cell forge-slot');
      if (!it) cell.classList.add('empty');
      cell.onclick = () => this.cycle(n);
      const box = el('div', 'forge-slot-box');
      box.append(cell, el('div', 'forge-slot-name', n.name));
      return box;
    }));
  }

  private cycle(n: UpgradeMaterial): void {
    const cands = this.candidates(n);
    const i = cands.findIndex((c) => c.id === this.chosen.get(n.slot));
    const next = cands[(i + 1) % Math.max(1, cands.length)];
    if (next) this.chosen.set(n.slot, next.id);
    this.render();
    this.onChange();
  }
}
