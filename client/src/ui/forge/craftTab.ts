// Forge tab "Chế tạo" (legacy EquiptFuncPanel tab 0): recipe list (makable equipment from getMakeRecipes), three material
// slots filled from the bag (click a slot to cycle the candidate stacks, bag double-click fills the matching slot), the
// getMakeColor rates preview and newMake (awaited; Flash shows a 2 s progress bar first).

import type { BagItem, GetMakeColorReply, MakeRecipe, MaterialRefs, NewMakeReply } from '@mc/shared';
import { SlotType } from '@mc/shared';
import { NAME_COLORS } from '../itemCell';
import { toast } from '../screens';
import { el } from '../shopCell';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';

const PROGRESS_MS = 2000;
const BUCKETS = ['Lục', 'Lam', 'Tím', 'Cam'];

class CraftView implements ForgeTabView {
  private recipes: MakeRecipe[] = [];
  private selected: MakeRecipe | null = null;
  private chosen = new Map<number, number | null>(); // material slot -> bag item id
  private query = '';
  private mine = true;
  private busy = false;
  private disposed = false;
  private previewSeq = 0;
  private readonly list = el('div', 'forge-list');
  private readonly detail = el('div', 'forge-detail');

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    const filter = el('div', 'forge-filter');
    const search = el('input', 'forge-search');
    search.placeholder = 'Tìm trang bị...';
    search.oninput = () => {
      this.query = search.value.trim().toLowerCase();
      this.renderList();
    };
    const label = el('label', 'forge-check');
    const box = el('input', '');
    box.type = 'checkbox';
    box.checked = this.mine;
    box.onchange = () => {
      this.mine = box.checked;
      this.renderList();
    };
    label.append(box, ' Nghề của tôi');
    filter.append(search, label);
    body.append(filter, this.list, this.detail);
    this.detail.appendChild(el('div', 'forge-hint', 'Đang tải công thức...'));
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.recipes = await this.host.client.call<MakeRecipe[]>('getMakeRecipes');
    } catch (e) {
      toast((e as Error).message, true);
    }
    if (this.disposed) return;
    this.renderList();
    this.renderDetail();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    if (this.selected) this.renderDetail();
  }

  accept(item: BagItem): boolean {
    const r = this.selected;
    const m = r?.materials.find((x) => x.tid === item.tid && item.slotType === SlotType.BAG && item.stackNum >= x.num);
    if (!r || !m) return false;
    this.chosen.set(m.slot, item.id);
    this.renderDetail();
    return true;
  }

  private visible(): MakeRecipe[] {
    const cls = `|${this.host.player().classId}|`;
    return this.recipes.filter((r) => (!this.mine || !r.reqClass || r.reqClass.includes(cls))
      && (!this.query || r.name.toLowerCase().includes(this.query)));
  }

  private renderList(): void {
    const rows = this.visible();
    this.list.replaceChildren(...(rows.length === 0 ? [el('div', 'forge-hint', 'Không có công thức phù hợp.')] : rows.map((r) => {
      const row = el('div', 'forge-row', `Cấp ${r.reqLevel}  ${r.name}`);
      if (r.tid === this.selected?.tid) row.classList.add('selected');
      row.onclick = () => this.select(r);
      return row;
    })));
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

  /** Keeps valid choices, fills empty ones with the first candidate. */
  private autofill(r: MakeRecipe): void {
    const byId = new Map(this.host.items().map((i) => [i.id, i]));
    for (const m of r.materials) {
      const cur = this.chosen.get(m.slot);
      const it = cur == null ? undefined : byId.get(cur);
      if (it && it.tid === m.tid && it.stackNum >= m.num) continue;
      this.chosen.set(m.slot, this.candidates(m.slot)[0]?.id ?? null);
    }
  }

  private cycle(slot: number): void {
    const cands = this.candidates(slot);
    const cur = this.chosen.get(slot);
    const i = cands.findIndex((c) => c.id === cur);
    const nextItem = cands[(i + 1) % Math.max(1, cands.length)];
    if (nextItem) this.chosen.set(slot, nextItem.id);
    this.renderDetail();
  }

  private renderDetail(): void {
    const r = this.selected;
    if (!r) {
      this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn một trang bị ở danh sách để chế tạo.'));
      return;
    }
    this.autofill(r);
    const items = new Map(this.host.items().map((i) => [i.id, i]));
    const slots = el('div', 'forge-slots');
    for (const m of r.materials) {
      const it = items.get(this.chosen.get(m.slot) ?? -1);
      const have = this.host.items().filter((i) => i.tid === m.tid && i.slotType === SlotType.BAG).reduce((n, i) => n + i.stackNum, 0);
      const cell = forgeCell({
        iconCode: it?.iconCode ?? '0', name: m.name, color: it?.color ?? 0,
        count: `${it?.stackNum ?? have}/${m.num}`, lacking: !it,
        title: `${m.name} x${m.num}${it ? ` (cấp ${it.color + 1})` : ' (thiếu)'}\nNhấp để đổi nguyên liệu`,
      }, 'forge-cell forge-slot');
      if (!it) cell.classList.add('empty');
      cell.onclick = () => this.cycle(m.slot);
      const box = el('div', 'forge-slot-box');
      box.append(cell, el('div', 'forge-slot-name', m.name));
      slots.appendChild(box);
    }
    const rates = el('div', 'forge-rates', 'Đặt đủ nguyên liệu để xem tỷ lệ.');
    const go = el('button', 'shop-btn forge-go', this.busy ? 'Đang chế tạo...' : 'Chế tạo');
    go.disabled = this.busy || r.materials.some((m) => !this.chosen.get(m.slot));
    go.onclick = () => void this.make(r);
    this.detail.replaceChildren(el('div', 'forge-title', `${r.name}  (cấp ${r.reqLevel})`), slots, rates, go);
    void this.preview(r, rates);
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

  private async preview(r: MakeRecipe, out: HTMLElement): Promise<void> {
    const refs = this.refs(r);
    if (!refs) return;
    const seq = ++this.previewSeq;
    let reply: GetMakeColorReply;
    try {
      reply = await this.host.client.call<GetMakeColorReply>('getMakeColor', refs, r.tid);
    } catch {
      return;
    }
    if (this.disposed || seq !== this.previewSeq || !out.isConnected) return;
    if (!reply.canMake || !reply.colorPerList) {
      out.textContent = reply.flag === 1 ? 'Nguyên liệu cấp 6 chỉ dùng cho trang bị cấp 61 trở lên!' : 'Không thể chế tạo với nguyên liệu này.';
      return;
    }
    const per = [reply.colorPerList.makePer1, reply.colorPerList.makePer2, reply.colorPerList.makePer3, reply.colorPerList.makePer4];
    const total = per.reduce((a, b) => a + b, 0);
    const parts = per.map((p, i) => {
      const s = el('span', 'forge-rate', `${BUCKETS[i]} ${p}%`);
      s.style.color = NAME_COLORS[i + 2];
      return s;
    });
    const fail = Math.max(0, 100 - total);
    out.replaceChildren(...parts, el('span', 'forge-rate fail', `Thất bại ${fail}%`));
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

export const craftTab: ForgeTab = { id: 'craft', label: 'Chế tạo', build: (host, body) => new CraftView(host, body) };
