// "Nguyên Tố" tab of the Luyện pet window: elementPet(pet, element 1..6). Costs round(BASIC_GET_MONEY[level] x 0.1) silver
// (the selected silver kind first); the pet's current element cannot be chosen again.

import { el } from '../petPanelTabs';
import { ELEMENT_NAMES_LIST, elementCostOf, elementName } from './petFuncRules';
import { FUNC_TEXT, GUIDE } from './petFuncText';
import type { PetFuncTab } from './petFuncTypes';
import { petSeatEl } from './seats';
import { Runner, buildFrame, lines, showResult } from './tabKit';

export const elementTab: PetFuncTab = {
  id: 'element',
  label: 'Nguyên Tố',
  build(host, body) {
    const f = buildFrame(body, GUIDE.element);
    const run = new Runner();
    let petId: number | null = host.initialPet()?.id ?? null;

    const draw = (): void => {
      if (!host.pets().some((p) => p.id === petId)) petId = null;
      const pet = host.pets().find((p) => p.id === petId);
      f.seats.replaceChildren(petSeatEl({
        body, label: 'Đặt pet vào', pets: host.pets(), get: () => petId, set: (id) => { petId = id; f.result.replaceChildren(); }, candidates: () => host.pets(), changed: draw,
      }));
      lines(f.info, pet
        ? [`Nguyên Tố hiện tại: ${pet.element > 0 ? elementName(pet.element) : 'Vô'}. Chi phí đổi: ${elementCostOf(pet)} bạc.`, FUNC_TEXT.pickElement]
        : [FUNC_TEXT.needPetItem]);
      const bar = el('div', 'pf-elements');
      for (const n of ELEMENT_NAMES_LIST) {
        const b = el('button', `pet-btn${pet?.element === n ? ' primary' : ''}`, elementName(n));
        b.disabled = !pet || pet.element === n || run.pending;
        b.onclick = () => void change(n);
        bar.appendChild(b);
      }
      f.buttons.replaceChildren(bar);
    };

    async function change(element: number): Promise<void> {
      const pet = host.pets().find((p) => p.id === petId);
      if (!pet) return;
      await run.run(async () => {
        const r = await host.actions.element(pet.id, element);
        if (r) showResult(f, 'Kết quả đổi nguyên tố:', [el('div', 'pf-line ok', `${pet.petName} đã đổi sang Nguyên Tố ${elementName(r.element ?? element)}.`)]);
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
