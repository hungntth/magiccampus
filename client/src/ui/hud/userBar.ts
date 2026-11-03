// Skill/item shortcut bar, bottom-right (legacy UserBarCanvas right0/bottom44, 460x52): 3 pages of 10 slots
// (keys 1..9,0), page switcher, show/hide toggle and the Auto battle box. Slots stay empty until skills are ported.

import { div, notReady, place, setStates, skinButton, std } from './skin';

const SC = 'MainStage_ShortcutCanvas';
const SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const PAGES = 3;

export class UserBar {
  private page = 1;
  private readonly pageLabel: HTMLDivElement;

  constructor(parent: HTMLElement) {
    const root = div('hud-userbar', parent);
    const container = place(div('hud-skillbar', root), 23, 5, 373, 44);
    const slots = place(div('hud-slots', container), 5, 3, 350, 37);
    SLOT_LABELS.forEach((n, i) => {
      const slot = place(div('hud-slot', slots), i * 35, 0, 34, 37);
      place(div('hud-slot-num', slot, n), 3, 23);
    });

    const nums = place(div('hud-pagebox', container), 352, 0, 22, 48);
    skinButton(std(`${SC}/LastRow`), nums, 4, 3, 'Trang trước', () => this.turn(-1));
    this.pageLabel = place(div('hud-page-num', nums, '1'), 0, 14, 22) as HTMLDivElement;
    skinButton(std(`${SC}/NextRow`), nums, 4, 29, 'Trang sau', () => this.turn(1));

    const hide = std(`${SC}/HideShortcuts`);
    const show = std(`${SC}/ShowShortcuts`);
    const toggle = skinButton(hide, root, 396, 7, 'Ẩn/hiện thanh phím tắt', () => {
      container.hidden = !container.hidden;
      setStates(toggle, container.hidden ? show : hide);
    });

    const auto = skinButton({ up: `${SC}/AutoBattleUp`, over: `${SC}/AutoBattleOver`, down: `${SC}/AutoBattleDown` },
      root, 418, 6, 'Thiết lập chiến đấu tự động', notReady);
    auto.classList.add('hud-auto');
    auto.textContent = 'Auto\ntắt';
  }

  // Legacy order: Up cycles 1 -> 3 -> 2 -> 1, Down cycles 1 -> 2 -> 3 -> 1.
  private turn(dir: number): void {
    this.page = ((this.page - 1 + dir + PAGES) % PAGES) + 1;
    this.pageLabel.textContent = String(this.page);
  }
}
