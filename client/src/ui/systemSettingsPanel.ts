// "Hệ thống" window (legacy UserSystemSetPanel, M9 phase G; P key / minimap "Thiết lập"): the setting checkboxes, the max
// players stepper, game speed and image quality, and the buttons Lưu / OK (us(changes)), Đăng nhập / Nhân vật (back to the
// login screen), Tín hiệu (unstuck), Chiến đấu (auto-battle settings) and Thiết lập lại (all checkboxes on).

import {
  MAX_VIEW_MAX, MAX_VIEW_MIN, settingOn, SYSTEM_SETTING_ROWS, SYSTEM_TEXT, type InterfaceData, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import { toast } from './screens';
import { askUnstuck } from './unstuck';
import './systemSettings.css';

const QUALITY_KEY = 'mc.quality';
const QUALITIES = ['Cao', 'Vừa', 'Thấp'] as const;

export interface SystemSettingsHost {
  client: GameClient;
  player(): PlayerData | null;
  /** Saved keys were merged into player.interfaceData: re-apply the view effects. */
  onApplied(): void;
  onAutoBattle(): void;
}

function readQuality(): string {
  try {
    return localStorage.getItem(QUALITY_KEY) ?? QUALITIES[0];
  } catch {
    return QUALITIES[0];
  }
}

function writeQuality(q: string): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // private mode: the choice is not kept
  }
}

export class SystemSettingsPanel {
  private win: ActWindow | null = null;
  private changes: InterfaceData = {};

  constructor(private readonly host: SystemSettingsHost) {}

  toggle(): void {
    if (this.win) this.close();
    else this.open();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
    this.changes = {};
  }

  private value(key: string): number | boolean | undefined {
    return key in this.changes ? this.changes[key] : this.host.player()?.interfaceData?.[key];
  }

  private open(): void {
    this.win = openActWindow(SYSTEM_TEXT.TITLE, 'sys-win', () => this.close());
    this.render();
  }

  private render(): void {
    if (!this.win) return;
    const grid = el('sys-grid');
    for (const [key, label] of SYSTEM_SETTING_ROWS) {
      grid.appendChild(this.check(label, settingOn({ [key]: this.value(key) }, key), (on) => (this.changes[key] = on)));
    }
    const speed = this.check(SYSTEM_TEXT.SPEED, settingOn({ cf: this.value('cf') }, 'cf'), (on) => (this.changes.cf = on));
    speed.title = SYSTEM_TEXT.SPEED_TIP;
    grid.appendChild(speed);
    const view = el('sys-line');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(MAX_VIEW_MIN);
    input.max = String(MAX_VIEW_MAX);
    input.value = String(this.value('maxView') ?? 100);
    input.onchange = () => {
      const n = Math.round(Number(input.value));
      const v = Math.max(MAX_VIEW_MIN, Math.min(MAX_VIEW_MAX, Number.isFinite(n) ? n : 100));
      input.value = String(v);
      this.changes.maxView = v;
    };
    view.append(el('sys-label', SYSTEM_TEXT.MAX_VIEW), input);
    const quality = el('sys-line');
    quality.appendChild(el('sys-label', SYSTEM_TEXT.QUALITY));
    const current = readQuality();
    for (const q of QUALITIES) {
      const r = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'sys-quality';
      radio.checked = q === current;
      radio.onchange = () => writeQuality(q);
      r.append(radio, document.createTextNode(q));
      quality.appendChild(r);
    }
    const buttons = el('sys-buttons');
    buttons.append(
      button('Lưu', () => void this.save(false)), button('OK', () => void this.save(true)),
      button('Đăng nhập', () => location.reload()), button('Nhân vật', () => location.reload()),
      button('Tín hiệu', () => askUnstuck(this.host.client)), button('Chiến đấu', () => this.host.onAutoBattle()),
      button('Thiết lập lại', () => askConfirm(SYSTEM_TEXT.RESET_CONFIRM, () => this.reset())),
    );
    this.win.body.replaceChildren(grid, view, quality, buttons);
  }

  private check(label: string, on: boolean, set: (on: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    row.className = 'sys-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.onchange = () => set(box.checked);
    row.append(box, document.createTextNode(label));
    return row;
  }

  /** Thiết lập lại: every checkbox on (Go has no resetSetting RPC), then saved like Lưu. */
  private reset(): void {
    for (const [key] of SYSTEM_SETTING_ROWS) this.changes[key] = true;
    this.changes.cf = true;
    void this.save(false);
  }

  private async save(close: boolean): Promise<void> {
    const changes = this.changes;
    if (Object.keys(changes).length > 0) {
      try {
        await this.host.client.call('us', changes);
      } catch (e) {
        return void toast((e as Error).message, true);
      }
      const p = this.host.player();
      if (p) p.interfaceData = { ...(p.interfaceData ?? {}), ...changes };
      this.changes = {};
      this.host.onApplied();
    }
    if (close) this.close();
    else this.render();
  }
}
