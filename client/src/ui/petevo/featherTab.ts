// "Vũ Hóa" tab: round / stage of the picked evolved pet, the aptitude table (base / Vũ Hóa / next level), the try cost, the Bùa Cầu
// Nguyện protect toggle and the buttons. "Tăng 10 lần" loops 10 single toPetFeather calls like Flash (stops at the cap, on a
// refused try or when the player ends it); "Tăng 1 điểm" is the gold jump (toPetFeatherNextStep) behind a confirm.

import {
  FEATHER_PROTECT_ITEM, FEATHER_SUCCESS, featherAtCap, featherNpCost, featherProtectNeed, normalizeFeather, PET_ENVOLUTION_FEATHER_COST_GOLD,
  type PetEvolutionInfo, type PetFeatherReply, type PetView,
} from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { APT_LABEL, itemsByTid, stackTotal } from '../petfunc/petFuncRules';
import { petSeatEl } from '../petfunc/seats';
import { Runner, button, buildFrame, lines, type Tone } from '../petfunc/tabKit';
import { canFeather, evolvedPets, featherMessage, featherPlan, featherRows } from './petEvoRules';
import { confirmJump, EVO_TEXT, FEATHER_FALL_HINT, GUIDES, protectCost } from './petEvoText';
import type { PetEvoTab } from './petEvoTypes';

const TEN = 10;
const LOG_MAX = 12;

export const featherTab: PetEvoTab = {
  id: 'feather',
  label: 'Vũ Hóa',
  build(host, body) {
    const f = buildFrame(body, GUIDES[1]);
    const run = new Runner();
    let petId: number | null = host.initialPet()?.id ?? null;
    let protect = false;
    let looping = false;
    let stopLoop = false;
    const log: [string, Tone][] = [];

    const np = (): number => host.player().currencies?.npPnt ?? 0;
    const charms = (): number => stackTotal(itemsByTid(host.items(), FEATHER_PROTECT_ITEM));
    const current = (): PetView | undefined => host.pets().find((p) => p.id === petId);
    const infoOf = (pet: PetView): PetEvolutionInfo => normalizeFeather(pet.envoInfo ?? { envo: false, round: 0, stage: 0 });

    const draw = (): void => {
      const list = evolvedPets(host.pets());
      if (!list.some((p) => p.id === petId)) petId = list.find((p) => canFeather(p))?.id ?? null;
      const pet = current();
      f.seats.replaceChildren(petSeatEl({
        body, label: 'Đặt pet vào', pets: host.pets(), get: () => petId, set: (id) => { petId = id; log.length = 0; }, candidates: () => list, changed: draw,
      }));
      if (!pet) {
        lines(f.info, [list.length === 0 ? EVO_TEXT.noEvoPet : EVO_TEXT.noPet]);
        f.buttons.replaceChildren();
        renderLog();
        return;
      }
      const info = infoOf(pet);
      const cap = featherAtCap(info);
      const plan = featherPlan(info, np(), charms(), protect);
      const need = featherProtectNeed(info);
      const rows: (string | [string, Tone])[] = [
        `Cảnh Giới ${info.round + 1} cấp ${info.stage}${cap ? ' (tối đa)' : ''}   ${EVO_TEXT.npLabel}${np()}`,
      ];
      if (!canFeather(pet)) rows.push(['Pet này chưa thể Vũ Hóa', 'warn']);
      else if (cap) rows.push([EVO_TEXT.featherCap, 'warn']);
      else {
        rows.push(`${EVO_TEXT.costLabel}${featherNpCost(info)} NLTN — xác suất ${FEATHER_SUCCESS[info.round]?.[info.stage] ?? 0}%`);
        if (FEATHER_FALL_HINT[info.stage]) rows.push([FEATHER_FALL_HINT[info.stage], 'warn']);
      }
      lines(f.info, rows);
      f.info.append(aptTable(pet, info), protectRow(need, cap || !canFeather(pet)));
      const can = canFeather(pet) && !cap && !run.pending;
      const gold = PET_ENVOLUTION_FEATHER_COST_GOLD[info.round]?.[info.stage] ?? 0;
      f.buttons.replaceChildren(
        button(EVO_TEXT.once, () => void tries(1), can && plan.ok),
        button(EVO_TEXT.ten, () => askConfirm(EVO_TEXT.confirmTen, () => void tries(TEN)), can && plan.ok),
        button(`${EVO_TEXT.jump} (${gold} vàng)`, () => jumpConfirm(), can),
        ...(looping ? [button(EVO_TEXT.stop, () => { stopLoop = true; }, true, false)] : []),
      );
      if (can && !plan.ok) f.buttons.appendChild(el('span', 'pf-line bad', plan.text));
      renderLog();
    };

    function aptTable(pet: PetView, info: PetEvolutionInfo): HTMLElement {
      const table = el('div', 'pe-table');
      table.append(el('span', 'pe-th', 'Tư Chất'), el('span', 'pe-th', 'Cơ bản'), el('span', 'pe-th', 'Vũ Hóa'), el('span', 'pe-th', 'Cấp sau'));
      for (const r of featherRows(pet, info)) {
        const gain = r.next - r.feather;
        table.append(el('span', '', APT_LABEL[r.key]), el('span', '', String(r.base)), el('span', '', String(r.feather)),
          el('span', gain > 0 ? 'ok' : '', gain > 0 ? `${r.next} (+${gain})` : String(r.next)));
      }
      return table;
    }

    function protectRow(need: number, disabled: boolean): HTMLElement {
      const row = el('label', 'pe-protect');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = protect && need > 0;
      box.disabled = disabled || need === 0 || looping;
      box.onchange = () => { protect = box.checked; draw(); };
      const short = need > 0 && charms() < need;
      row.append(box, el('span', '', ` ${EVO_TEXT.protectPick}: ${need > 0 ? protectCost(need) : 'cấp mốc không cần Bùa Cầu Nguyện'}`),
        el('span', short ? 'bad' : '', need > 0 ? ` (có ${charms()}${short ? ` — ${EVO_TEXT.noCharm}` : ''})` : ''));
      return row;
    }

    function push(text: string, tone: Tone): void {
      log.unshift([text, tone]);
      log.length = Math.min(log.length, LOG_MAX);
    }

    function renderLog(): void {
      f.result.replaceChildren(...log.map(([t, tone]) => el('div', `pf-line ${tone}`, t)));
    }

    /** Applies a reply to the local pet (Flash resultInfo): the table follows from tid + envoInfo. */
    function applyReply(pet: PetView, r: PetFeatherReply): void {
      const before = infoOf(pet);
      push(featherMessage(before, r), r.success ? 'ok' : 'bad');
      pet.envoInfo = { envo: true, round: r.round, stage: r.stage };
    }

    async function tries(count: number): Promise<void> {
      const pet = current();
      if (!pet) return void toast(EVO_TEXT.needPetFirst);
      looping = count > 1;
      stopLoop = false;
      await run.run(async () => {
        for (let i = 0; i < count && !stopLoop; i++) {
          const plan = featherPlan(infoOf(pet), np(), charms(), protect);
          if (!plan.ok) {
            toast(plan.text);
            break;
          }
          const r = await host.actions.feather(pet.id, protect);
          if (!r) break;
          applyReply(pet, r);
          draw();
        }
        await host.actions.reloadPets();
      }, draw);
      looping = false;
      draw();
    }

    function jumpConfirm(): void {
      const pet = current();
      if (!pet) return void toast(EVO_TEXT.needPetFirst);
      const info = infoOf(pet);
      const target = (Math.floor(info.stage / 3) + 1) * 3;
      const cost = PET_ENVOLUTION_FEATHER_COST_GOLD[info.round]?.[info.stage] ?? 0;
      askConfirm(confirmJump(cost, info.round + (target >= 9 && info.round < 2 ? 2 : 1), target >= 9 && info.round < 2 ? 0 : target), () => void jump(pet.id));
    }

    async function jump(id: number): Promise<void> {
      await run.run(async () => {
        const pet = host.pets().find((p) => p.id === id);
        const r = await host.actions.featherJump(id);
        if (r && pet) applyReply(pet, r);
        await host.actions.reloadPets();
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => { stopLoop = true; f.root.remove(); } };
  },
};
