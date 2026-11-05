// "Phó bản" hub window (H5 helper over getFbInfo, after the earlier H5 port E:\mcgame\h5\src\ui\features\dungeon): one card per
// ported dungeon with level, ticket count, today's run state, the daily lock countdown and a hint where to go (NPC 200 for the
// opener quest, the entrance NPC with a ticket). Pure view; DungeonController owns the call.

import { DUNGEONS, type DungeonDef, type FbInfo } from '@mc/shared';
import { el, openActWindow, type ActWindow } from '../actWindow';
import { countdown } from './runStrip';

const RUN_TEXT: Record<FbInfo['run'], string> = {
  none: 'Chưa vào hôm nay', open: 'Đang thám hiểm', closed: 'Đã kết thúc hôm nay', auto: 'Đã tự động hoàn thành',
};

export class FbHub {
  private win: ActWindow | null = null;

  /** `onAutoTask` opens the "Tự động hoàn thành phụ bản" window (quick complete). */
  constructor(private readonly onAutoTask: () => void = () => undefined) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(rows: readonly FbInfo[]): void {
    if (!this.win) this.win = openActWindow('Phó bản', 'fb-hub', () => this.close());
    const list = el('fb-list');
    for (const r of rows) {
      const d = DUNGEONS.find((x) => x.key === r.key);
      if (d) list.appendChild(this.card(d, r));
    }
    if (rows.length === 0) list.appendChild(el('act-muted', 'Chưa có phó bản nào mở.'));
    const auto = el('act-btn', 'Tự động hoàn thành', 'button');
    auto.onclick = () => this.onAutoTask();
    this.win.body.replaceChildren(auto, list, el('act-muted', 'Mỗi phó bản hoàn thành một lần mỗi ngày, làm mới lúc 0:00.'));
  }

  private card(d: DungeonDef, r: FbInfo): HTMLElement {
    const c = el('fb-card');
    c.appendChild(el('fb-title', `${d.name} (cấp ${d.level})`));
    const group = d.rules.minGroup > 1 ? `nhóm ${d.rules.minGroup}+ người` : 'một mình hoặc nhóm';
    c.appendChild(el('fb-line', `${group} · ${d.rules.durationMin} phút · ${d.floors.length} tầng`));
    c.appendChild(el('fb-line', `${d.ticketName}: ${r.tickets}`));
    const open = r.run === 'open' && r.deadline > 0;
    c.appendChild(el(`fb-state ${r.run}`, open ? `${RUN_TEXT.open} (còn ${countdown(r.deadline - Date.now())}, tầng ${r.reached + 1})` : RUN_TEXT[r.run]));
    if (r.lockedUntil > 0) c.appendChild(el('fb-state closed', `Hôm nay đã hoàn thành, mở lại sau ${countdown(r.lockedUntil - Date.now())}`));
    const hint = r.run === 'open' || r.tickets > 0
      ? `Lối vào: ${r.entrance}`
      : 'Nhận vé ở Sứ Giả Mở Phụ Bản (Tiên Lạp Thành)';
    c.appendChild(el('act-muted', hint));
    return c;
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }
}
