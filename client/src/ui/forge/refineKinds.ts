// The five refinements of the "Tinh luyện" tab: element, bind lines, soul, prefix (quality) and maker signature. Each kind says
// which material slots it needs and builds its buttons; the two-step ones (element, bind, full soul, prefix) hand a preview to
// the tab, which shows it with Đồng ý / Từ chối (sureChange*(1|0)). Flash reply keys are read as documented in the contract.

import type {
  BagItem, ChangeBindReply, ChangeElementReply, ChangeNameResult, ChangePrefixReply, ChangeSoulResult, SureBindReply, SureElementReply,
  SurePrefixReply, SureSoulReply, UpgradeInfo, UpgradeMaterial,
} from '@mc/shared';
import { ELEMENT_NAMES, EQUIP_PROP_LABELS, PREFIX_NAMES, REFINE_COST } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import type { ForgeHost } from './forgeTypes';
import type { MaterialSlots } from './materialSlots';

export interface Preview {
  lines: string[];
  yes: () => Promise<void>;
  no: () => Promise<void>;
}

export interface KindCtx {
  host: ForgeHost;
  eq: BagItem;
  info: UpgradeInfo;
  slots: MaterialSlots;
  busy: boolean;
  /** Runs an RPC flow with the busy flag, error toast and a reload afterwards. */
  run(fn: () => Promise<Preview | void>): void;
}

export interface RefineKind {
  id: string;
  label: string;
  needs(info: UpgradeInfo): UpgradeMaterial[];
  cost(info: UpgradeInfo): number;
  buttons(ctx: KindCtx): HTMLElement[];
}

const slotOf = (info: UpgradeInfo, n: number): UpgradeMaterial[] => info.refineMaterials.filter((m) => m.slot === n);
const propName = (p: number): string => EQUIP_PROP_LABELS[p] ?? `#${p}`;
const colorOfQuality = (q: number): number => Math.ceil(q / 5);

function button(label: string, ctx: KindCtx, onClick: () => void, extraOff = false): HTMLButtonElement {
  const b = el('button', 'shop-btn forge-go', label);
  b.disabled = ctx.busy || extraOff || !ctx.slots.ready();
  b.onclick = onClick;
  return b;
}

const mat = (ctx: KindCtx, slot: number): number => ctx.slots.id(slot) ?? 0;

const elementKind: RefineKind = {
  id: 'element', label: 'Nguyên tố',
  needs: (i) => slotOf(i, 1), cost: () => REFINE_COST.element,
  buttons: (ctx) => [button('Đổi nguyên tố', ctx, () => ctx.run(async () => {
    const r = await ctx.host.client.call<ChangeElementReply>('changeElement', ctx.eq.id, mat(ctx, 1), false);
    if (!r.f) return;
    return {
      lines: [`Nguyên tố: ${ELEMENT_NAMES[r.b] || 'Không'}  ->  ${ELEMENT_NAMES[r.e]}`, 'Đã trừ bạc và nguyên liệu; từ chối sẽ không được hoàn lại.'],
      yes: async () => {
        const s = await ctx.host.client.call<SureElementReply>('sureChangeElement', 1);
        if (s.f === 'true') toast(`Thay đổi nguyên tố thành công thành: ${ELEMENT_NAMES[s.e ?? 0]}`);
      },
      no: async () => void (await ctx.host.client.call<SureElementReply>('sureChangeElement', 0)),
    };
  }))],
};

const bindKind: RefineKind = {
  id: 'bind', label: 'Khóa tính',
  needs: (i) => slotOf(i, 2), cost: () => REFINE_COST.bind,
  buttons: (ctx) => [button('Đổi thuộc tính khóa', ctx, () => ctx.run(async () => {
    const r = await ctx.host.client.call<ChangeBindReply>('changeBind', ctx.eq.id, mat(ctx, 2), false);
    if (!r.f) return;
    const line = (p: number, a: number, b: number): string => (p > 0 ? `${propName(p)}: +${a}  ->  +${b}` : '');
    return {
      lines: [line(r.mainProp1, r.b1, r.b11), line(r.mainProp2, r.b2, r.b12)].filter(Boolean),
      yes: async () => {
        const s = await ctx.host.client.call<SureBindReply>('sureChangeBind', 1);
        if (s.f === 'sure') toast(`Đổi thành công thuộc tính khóa: +${s.b1} / +${s.b2}`);
      },
      no: async () => void (await ctx.host.client.call<SureBindReply>('sureChangeBind', 0)),
    };
  }))],
};

const soulKind: RefineKind = {
  id: 'soul', label: 'Linh hồn',
  needs: (i) => [{ slot: 1, tid: i.soul.tid, name: i.soul.name, num: 1 }], cost: () => REFINE_COST.soulPerMode,
  buttons: (ctx) => {
    const cur = ctx.info.soul.activeProp > 0 ? `${propName(ctx.info.soul.activeProp)} +${ctx.info.soul.activePropNum}` : 'chưa có';
    const call = (mode: number) => ctx.run(async () => {
      const r = await ctx.host.client.call<ChangeSoulResult>('changeSoul', ctx.eq.id, mat(ctx, 1), mode);
      if (!r.f) return;
      if (r.type === '2') {
        toast(`Đổi linh hồn thành công thành: ${propName(r.ap)} +${r.apn}`);
        return;
      }
      return {
        lines: [`Linh hồn hiện tại: ${cur}`, `Linh hồn mới: ${propName(r.apro)} +${r.apropnum}`],
        yes: async () => {
          const s = await ctx.host.client.call<SureSoulReply>('sureChangeSoul', 1);
          if (s.f === 'true') toast(`Đổi linh hồn thành công thành: ${propName(s.activeProp ?? 0)} +${s.activePropNum}`);
        },
        no: async () => void (await ctx.host.client.call<SureSoulReply>('sureChangeSoul', 0)),
      };
    });
    return [
      el('div', 'forge-hint', `Linh hồn hiện tại: ${cur}. Đổi hết: 50000 bạc + 1 đá; đổi 1 phần: 100000 bạc + 2 đá (giữ loại).`),
      button('Đổi hết', ctx, () => call(1)),
      button('Đổi 1 phần', ctx, () => call(2), ctx.info.soul.activeProp <= 0),
    ];
  },
};

const prefixKind: RefineKind = {
  id: 'prefix', label: 'Phẩm chất',
  needs: (i) => i.refineMaterials, cost: (i) => i.prefixCost,
  buttons: (ctx) => [button(`Xem trước (${ctx.info.prefixCost} bạc khi đồng ý)`, ctx, () => ctx.run(async () => {
    const req = {
      e: ctx.eq.id,
      i1: { idx: mat(ctx, 1), flag: false }, i2: { idx: mat(ctx, 2), flag: false }, i3: { idx: mat(ctx, 3), flag: false },
    };
    const r = await ctx.host.client.call<ChangePrefixReply>('changePrefix', req);
    if (!r.f) return;
    const view = (i: BagItem): string => `${PREFIX_NAMES[i.prefix ?? 0] || '-'} (phẩm ${colorOfQuality(i.quality ?? 0)})  ${ELEMENT_NAMES[i.element ?? 0] || 'Không'}  *${i.star ?? 0}`;
    return {
      lines: [`Hiện tại: ${view(r.oldEquIns)}`, `Sau khi đổi: ${view(r.equIns)}`, 'Trang bị sẽ bị khóa; các dòng thuộc tính được tung lại.'],
      yes: async () => {
        const s = await ctx.host.client.call<SurePrefixReply>('sureChangePrefix', 1);
        if (s.f) toast('Thay đổi chất lượng thành công!');
      },
      no: async () => void (await ctx.host.client.call<SurePrefixReply>('sureChangePrefix', 0)),
    };
  }))],
};

const nameKind: RefineKind = {
  id: 'name', label: 'Chữ ký',
  needs: (i) => slotOf(i, 3), cost: () => REFINE_COST.name,
  buttons: (ctx) => [
    el('div', 'forge-hint', 'Cần trang bị khóa phẩm tím trở lên; trừ bạc không khóa.'),
    button('Đổi chữ ký', ctx, () => ctx.run(async () => {
      const r = await ctx.host.client.call<ChangeNameResult>('changeName', ctx.eq.id, mat(ctx, 3), false);
      if (r.f) toast('Đổi chữ ký thành công!');
    }), !ctx.eq.binded),
  ],
};

export const REFINE_KINDS: readonly RefineKind[] = [elementKind, bindKind, soulKind, prefixKind, nameKind];
