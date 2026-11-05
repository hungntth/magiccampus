// "Tự động chiến đấu" settings window (legacy BattleSettingPanel): character and pet columns with the heal slots and their HP/MP
// thresholds, the default attack skill and the client-only auto-defence boxes. Writes go through skillSetBattle (skills) and
// uif (items, thresholds); the local settings (autoState.store) change only after the server accepted the write.

import {
  AutoSlotKind, isBattleSkill, type AutoSettingKey, type BagItem, type LearnedSkill,
} from '@mc/shared';
import { autoState } from '../game/battle/autoState';
import { HP_POTION, MP_POTION } from '../game/potions';
import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { toast } from './screens';
import './autoBattle.css';

export interface AutoPanelHost {
  client: GameClient;
  bagItems(): BagItem[];
}

interface SlotRow { label: string; slot: number; p?: AutoSettingKey; kind: 'heal' | 'mp' | 'attack' }

const CHAR_ROWS: SlotRow[] = [
  { label: 'Phục hồi HP', slot: 1, p: 'p2', kind: 'heal' }, { label: 'Phục hồi MP', slot: 9, p: 'p3', kind: 'mp' },
  { label: 'Pet hỗ trợ', slot: 3, p: 'p4', kind: 'heal' }, { label: 'Pet hỗ trợ', slot: 5, p: 'p5', kind: 'heal' },
  { label: 'Kỹ năng tấn công', slot: 7, kind: 'attack' },
];
const PET_ROWS: SlotRow[] = [
  { label: 'Phục hồi HP', slot: 2, p: 'p6', kind: 'heal' }, { label: 'Phục hồi MP', slot: 10, p: 'p7', kind: 'mp' },
  { label: 'Pet hỗ trợ', slot: 4, p: 'p8', kind: 'heal' }, { label: 'Pet hỗ trợ', slot: 6, p: 'p9', kind: 'heal' },
  { label: 'Kỹ năng tấn công', slot: 8, kind: 'attack' },
];
const HINT = 'Chọn kỹ năng đánh mặc định\n Để trống là tấn công thường';

interface Option { label: string; apply: () => Promise<void> }

export class AutoBattlePanel {
  private win: ActWindow | null = null;
  private charSkills: LearnedSkill[] = [];
  private picker: HTMLElement | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly host: AutoPanelHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  toggle(): void {
    if (this.win) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    this.win ??= openActWindow('Tự động chiến đấu', 'auto-win', () => this.close());
    try {
      this.charSkills = (await this.host.client.call<LearnedSkill[]>('initLearnedSkill')).filter((s) => isBattleSkill(s.type));
    } catch (e) {
      toast((e as Error).message, true);
    }
    this.render();
  }

  close(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.win?.dispose();
    this.win = null;
    this.picker = null;
  }

  private petSkills(): LearnedSkill[] {
    const info = autoState.battlePet()?.skillInfo ?? {};
    return Object.values(info).filter((s) => isBattleSkill(s.type)).map((s) => ({
      sid: s.id, level: 1, position: 0, kind: 1, name: s.name, type: s.type, useMp: 0, iconCode: s.iconCode, targetType: 4,
    }));
  }

  private render(): void {
    if (!this.win) return;
    const pet = autoState.battlePet();
    const cols = el('auto-cols');
    cols.append(this.column('Thao tác nhân vật', CHAR_ROWS, false, true), this.column('Thao tác pet', PET_ROWS, true, pet !== undefined));
    this.win.body.replaceChildren(cols);
  }

  private column(title: string, rows: readonly SlotRow[], isPet: boolean, enabled: boolean): HTMLElement {
    const col = el(`auto-col${enabled ? '' : ' disabled'}`);
    col.appendChild(el('auto-col-title', title));
    if (!enabled) {
      col.appendChild(el('auto-note', 'Chưa có pet xuất chiến'));
      return col;
    }
    const s = autoState.settings() as Record<string, number | undefined>;
    for (const row of rows) {
      const line = el('auto-row');
      if (row.kind === 'attack') line.appendChild(el('auto-col-title', 'Kỹ năng tấn công'));
      const slotBtn = button(this.slotText(row, isPet, s), () => this.openPicker(slotBtn, row, isPet), 'auto-slot');
      line.append(el('auto-label', row.label), slotBtn);
      if (row.p) line.appendChild(this.slider(row.p, isPet, Number(s[row.p] ?? 10)));
      if (row.kind === 'attack') line.appendChild(el('auto-hint', HINT));
      col.appendChild(line);
    }
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = autoState.defend(isPet);
    box.onchange = () => autoState.setDefend(isPet, box.checked);
    const lab = el('auto-defend', undefined, 'label');
    lab.append(box, document.createTextNode('Tự động phòng ngự'));
    col.appendChild(lab);
    return col;
  }

  private slotText(row: SlotRow, isPet: boolean, s: Record<string, number | undefined>): string {
    const id = Number(s[`bs${row.slot}`] ?? 0);
    if (id <= 0) return 'Bỏ trống';
    const isSkill = row.kind === 'attack' || (row.kind === 'heal' && Number(s[`bt${row.slot}`] ?? 0) === AutoSlotKind.SKILL);
    if (isSkill) return (isPet ? this.petSkills() : this.charSkills).find((k) => k.sid === id)?.name ?? `Kỹ năng #${id}`;
    return this.host.bagItems().find((b) => b.tid === id)?.name ?? `Vật phẩm #${id}`;
  }

  private slider(key: AutoSettingKey, isPet: boolean, value: number): HTMLElement {
    const wrap = el('auto-slider');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(value);
    const out = el('auto-pct', `${value}%`);
    input.oninput = () => {
      out.textContent = `${input.value}%`;
      const old = this.timers.get(key);
      if (old) clearTimeout(old);
      this.timers.set(key, setTimeout(() => void this.write(key, Number(input.value), isPet), 300));
    };
    wrap.append(input, out);
    return wrap;
  }

  private async write(key: AutoSettingKey, value: number, isPet: boolean): Promise<void> {
    await this.host.client.call('uif', key, value, isPet);
    autoState.store(key, value);
  }

  private options(row: SlotRow, isPet: boolean): Option[] {
    const n = row.slot;
    const out: Option[] = [];
    const clear = row.kind === 'mp'
      ? () => this.write(`bs${n}` as AutoSettingKey, 0, isPet)
      : row.kind === 'attack'
        ? () => this.setSkill(0, 0, n, isPet)
        : async () => {
          await this.write(`bt${n}` as AutoSettingKey, AutoSlotKind.NONE, isPet);
          await this.write(`bs${n}` as AutoSettingKey, 0, isPet);
        };
    out.push({ label: 'Bỏ trống', apply: clear });
    if (row.kind !== 'mp') {
      for (const sk of isPet ? this.petSkills() : this.charSkills) out.push({ label: sk.name, apply: () => this.setSkill(sk.sid, sk.level, n, isPet) });
    }
    if (row.kind !== 'attack') {
      const table = row.kind === 'mp' ? MP_POTION : HP_POTION;
      const seen = new Set<number>();
      for (const it of this.host.bagItems()) {
        if (table[it.tid] === undefined || seen.has(it.tid)) continue;
        seen.add(it.tid);
        out.push({
          label: `${it.name} (vật phẩm)`,
          apply: async () => {
            if (row.kind === 'heal') await this.write(`bt${n}` as AutoSettingKey, AutoSlotKind.ITEM, isPet);
            await this.write(`bs${n}` as AutoSettingKey, it.tid, isPet);
          },
        });
      }
    }
    return out;
  }

  private async setSkill(sid: number, level: number, slot: number, isPet: boolean): Promise<void> {
    await this.host.client.call('skillSetBattle', sid, level, String(slot), isPet);
    autoState.store(`bt${slot}` as AutoSettingKey, sid ? AutoSlotKind.SKILL : AutoSlotKind.NONE);
    autoState.store(`bs${slot}` as AutoSettingKey, sid);
  }

  private openPicker(anchor: HTMLElement, row: SlotRow, isPet: boolean): void {
    this.picker?.remove();
    const list = el('auto-picker');
    for (const opt of this.options(row, isPet)) {
      list.appendChild(button(opt.label, () => {
        this.picker?.remove();
        this.picker = null;
        opt.apply().then(() => this.render(), (e: Error) => toast(e.message, true));
      }, 'auto-pick'));
    }
    anchor.after(list);
    this.picker = list;
  }
}
