// Forge tabs "Đổi khóa" (petEquModBind -> surepetEquModBind) and "Tái thiết lập" (petEquModPre -> surePetEquModPre) for pet gear.
// The server spends 30000 silver and the material at the PREVIEW, so the roll is shown next to the old values with Đồng ý / Từ chối
// (decision 1 / -1). A preview left open is dropped (-1) when the piece changes or the tab closes.

import type {
  BagItem, PetEquBindPreview, PetEquPrePreview, PetEquipMaterialPlan, SurePetEquBindReply, SurePetEquPreReply,
} from '@mc/shared';
import { EQUIP_PROP_LABELS, PET_EQUIP_MOD_MONEY, PET_EQUIP_PRE_MIN_COLOR, isSpecialPetEquipPosition, petEquipBindPlan, petEquipColor, petEquipPrePlan } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import type { ForgeHost, ForgeTab } from './forgeTypes';
import { material, PetGearView } from './petGearTab';

interface Preview {
  equipId: number;
  lines: string[];
}

interface ModKind {
  verb: string;
  intro: string;
  plan(eq: BagItem): PetEquipMaterialPlan | null;
  /** Why the piece cannot use this tab, or null. */
  blocked(eq: BagItem): string | null;
  preview(host: ForgeHost, eq: BagItem, materialId: number): Promise<Preview | null>;
  sure(host: ForgeHost, decision: 1 | -1): Promise<string | null>;
}

const propName = (eq: BagItem, n: 1 | 2): string => EQUIP_PROP_LABELS[eq.lines?.[`mainProp${n}`] ?? 0] ?? `Dòng ${n}`;
const bindOf = (eq: BagItem, n: 1 | 2): number => eq.lines?.[`bindMainPropNum${n}`] ?? 0;
const unbound = (eq: BagItem): string | null => (eq.binded ? null : 'Chỉ trang bị pet đã khóa mới dùng được chức năng này.');
// Spec gear (56-57) needs x2 or x4 depending on the template; the client cannot see it, so the smaller count is the gate.
const specNote = (eq: BagItem): string => (isSpecialPetEquipPosition(eq.position) ? ' (trang bị đặc biệt: gấp 2 hoặc 4 lần)' : '');

const BIND: ModKind = {
  verb: 'Đổi khóa',
  intro: 'Đổi tỷ lệ % thuộc tính khóa của trang bị pet khóa. Kết quả chỉ áp dụng khi bạn đồng ý; nguyên liệu và bạc bị trừ ngay khi xem trước.',
  plan: (eq) => petEquipBindPlan(eq.reqLevel, isSpecialPetEquipPosition(eq.position), false),
  blocked: unbound,
  preview: async (host, eq, materialId) => {
    const r = await host.client.call<PetEquBindPreview>('petEquModBind', eq.id, materialId);
    if (!r.f) return null;
    return {
      equipId: eq.id,
      lines: [
        'Kết quả đổi thuộc tính khóa của trang bị pet:',
        `${propName(eq, 1)}: ${r.b1}%  ->  ${r.b11}%`,
        `${propName(eq, 2)}: ${r.b2}%  ->  ${r.b12}%`,
      ],
    };
  },
  sure: async (host, decision) => {
    const r = await host.client.call<SurePetEquBindReply>('surepetEquModBind', decision);
    return r.f === 'sure' ? `Đổi thành công thuộc tính khóa: ${r.b1}% / ${r.b2}%` : null;
  },
};

const PRE: ModKind = {
  verb: 'Tái thiết lập',
  intro: 'Tái thiết lập thuộc tính của trang bị pet khóa màu tím trở lên. Kết quả chỉ áp dụng khi bạn đồng ý; nguyên liệu và bạc bị trừ ngay khi xem trước.',
  plan: (eq) => petEquipPrePlan(petEquipColor(eq.color), isSpecialPetEquipPosition(eq.position), false),
  blocked: (eq) => unbound(eq) ?? (petEquipColor(eq.color) < PET_EQUIP_PRE_MIN_COLOR ? 'Chỉ có trang bị pet màu tím hoặc màu cam mới có thể tái thiết lập thuộc tính' : null),
  preview: async (host, eq, materialId) => {
    const r = await host.client.call<PetEquPrePreview>('petEquModPre', eq.id, materialId);
    if (!r.f) return null;
    const { oldIns, newIns } = r;
    return {
      equipId: eq.id,
      lines: [
        'Kết quả đổi thuộc tính trang bị pet:',
        `${propName(oldIns, 1)}: ${bindOf(oldIns, 1)}%  ->  ${bindOf(newIns, 1)}%`,
        `${propName(oldIns, 2)}: ${bindOf(oldIns, 2)}%  ->  ${bindOf(newIns, 2)}%`,
      ],
    };
  },
  sure: async (host, decision) => {
    const r = await host.client.call<SurePetEquPreReply>('surePetEquModPre', decision);
    return r.f === 'sure' ? 'Tái thiết lập thuộc tính thành công!' : null;
  },
};

class ModView extends PetGearView {
  private preview: Preview | null = null;

  constructor(host: ForgeHost, body: HTMLElement, private readonly kind: ModKind) {
    super(host, body);
    this.start();
  }

  dispose(): void {
    this.drop();
    super.dispose();
  }

  /** Cancels a pending server preview (fire and forget: the roll is already paid). */
  private drop(): void {
    if (!this.preview) return;
    this.preview = null;
    void this.kind.sure(this.host, -1).catch(() => undefined);
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (this.preview && this.preview.equipId !== eq?.id) this.drop();
    if (!eq) return this.hint(`${this.kind.intro}\nChọn trang bị pet (nhấp vào trang bị hoặc nhấp đúp từ túi).`);
    const plan = this.kind.plan(eq);
    const blocked = this.kind.blocked(eq);
    if (!plan) return this.detail.replaceChildren(this.title(eq), el('div', 'forge-hint', 'Trang bị này không dùng được chức năng này.'));
    this.slots.set([material(plan.itemId, plan.num)]);
    const go = el('button', 'shop-btn forge-go', `${this.kind.verb} (xem trước)`);
    go.disabled = this.busy || !this.slots.ready() || blocked !== null || this.preview !== null;
    go.onclick = () => void this.act(() => this.run(eq));
    const kids: HTMLElement[] = [
      this.title(eq), this.slots.root,
      el('div', 'forge-rates', `Cần ${plan.num} nguyên liệu${specNote(eq)} và ${PET_EQUIP_MOD_MONEY} bạc.`),
    ];
    if (blocked) kids.push(el('div', 'forge-hint', blocked));
    kids.push(go);
    if (this.preview) kids.push(this.previewBox(this.preview));
    this.detail.replaceChildren(...kids);
  }

  private previewBox(p: Preview): HTMLElement {
    const box = el('div', 'forge-preview');
    for (const l of p.lines) box.appendChild(el('div', '', l));
    const yes = el('button', 'shop-btn forge-go', 'Đồng ý');
    const no = el('button', 'shop-btn forge-go', 'Từ chối');
    yes.disabled = no.disabled = this.busy;
    yes.onclick = () => void this.act(() => this.settle(1));
    no.onclick = () => void this.act(() => this.settle(-1));
    const row = el('div', 'forge-buttons');
    row.append(yes, no);
    box.appendChild(row);
    return box;
  }

  private async run(eq: BagItem): Promise<void> {
    const ids = this.slots.ids();
    if (!ids) return;
    this.preview = await this.kind.preview(this.host, eq, ids[0]);
  }

  private async settle(decision: 1 | -1): Promise<void> {
    this.preview = null;
    const done = await this.kind.sure(this.host, decision);
    if (decision === 1) toast(done ?? 'Không có kết quả nào đang chờ.', done === null);
  }
}

export const petBindTab: ForgeTab = { id: 'petBind', label: 'Đổi khóa', build: (host, body) => new ModView(host, body, BIND) };
export const petPreTab: ForgeTab = { id: 'petPre', label: 'Tái thiết lập', build: (host, body) => new ModView(host, body, PRE) };
