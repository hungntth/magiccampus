// "Tiến Hóa" tab of the Tiến hóa window: pick an unevolved pet of an evolvable creature, see the before / after creature cards,
// the handbook gate and evolve with toPetEnvolution (confirm first). The book link opens the Sách Tiến Hóa at that entry.

import { petHandbookByCreature } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { Runner, button, buildFrame, lines, showResult } from '../petfunc/tabKit';
import { petSeatEl } from '../petfunc/seats';
import { creatureCard } from './creatureCard';
import { entryState, evolvablePets, evolveGate } from './petEvoRules';
import { EVO_TEXT, GUIDES } from './petEvoText';
import type { PetEvoTab } from './petEvoTypes';

export const evolveTab: PetEvoTab = {
  id: 'evolve',
  label: 'Tiến Hóa',
  build(host, body) {
    const f = buildFrame(body, GUIDES[0]);
    const run = new Runner();
    let petId: number | null = host.initialPet()?.id ?? null;

    const draw = (): void => {
      const candidates = evolvablePets(host.pets());
      if (!candidates.some((p) => p.id === petId)) petId = null;
      const pet = candidates.find((p) => p.id === petId);
      const def = pet ? petHandbookByCreature(pet.tid) : undefined;
      f.seats.replaceChildren(petSeatEl({
        body, label: 'Đặt pet vào', pets: host.pets(), get: () => petId, set: (id) => { petId = id; f.result.replaceChildren(); },
        candidates: () => candidates, changed: draw,
      }));
      if (def) f.seats.append(creatureCard(EVO_TEXT.before, def.creature), el('div', 'pe-arrow', '→'), creatureCard(EVO_TEXT.after, def.evolved, def.creature));
      const gate = pet && def ? evolveGate(pet, def, host.player().activePetObject, host.player().level) : null;
      const state = def ? entryState(host.player().activePetObject, def) : null;
      lines(f.info, !pet || !def || !state
        ? [candidates.length === 0 ? EVO_TEXT.noEvoPet : EVO_TEXT.noPet]
        : [
          [`${EVO_TEXT.book}: ${def.name} ${state.activedNum}/${def.activeNum} ${state.actived ? '√' : 'X'}`, state.actived ? 'ok' : 'bad'],
          ...(gate && !gate.ok ? [[gate.text, 'warn'] as [string, 'warn']] : []),
        ]);
      f.buttons.replaceChildren(
        button(EVO_TEXT.title, () => confirmEvolve(), !!gate?.ok && !run.pending),
        button(EVO_TEXT.book, () => host.actions.openBook(def?.id), true, false),
      );
    };

    function confirmEvolve(): void {
      const pet = host.pets().find((p) => p.id === petId);
      if (!pet) return void toast(EVO_TEXT.needPetFirst);
      askConfirm(EVO_TEXT.confirmEvolve, () => void evolve(pet.id));
    }

    async function evolve(id: number): Promise<void> {
      await run.run(async () => {
        const r = await host.actions.evolve(id);
        if (!r) return;
        const pet = host.pets().find((p) => p.id === id);
        if (pet) {
          pet.tid = r.tid;
          pet.envoInfo = r.envo;
        }
        toast(EVO_TEXT.evolveOk);
        showResult(f, EVO_TEXT.evolveOk, [el('div', 'pf-line ok', 'Vào bảng [Vũ Hóa] để tăng tư chất tiến hóa.')]);
        await host.actions.reloadPets();
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
