// Forge tab "Chế tạo" (legacy EquiptFuncPanel tab 0): kind/type tree, recipe list filtered by the "Chọn nghề" class
// dropdown, the product + required + placed material cells, "Tự đặt ng.liệu" autofill, the getMakeColor rates row and
// newMake behind the 2 s progress bar. Bag double-click fills the matching slot, clicking a placed slot cycles stacks.

import type { BagItem, GetMakeColorReply, MakeRecipe, MaterialRefs, NewMakeReply } from '@mc/shared';
import { AUCTION_KINDS, CLASS_NAMES, SlotType } from '@mc/shared';
import { itemTypeName } from '../itemTypeNames';
import { toast } from '../screens';
import { el } from '../shopCell';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';
import './craft.css';

const PROGRESS_MS = 2000;
const SLOTS = [1, 2, 3];
const KINDS = AUCTION_KINDS.slice(0, 4); // Vũ khí, Trợ thủ, Trang bị, Trang sức

class CraftView implements ForgeTabView {
  private recipes: MakeRecipe[] = [];
  private readonly open = new Set<number>();
  private type: number | null = null;
  private classId = 0; // 0 = "Chọn nghề" (every class)
  private selected: MakeRecipe | null = null;
  private chosen = new Map<number, number | null>(); // material slot -> bag item id
  private busy = false;
  private disposed = false;
  private previewSeq = 0;
  private readonly tree = el('div', 'craft-tree');
  private readonly list = el('div', 'craft-list');
  private readonly product = el('div', 'craft-cells');
  private readonly need = el('div', 'craft-cells');
  private readonly put = el('div', 'craft-cells');
  private readonly auto = el('button', 'craft-auto', 'Tự đặt ng.liệu');
  private readonly rates = [0, 1, 2, 3].map(() => el('div', 'craft-rate', '0%'));
  private readonly bar = el('div', 'craft-bar');
  private readonly fill = el('div', 'craft-bar-fill');
  private readonly barText = el('span', 'craft-bar-text');
  private readonly go = el('button', 'craft-go', 'Chế');

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    const sel = el('select', 'craft-class');
    sel.append(new Option('Chọn nghề', '0'), ...Object.entries(CLASS_NAMES).map(([id, name]) => new Option(name, id)));
    sel.onchange = () => {
      this.classId = Number(sel.value);
      if (this.type !== null && !KINDS.some((k) => this.types(k).includes(this.type ?? -1))) this.type = null;
      this.renderTree();
      this.renderList();
    };
    const mid = el('div', 'craft-mid');
    mid.append(this.list, sel);
    const right = el('div', 'craft-box craft-right');
    right.append(el('div', 'craft-label', 'Vật phẩm'), this.product, el('div', 'craft-label', 'Nguyên liệu cần'), this.need,
      el('div', 'craft-label', 'Đặt nguyên liệu'), this.put, this.auto);
    this.auto.onclick = () => this.autofill();
    const top = el('div', 'craft-top');
    top.append(this.tree, mid, right);

    const rateLabel = el('div', 'craft-rate-label', 'Tỷ lệ phẩm chất');
    rateLabel.title = 'Tỷ lệ ra phẩm chất Lục / Lam / Tím / Cam';
    const rateRow = el('div', 'craft-rate-row');
    rateRow.append(rateLabel, ...this.rates);
    this.bar.append(this.fill, this.barText);
    this.go.onclick = () => this.selected && void this.make(this.selected);
    const actRow = el('div', 'craft-act-row');
    actRow.append(this.bar, this.go);
    const bottom = el('div', 'craft-box craft-bottom');
    bottom.append(rateRow, actRow);

    const root = el('div', 'craft');
    root.append(top, bottom);
    body.appendChild(root);
    this.renderTree();
    this.renderList();
    this.renderDetail();
    void this.load();
  }

  private async load(): Promise<void> {
    this.list.replaceChildren(el('div', 'craft-empty', 'Đang tải...'));
    try {
      this.recipes = await this.host.client.call<MakeRecipe[]>('getMakeRecipes');
    } catch (e) {
      toast((e as Error).message, true);
    }
    if (this.disposed) return;
    this.renderTree();
    this.renderList();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    this.renderDetail();
  }

  accept(item: BagItem): boolean {
    const m = this.selected?.materials.find((x) => x.tid === item.tid && item.slotType === SlotType.BAG && item.stackNum >= x.num);
    if (!m) return false;
    this.chosen.set(m.slot, item.id);
    this.renderDetail();
    return true;
  }

  /** Weapon / off-hand types the chosen class can make (Flash makeTreeChange2); armour and jewellery stay whole. */
  private types(k: (typeof KINDS)[number]): readonly number[] {
    if (!this.classId || k.kind > 2) return k.types;
    const cls = `|${this.classId}|`;
    return k.types.filter((t) => this.recipes.some((r) => r.type === t && r.reqClass.includes(cls)));
  }

  private renderTree(): void {
    const rows: HTMLElement[] = [];
    for (const k of KINDS) {
      const isOpen = this.open.has(k.kind);
      const head = el('div', 'craft-node craft-kind');
      head.append(el('span', `craft-toggle${isOpen ? ' open' : ''}`), el('span', 'craft-ico-kind'), k.name);
      head.onclick = () => {
        if (isOpen) this.open.delete(k.kind);
        else this.open.add(k.kind);
        this.renderTree();
      };
      rows.push(head);
      if (!isOpen) continue;
      for (const t of this.types(k)) {
        const leaf = el('div', `craft-node craft-type${t === this.type ? ' selected' : ''}`);
        leaf.append(el('span', 'craft-ico-type'), itemTypeName(t));
        leaf.onclick = () => {
          this.type = t;
          this.renderTree();
          this.renderList();
        };
        rows.push(leaf);
      }
    }
    this.tree.replaceChildren(...rows);
  }

  private renderList(): void {
    if (this.type === null) return void this.list.replaceChildren();
    const cls = `|${this.classId}|`;
    const rows = this.recipes
      .filter((r) => r.type === this.type && (!this.classId || !r.reqClass || r.reqClass.includes(cls)))
      .sort((a, b) => a.reqLevel - b.reqLevel || a.tid - b.tid);
    this.list.replaceChildren(...rows.map((r) => {
      const row = el('div', `craft-row${r.tid === this.selected?.tid ? ' selected' : ''}`, r.name);
      row.title = `Cấp ${r.reqLevel}  ${r.name}`;
      row.onclick = () => this.select(r);
      return row;
    }));
  }

  private select(r: MakeRecipe): void {
    this.selected = r;
    this.chosen.clear();
    this.renderList();
    this.renderDetail();
  }

  /** Bag stacks that can fill a slot (enough units, not used by another slot), lowest colour first. */
  private candidates(slot: number): BagItem[] {
    const m = this.selected?.materials.find((x) => x.slot === slot);
    if (!m) return [];
    const used = new Set([...this.chosen.entries()].filter(([s]) => s !== slot).map(([, id]) => id));
    return this.host.items()
      .filter((i) => i.slotType === SlotType.BAG && i.tid === m.tid && i.stackNum >= m.num && !used.has(i.id))
      .sort((a, b) => a.color - b.color || a.sid - b.sid);
  }

  /** "Tự đặt ng.liệu": fills every empty slot with its first candidate. */
  private autofill(): void {
    for (const m of this.selected?.materials ?? []) {
      if (!this.chosen.get(m.slot)) this.chosen.set(m.slot, this.candidates(m.slot)[0]?.id ?? null);
    }
    this.renderDetail();
  }

  private cycle(slot: number): void {
    const cands = this.candidates(slot);
    const i = cands.findIndex((c) => c.id === this.chosen.get(slot));
    this.chosen.set(slot, cands[i + 1]?.id ?? null); // past the last candidate the slot is emptied again
    this.renderDetail();
  }

  private renderDetail(): void {
    const r = this.selected;
    const items = this.host.items();
    const byId = new Map(items.map((i) => [i.id, i]));
    // Drop choices the bag no longer backs (used up, moved, split below the requirement).
    for (const [slot, id] of this.chosen) {
      const m = r?.materials.find((x) => x.slot === slot);
      const it = id == null ? undefined : byId.get(id);
      if (!m || !it || it.tid !== m.tid || it.stackNum < m.num || it.slotType !== SlotType.BAG) this.chosen.set(slot, null);
    }
    this.product.replaceChildren(r
      ? forgeCell({ iconCode: r.iconCode, name: r.name, color: r.color, title: `${r.name}\nCấp ${r.reqLevel}` }, 'forge-cell craft-cell')
      : el('div', 'forge-cell craft-cell'));
    const need: HTMLElement[] = [];
    const put: HTMLElement[] = [];
    for (const slot of SLOTS) {
      const m = r?.materials.find((x) => x.slot === slot);
      if (!m) {
        need.push(el('div', 'forge-cell craft-cell'));
        put.push(el('div', 'forge-cell craft-cell'));
        continue;
      }
      const have = items.filter((i) => i.tid === m.tid && i.slotType === SlotType.BAG).reduce((n, i) => n + i.stackNum, 0);
      // Flash makeRequire: the material icon with the unit count only when more than one is needed.
      const req = forgeCell({ iconCode: m.iconCode, name: m.name, color: 0, count: m.num > 1 ? String(m.num) : undefined,
        lacking: have < m.num, title: `${m.name} x${m.num}\nTrong túi: ${have}` }, 'forge-cell craft-cell');
      if (m.iconCode === '0') req.appendChild(el('span', 'craft-cell-name', m.name));
      need.push(req);
      const it = byId.get(this.chosen.get(slot) ?? -1);
      const placed = it
        ? forgeCell({ iconCode: it.iconCode, name: m.name, color: it.color, count: String(it.stackNum),
          title: `${m.name} (cấp ${it.color + 1})\nNhấp để đổi nguyên liệu` }, 'forge-cell craft-cell')
        : el('div', 'forge-cell craft-cell');
      if (!it) placed.title = `Đặt ${m.name} x${m.num}\nNhấp để chọn từ túi`;
      placed.classList.add('craft-slot');
      placed.onclick = () => this.cycle(slot);
      put.push(placed);
    }
    this.need.replaceChildren(...need);
    this.put.replaceChildren(...put);
    this.auto.disabled = !r || this.busy;
    this.go.disabled = !r || this.busy || r.materials.some((m) => !this.chosen.get(m.slot));
    this.bar.classList.toggle('running', this.busy);
    this.barText.textContent = this.busy ? 'Đang chế tạo...' : '';
    if (r && this.refs(r)) void this.preview(r);
    else this.zeroRates();
  }

  /** Flash cleanMake: every rate box reads 0% until getMakeColor confirms the placed materials. */
  private zeroRates(): void {
    this.previewSeq++;
    for (const box of this.rates) box.textContent = '0%';
  }

  private refs(r: MakeRecipe): MaterialRefs | null {
    const refs: MaterialRefs = {};
    for (const m of r.materials) {
      const id = this.chosen.get(m.slot);
      if (!id) return null;
      refs[String(m.slot)] = { tempBagFlag: false, idx: id };
    }
    return refs;
  }

  private async preview(r: MakeRecipe): Promise<void> {
    const refs = this.refs(r);
    if (!refs) return;
    const seq = ++this.previewSeq;
    let reply: GetMakeColorReply;
    try {
      reply = await this.host.client.call<GetMakeColorReply>('getMakeColor', refs, r.tid);
    } catch {
      return;
    }
    if (this.disposed || seq !== this.previewSeq) return;
    if (!reply.canMake || !reply.colorPerList) {
      this.zeroRates();
      if (!this.busy) this.barText.textContent = reply.flag === 1 ? 'Nguyên liệu cấp 6 chỉ dùng cho trang bị cấp 61+' : 'Không thể chế tạo';
      return;
    }
    const p = reply.colorPerList;
    [p.makePer1, p.makePer2, p.makePer3, p.makePer4].forEach((v, i) => {
      this.rates[i].textContent = `${v}%`;
    });
  }

  private async make(r: MakeRecipe): Promise<void> {
    const refs = this.refs(r);
    if (!refs || this.busy) return;
    this.busy = true;
    this.renderDetail();
    await new Promise((resolve) => window.setTimeout(resolve, PROGRESS_MS));
    try {
      const reply = await this.host.client.call<NewMakeReply>('newMake', refs, r.tid);
      if (reply.flag) toast('Chế tạo thành công!');
      // A failure (bad materials, full bag, failed roll) was already announced by the server push.
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.renderDetail();
    }
  }
}

export const craftTab: ForgeTab = {
  id: 'craft', label: 'Trang bị', group: 'equip', build: (host, body) => new CraftView(host, body),
};
