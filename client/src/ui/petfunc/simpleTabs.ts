// Single pet + single item tabs of the Luyện pet window: Tẩy Luyện (petXsd), Phục Sinh (petPzXsd) and Tẩy Điểm (petXd).
// They share one factory: a pet seat, an auto-filled item seat, rate / state lines, one action and a before -> after result box.

import { petGrowBandMax, type BagItem, type PetGrowthReply, type PetView } from '@mc/shared';
import { toast } from '../screens';
import { APT_LABEL, XSD_ADVANCED_MIN_COLOR, aptKeyOfType, aptBase, itemsByProp, petColor, TRAIN_PROP } from './petFuncRules';
import { FUNC_TEXT, GUIDE } from './petFuncText';
import { itemSeatEl, petSeatEl } from './seats';
import { Runner, button, buildFrame, changeRow, lines, showResult, type Tone } from './tabKit';
import { el } from '../petPanelTabs';
import type { PetFuncHost, PetFuncTab, PetFuncTabId } from './petFuncTypes';

interface SimpleDef {
  id: PetFuncTabId;
  label: string;
  guide: string;
  itemLabel: string;
  prop: number;
  action: string;
  resultTitle: string;
  /** Refusal reason for this pet (null = fine); also shown as a warning line. */
  blocker(pet: PetView): string | null;
  info(pet: PetView | undefined, item: BagItem | undefined): (string | [string, Tone])[];
  call(host: PetFuncHost, pet: PetView, item: BagItem): Promise<PetGrowthReply | null>;
  result(reply: PetGrowthReply, pet: PetView, item: BagItem): HTMLElement[];
}

function simpleTab(def: SimpleDef): PetFuncTab {
  return {
    id: def.id,
    label: def.label,
    build(host, body) {
      const f = buildFrame(body, def.guide);
      const run = new Runner();
      let petId: number | null = host.initialPet()?.id ?? null;
      let itemId: number | null = null;
      const draw = (): void => {
        if (!host.pets().some((p) => p.id === petId)) petId = null;
        const pet = host.pets().find((p) => p.id === petId);
        const stacks = itemsByProp(host.items(), def.prop);
        f.seats.replaceChildren(
          petSeatEl({ body, label: 'Đặt pet vào', pets: host.pets(), get: () => petId, set: (id) => { petId = id; f.result.replaceChildren(); }, candidates: () => host.pets(), changed: draw }),
          itemSeatEl({ body, label: def.itemLabel, stacks, get: () => itemId, set: (id) => { itemId = id; }, auto: true, changed: draw }),
        );
        const item = stacks.find((i) => i.id === itemId);
        const why = pet ? def.blocker(pet) : null;
        lines(f.info, [...def.info(pet, item), ...(why ? [[why, 'warn'] as [string, Tone]] : [])]);
        const act = button(def.action, () => void go(), !!pet && !!item && !why && !run.pending);
        f.buttons.replaceChildren(act);
      };
      const go = async (): Promise<void> => {
        const pet = host.pets().find((p) => p.id === petId);
        const item = host.items().find((i) => i.id === itemId);
        if (!pet || !item) return void toast(FUNC_TEXT.needPetItem);
        await run.run(async () => {
          const reply = await def.call(host, pet, item);
          if (reply) showResult(f, def.resultTitle, def.result(reply, pet, item));
        }, draw);
      };
      draw();
      return { refresh: draw, dispose: () => f.root.remove() };
    },
  };
}

const needBound = (pet: PetView): string | null => (pet.binded ? null : 'Pet phải là pet đã khóa');

export const refineTab = simpleTab({
  id: 'refine', label: 'Tẩy Luyện', guide: GUIDE.refine, itemLabel: 'Tẩy Tủy Đan', prop: TRAIN_PROP.xsd, action: 'Tẩy luyện',
  resultTitle: FUNC_TEXT.refineResult,
  blocker: needBound,
  info(pet, item) {
    const key = item ? aptKeyOfType(item.tplPropNum ?? 0) : undefined;
    if (!pet) return [FUNC_TEXT.needPetItem];
    const out: (string | [string, Tone])[] = [`Tư chất cơ bản: ${(['strength', 'agility', 'stamina', 'intelligence', 'energy'] as const).map((k) => `${APT_LABEL[k]} ${aptBase(pet, k)}`).join(' | ')}`];
    if (item && key) out.push(`${item.name}: tẩy tư chất ${APT_LABEL[key]}${item.color >= XSD_ADVANCED_MIN_COLOR ? ' (cao cấp: chỉ tăng)' : ' (kết quả thấp hơn thì giữ nguyên)'}. Xác suất thành công: 100%`);
    return out;
  },
  call: (host, pet, item) => host.actions.xsd(pet.id, item.id),
  result(r) {
    const key = aptKeyOfType(r.type ?? 0);
    const before = r.before ?? 0;
    const after = r.after ?? 0;
    const rows = [changeRow(`Tư chất ${key ? APT_LABEL[key] : ''}`, String(before), String(after), after > before)];
    if (!(after > before)) rows.push(el('div', 'pf-line warn', 'Kết quả không cao hơn, giữ nguyên tư chất cũ.'));
    return rows;
  },
});

export const rebirthTab = simpleTab({
  id: 'rebirth', label: 'Phục Sinh', guide: GUIDE.rebirth, itemLabel: 'Phẩm Chất Hồi Đơn', prop: TRAIN_PROP.rebirth, action: 'Phục sinh',
  resultTitle: FUNC_TEXT.rebirthResult,
  blocker: (pet) => (petColor(pet) < 1 ? 'Chỉ pet từ màu lục trở lên mới được phục sinh' : needBound(pet)),
  info: (pet) => (pet
    ? [FUNC_TEXT.growNow(pet.growRate), `Tối đa trong màu hiện tại: ${petGrowBandMax(pet.growRate)}. Kết quả thấp hơn thì giữ nguyên.`]
    : [FUNC_TEXT.needPetItem]),
  call: (host, pet, item) => host.actions.pzXsd(pet.id, item.id),
  result(r) {
    const before = r.before ?? 0;
    const after = r.after ?? 0;
    const rows = [changeRow('Phẩm chất', before.toFixed(2), after.toFixed(2), after > before)];
    if (!(after > before)) rows.push(el('div', 'pf-line warn', 'Kết quả không cao hơn, giữ nguyên phẩm chất cũ.'));
    return rows;
  },
});

export const pointTab = simpleTab({
  id: 'point', label: 'Tẩy Điểm', guide: GUIDE.point, itemLabel: 'Quy Nguyên Đơn', prop: TRAIN_PROP.point, action: 'Tẩy điểm',
  resultTitle: 'Kết quả Tẩy Điểm:',
  blocker: (pet) => (pet.divine ? needBound(pet) : FUNC_TEXT.pointDivine),
  info: (pet) => (pet
    ? [`Lực: ${pet.property.finalStrength}  Xảo: ${pet.property.finalAgility}  Nhẫn: ${pet.property.finalStamina}  Trí: ${pet.property.finalIntelligence}  Thần: ${pet.property.finalEnergy}  Điểm: ${pet.attLastPoint}`]
    : [FUNC_TEXT.needPetItem]),
  call: (host, pet, item) => host.actions.xd(pet.id, item.id),
  result: (r) => [el('div', 'pf-line ok', `${FUNC_TEXT.pointOk} Điểm chưa cộng: ${r.num ?? ''}`)],
});
