// "Khế Ước" tab: four rows (HP, Tốc độ, Công VL, Công MP) with level, exp bar, current / next bonus and the x1 / x10 buttons
// (contractPet / contractPetTen). With "tự động mua" ticked a short x1 is answered by onEnsureBuyContract, whose gold confirm
// the controller owns; x10 asks the Flash confirm first. The state is PlayerData.contractPet, patched from every reply.

import { PET_CONTRACT_MAX_LEVEL, PET_CONTRACT_NAMES, PET_CONTRACT_STONE_ITEM } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { itemsByTid, stackTotal } from '../petfunc/petFuncRules';
import { Runner, button, buildFrame, lines, type Tone } from '../petfunc/tabKit';
import { contractFigures, HUNTER_CLASS, type ContractFigures } from './petEvoRules';
import { EVO_TEXT, GUIDES } from './petEvoText';
import type { PetEvoTab } from './petEvoTypes';

const TYPES = [1, 2, 3, 4] as const;
const pct = (n: number): string => `${n}%`;

export const contractTab: PetEvoTab = {
  id: 'contract',
  label: 'Khế Ước',
  build(host, body) {
    const f = buildFrame(body, GUIDES[2]);
    const run = new Runner();
    let autoBuy = false;
    let last: [string, Tone] | null = null;
    /** level:exp per type at the last draw: any change (own try or the confirmed gold buy) writes the result line. */
    const seen = new Map<number, ContractFigures>();

    const figures = (type: number): ContractFigures => contractFigures(host.player().contractPet, type, host.player().classId === HUNTER_CLASS);

    const draw = (): void => {
      const stones = stackTotal(itemsByTid(host.items(), PET_CONTRACT_STONE_ITEM));
      f.seats.style.display = 'none';
      lines(f.info, [`${EVO_TEXT.contractStones}${stones}   Vàng: ${host.player().gold}`]);
      const auto = el('label', 'pe-protect');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = autoBuy;
      box.onchange = () => { autoBuy = box.checked; };
      auto.append(box, el('span', '', ` ${EVO_TEXT.autoBuy}`));
      f.info.appendChild(auto);
      const rows = el('div', 'pe-contract');
      for (const type of TYPES) {
        const fig = figures(type);
        noteChange(type, fig);
        rows.appendChild(rowEl(type, fig));
      }
      f.buttons.replaceChildren(rows);
      f.result.replaceChildren(...(last ? [el('div', `pf-line ${last[1]}`, last[0])] : []));
    };

    function rowEl(type: number, fig: ContractFigures): HTMLElement {
      const name = PET_CONTRACT_NAMES[type] ?? `#${type}`;
      const row = el('div', 'pe-contract-row');
      const bar = el('div', 'pe-bar');
      const fill = el('div', 'pe-bar-fill');
      fill.style.width = fig.maxed ? '100%' : `${fig.expMax > 0 ? Math.min(100, Math.round((fig.exp * 100) / fig.expMax)) : 0}%`;
      bar.append(fill, el('span', 'pe-bar-text', fig.maxed ? EVO_TEXT.contractMax : `${fig.exp}/${fig.expMax}`));
      const info = el('div', 'pe-contract-info');
      info.append(
        el('div', 'pe-contract-name', `${name}  Lv${fig.level}/${PET_CONTRACT_MAX_LEVEL}`),
        el('div', 'pf-line', `Hiện tại +${pct(fig.now)}${fig.maxed ? '' : ` → cấp kế +${pct(fig.next)}`}`),
        fig.maxed ? el('div', 'pf-line warn', EVO_TEXT.maxLevel) : el('div', 'pf-line', `${EVO_TEXT.contractNeed}: ${fig.stones}`),
      );
      const acts = el('div', 'pe-contract-acts');
      acts.append(
        button(EVO_TEXT.contractOne, () => void train(type, false), !fig.maxed && !run.pending),
        button(EVO_TEXT.contractTen, () => confirmTen(type), !fig.maxed && !run.pending),
      );
      row.append(info, bar, acts);
      return row;
    }

    function confirmTen(type: number): void {
      if (figures(type).maxed) return void toast(EVO_TEXT.maxLevel);
      if (autoBuy) askConfirm(EVO_TEXT.contractBuy, () => void train(type, true));
      else void train(type, true);
    }

    function noteChange(type: number, fig: ContractFigures): void {
      const prev = seen.get(type);
      seen.set(type, fig);
      if (!prev || (prev.level === fig.level && prev.exp === fig.exp)) return;
      const name = PET_CONTRACT_NAMES[type] ?? '';
      last = fig.level > prev.level ? [`Khế Ước ${name} lên cấp ${fig.level}! (exp ${fig.exp})`, 'ok'] : [`Khế Ước ${name}: cấp ${fig.level}, exp ${fig.exp}`, ''];
    }

    async function train(type: number, ten: boolean): Promise<void> {
      await run.run(async () => void (await host.actions.contract(type, autoBuy, ten)), draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
