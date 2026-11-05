// "Ảo Hóa" tab of the Luyện pet window: petEat(main, sub, luck stone, count, aptType) rolls a pending illusion value; the
// result box then offers "Ứng dụng" (ensurePetEat) or "Bỏ qua". Rate line = petEatBaseRate / petEatRate from @mc/shared.

import {
  PET_EAT_LUCK_RATE, PET_EAT_MAX_LUCK, PET_EAT_MIN_COLOR, PET_EAT_ORANGE_COLOR, PET_APTITUDE_KEYS, petEatBaseRate, petEatRate,
  type PetGrowthReply, type PetView,
} from '@mc/shared';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { APT_LABEL, TRAIN_PROP, aptBase, aptEx, aptKeyOfType, fmtRate, itemsByProp, petBusy, petColor } from './petFuncRules';
import { FUNC_TEXT, GUIDE } from './petFuncText';
import type { PetFuncHost, PetFuncTab } from './petFuncTypes';
import { itemSeatEl, petSeatEl } from './seats';
import { Runner, button, buildFrame, changeRow, lines, showResult, type Frame } from './tabKit';

interface Hint { petId: number; aptType: number; value: number; old: number; }

const ratePet = (p: PetView): { growRate: number; divine: boolean; classId: number } => ({ growRate: p.growRate, divine: !!p.divine, classId: p.classId });

export const eatTab: PetFuncTab = {
  id: 'eat',
  label: 'Ảo Hóa',
  build(host, body) {
    const f = buildFrame(body, GUIDE.eat);
    const run = new Runner();
    let mainId: number | null = host.initialPet()?.id ?? null;
    let subId: number | null = null;
    let luckId: number | null = null;
    let luckNum = 0;
    let aptType = 1;
    let hint: Hint | null = null;

    const follow = (): number => host.player().showPetId;

    const draw = (): void => {
      const pets = host.pets();
      if (!pets.some((p) => p.id === mainId)) mainId = null;
      if (!pets.some((p) => p.id === subId)) subId = null;
      const main = pets.find((p) => p.id === mainId);
      const sub = pets.find((p) => p.id === subId);
      const minColor = sub && petColor(sub) >= PET_EAT_ORANGE_COLOR ? PET_EAT_ORANGE_COLOR : PET_EAT_MIN_COLOR; // orange sub: orange stones only
      const stones = itemsByProp(host.items(), TRAIN_PROP.luck).filter((i) => i.color >= minColor);
      const stone = stones.find((i) => i.id === luckId);
      if (!stone) luckId = null;
      luckNum = stone ? Math.min(luckNum, stone.stackNum, PET_EAT_MAX_LUCK) : 0;
      f.seats.replaceChildren(
        petSeatEl({ body, label: 'Pet chính', pets, get: () => mainId, set: (id) => { mainId = id; f.result.replaceChildren(); }, changed: draw,
          candidates: () => pets.filter((p) => p.id !== subId && p.binded === 1 && petColor(p) >= PET_EAT_MIN_COLOR) }),
        petSeatEl({ body, label: 'Pet phụ', pets, get: () => subId, set: (id) => { subId = id; }, changed: draw,
          candidates: () => pets.filter((p) => p.id !== mainId && petColor(p) >= PET_EAT_MIN_COLOR && !petBusy(p, follow())) }),
        itemSeatEl({ body, label: 'Đá May Mắn', stacks: stones, get: () => luckId, set: (id) => { luckId = id; luckNum = id === null ? 0 : Math.max(luckNum, 1); }, changed: draw }),
        stepper(luckNum, stone ? Math.min(stone.stackNum, PET_EAT_MAX_LUCK) : 0, (n) => { luckNum = n; draw(); }),
      );
      f.seats.appendChild(aptPicker(main, aptType, (t) => { aptType = t; draw(); }));
      const base = main && sub ? petEatBaseRate(ratePet(main), ratePet(sub)) : 0;
      const rate = petEatRate(base, luckNum);
      lines(f.info, main && sub
        ? [`Xác suất thành công: ${fmtRate(rate.rate)} (cơ bản ${fmtRate(base)}, Đá May Mắn +${rate.luck * PET_EAT_LUCK_RATE}%)`]
        : [FUNC_TEXT.needPetItem]);
      f.buttons.replaceChildren(button('Ảo hóa', () => void eat(), !!main && !!sub && !run.pending));
    };

    async function eat(): Promise<void> {
      const main = host.pets().find((p) => p.id === mainId);
      if (!main || subId === null) return void toast(FUNC_TEXT.needPetItem);
      const key = aptKeyOfType(aptType);
      if (!key) return;
      const old = aptEx(main, key);
      await run.run(async () => {
        const r = await host.actions.eat(main.id, subId!, luckNum > 0 ? luckId : null, luckNum, aptType);
        if (!r) return;
        if (r.msg && !r.costPet) toast(r.msg, true);
        hint = r.isHint && r.value !== undefined ? { petId: main.id, aptType, value: r.value, old } : null;
        renderResult(f, host, r, hint, apply, skip);
      }, draw);
    }

    function skip(): void {
      hint = null;
      f.result.replaceChildren();
    }

    function apply(): void {
      const h = hint;
      if (!h) return;
      void run.run(async () => {
        const r = await host.actions.ensureEat(h.petId);
        hint = null;
        if (r) showResult(f, FUNC_TEXT.eatResult, [el('div', `pf-line ${r.succ ? 'ok' : 'bad'}`, r.msg ?? '')]);
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};

function renderResult(f: Frame, host: PetFuncHost, r: PetGrowthReply, hint: Hint | null, apply: () => void, skip: () => void): void {
  const rows: HTMLElement[] = [el('div', `pf-line ${r.isHint ? 'ok' : 'warn'}`, r.msg ?? '')];
  const pet = hint ? host.pets().find((p) => p.id === hint.petId) : undefined;
  const key = hint ? aptKeyOfType(hint.aptType) : undefined;
  if (hint && pet && key) {
    rows.push(changeRow(`Tư chất ${APT_LABEL[key]}`, `${aptBase(pet, key)}+${hint.old}`, `${aptBase(pet, key)}+${hint.value}`, hint.value > hint.old));
    const bar = el('div', 'pf-buttons');
    bar.append(button(FUNC_TEXT.apply, apply), button(FUNC_TEXT.skip, skip, true, false));
    rows.push(bar);
  }
  showResult(f, FUNC_TEXT.eatResult, rows);
}

function stepper(value: number, max: number, set: (n: number) => void): HTMLElement {
  const box = el('div', 'pf-stepper');
  const minus = el('button', 'pet-pm', '-');
  const plus = el('button', 'pet-pm', '+');
  minus.disabled = value <= 0;
  plus.disabled = value >= max;
  minus.onclick = () => set(value - 1);
  plus.onclick = () => set(value + 1);
  box.append(minus, el('span', 'pf-stepper-n', String(value)), plus);
  return box;
}

function aptPicker(main: PetView | undefined, selected: number, pick: (type: number) => void): HTMLElement {
  const box = el('div', 'pf-apts');
  PET_APTITUDE_KEYS.forEach((k, i) => {
    const b = el('button', `pet-tab${selected === i + 1 ? ' on' : ''}`, main ? `${APT_LABEL[k]} ${aptBase(main, k)}+${aptEx(main, k)}` : APT_LABEL[k]);
    b.onclick = () => pick(i + 1);
    box.appendChild(b);
  });
  return box;
}
