// "Mua Túi cứu thương" window (legacy BloodAddPanel, M9 phase D): one pool (1 char HP, 2 char MP, 3 pet HP, 4 pet MP), stock
// line, amount input, Tăng đầy / Một phần / Hủy, the gold confirm, then buyBloodBag({bt, bn}) (result arrives as onUPP {gold, ep}).
// Also the heal-button skin/tooltip helper used by the portrait and pet canvases.

import { BLOOD_BAG_MAX, BLOOD_BAG_TEXT, bloodBagCost, parseEp } from '@mc/shared';
import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import { toast } from './screens';
import './autoBattle.css';

const TIPS: Record<number, [string, string]> = {
  1: ['Sinh Mệnh Hoàn tiện dụng \n Sau khi kết thúc chiến đấu sẽ tự phục hồi HP cho nhân vật \n Lượng trữ hiện tại: 0/1000000',
    'Sinh Mệnh Hoàn tiện dụng\nSau khi kết thúc chiến đấu sẽ tự phục hồi HP cho nhân vật\nLượng trữ hiện tại: '],
  2: ['Pháp Lực Hoàn tiện dụng \n Sau khi kết thúc chiến đấu sẽ tự phục hồi MP cho nhân vật \n Lượng trữ hiện tại: 0/1000000',
    'Pháp Lực Hoàn tiện dụng\nSau khi kết thúc chiến đấu sẽ tự phục hồi MP cho nhân vật\nLượng trữ hiện tại: '],
  3: ['Sinh Mệnh Hoàn tiện dụng \n Sau khi kết thúc chiến đấu sẽ tự phục hồi HP cho pet \n Lượng trữ hiện tại: 0/1000000',
    'Sinh Mệnh Hoàn tiện dụng\nSau khi kết thúc chiến đấu sẽ tự phục hồi HP cho pet\nLượng trữ hiện tại: '],
  4: ['Pháp Lực Hoàn tiện dụng \n Sau khi kết thúc chiến đấu sẽ tự phục hồi MP cho pet \n Lượng trữ hiện tại: 0/1000000',
    'Pháp Lực Hoàn tiện dụng\nSau khi kết thúc chiến đấu sẽ tự phục hồi MP cho pet\nLượng trữ hiện tại: '],
};

/** Skin base name + tooltip of a heal button for pool `bt` (empty / half / full). */
export function healButtonState(ep: string | undefined, bt: number): { skin: string; tip: string } {
  const v = parseEp(ep)[bt - 1] ?? 0;
  const hp = bt === 1 || bt === 3;
  const level = v <= 0 ? 'Empty' : v < BLOOD_BAG_MAX / 2 ? 'Half' : 'Full';
  const skin = level === 'Empty' ? (hp ? 'HealEmpty' : 'HealMPEmpty') : `Heal${hp ? 'HP' : 'MP'}${level}`;
  return { skin: `MainStage_CharInfo/${skin}`, tip: v <= 0 ? TIPS[bt][0] : `${TIPS[bt][1]}${v}/${BLOOD_BAG_MAX}` };
}

export class BloodBagPanel {
  private win: ActWindow | null = null;
  private bt = 1;

  constructor(private readonly client: GameClient, private readonly ep: () => string | undefined) {}

  open(bt: number): void {
    this.bt = bt;
    this.win?.dispose();
    this.win = openActWindow(BLOOD_BAG_TEXT.TITLE, 'bb-win', () => this.close());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  /** Re-render after an ep change. */
  refresh(): void {
    if (this.win) this.render();
  }

  private render(): void {
    if (!this.win) return;
    const cur = parseEp(this.ep())[this.bt - 1] ?? 0;
    const room = Math.max(0, BLOOD_BAG_MAX - cur);
    const name = BLOOD_BAG_TEXT.NAMES[this.bt];
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(room);
    input.value = String(Math.min(room, 1_000_000));
    const cost = el('bb-cost');
    const update = (): void => void (cost.textContent = `${BLOOD_BAG_TEXT.COST}${bloodBagCost(Math.min(room, Number(input.value) || 0))}`);
    input.oninput = update;
    update();
    const buy = (bn: number): void => {
      if (bn > room) return void toast(BLOOD_BAG_TEXT.OVER, true);
      if (!(bn > 0)) return void toast(BLOOD_BAG_TEXT.NEED_POSITIVE, true);
      const gold = bloodBagCost(bn);
      askConfirm(BLOOD_BAG_TEXT.CONFIRM.replace('{gold}', String(gold)).replace('{name}', name), () => {
        this.client.call('buyBloodBag', { bt: this.bt, bn }).then(() => this.close(), (e: Error) => toast(e.message, true));
      });
    };
    const row = el('bb-row');
    row.append(
      button(BLOOD_BAG_TEXT.FILL, () => buy(room)),
      button(BLOOD_BAG_TEXT.PART, () => buy(Math.trunc(Number(input.value) || 0))),
      button(BLOOD_BAG_TEXT.CANCEL, () => this.close()),
    );
    this.win.body.replaceChildren(
      el('bb-name', name), el('bb-stock', `${BLOOD_BAG_TEXT.STOCK}${cur}/${BLOOD_BAG_MAX}`), el('bb-label', BLOOD_BAG_TEXT.AMOUNT), input, cost, row,
    );
  }
}
