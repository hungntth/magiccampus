// World boss HUD (Flash WbAutoBattleCanva, PANEL_WB_BATTLEAUTO 661): auto-battle checkbox, the remaining time ("Còn: ..." counting down
// from initWbView), the boss HP bar with "hp/max" and floating damage numbers derived from the HP drop, the online count, the gold /
// silver cheer buttons (level tooltips from the client constants, confirm dialogs) and the quit button. Pure DOM; WorldBossController
// feeds it and owns the RPCs. Hidden by the battle (#stage.in-battle) like the Flash panels.

import { WB_CHEER, WB_TEXT, wbRemainText, type InitWbViewArgs } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { stageEl } from '../stage';
import './worldBoss.css';

export interface WbHudActions {
  auto(on: boolean): void;
  cheer(type: 1 | 2): void;
  quit(): void;
}

const el = <K extends keyof HTMLElementTagNameMap = 'div'>(cls: string, text = '', tag: K = 'div' as K): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class WbHud {
  private root: HTMLElement | null = null;
  private refs!: { remain: HTMLElement; hp: HTMLElement; fill: HTMLElement; online: HTMLElement; auto: HTMLInputElement; gold: HTMLButtonElement; silver: HTMLButtonElement };
  private left = 0;
  private timer = 0;
  private hp = 0;
  private maxHp = 0;
  private cheer = 0;

  constructor(private readonly act: WbHudActions) {}

  get visible(): boolean {
    return this.root !== null;
  }

  get max(): number {
    return this.maxHp;
  }

  /** initWbView: shows the HUD only while time is left (`<= 0` hides it, as Flash). */
  show(args: InitWbViewArgs): void {
    const [left, auto, hp, maxHp, cheer, , , , online] = args;
    if (left <= 0) return this.hide();
    this.build();
    this.left = left;
    this.maxHp = maxHp;
    this.hp = hp;
    this.refs.auto.checked = auto;
    this.setOnline(online);
    this.setCheer(cheer);
    this.paintHp();
    this.tick(false);
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(true), 1000);
  }

  hide(): void {
    window.clearInterval(this.timer);
    this.root?.remove();
    this.root = null;
  }

  setOnline(n: number): void {
    if (this.root) this.refs.online.textContent = `${WB_TEXT.ONLINE}${n}`;
  }

  /** onBossHpChanged: the drop since the last value floats as red damage text. */
  setHp(hp: number): void {
    if (!this.root) return;
    const drop = this.hp - hp;
    this.hp = Math.max(0, hp);
    this.paintHp();
    if (drop > 0) this.float(drop);
  }

  /** updateWbStrongLabel: 5 disables both buttons, else the tooltips follow the level about to be bought. */
  setCheer(level: number): void {
    this.cheer = level;
    if (!this.root) return;
    const max = level >= WB_CHEER.MAX_LEVEL;
    for (const b of [this.refs.gold, this.refs.silver]) b.disabled = max;
    this.refs.gold.title = max ? WB_TEXT.MAX_LEVEL : WB_TEXT.COST_TIP(WB_CHEER.GOLD, 'vàng', WB_CHEER.LEVEL_PCT[level]);
    this.refs.silver.title = max
      ? WB_TEXT.MAX_LEVEL
      : WB_TEXT.COST_TIP(WB_CHEER.SILVER, 'bạc', WB_CHEER.LEVEL_PCT[level]) + WB_TEXT.RATE_TIP(`${WB_CHEER.SILVER_RATE[level]}%`);
  }

  private build(): void {
    if (this.root) return;
    const root = el('wb-hud');
    const top = el('wb-row');
    const label = el('wb-auto-label', '', 'label');
    const auto = el('wb-auto', '', 'input') as HTMLInputElement;
    auto.type = 'checkbox';
    auto.onchange = () => this.act.auto(auto.checked);
    label.append(auto, document.createTextNode(` ${WB_TEXT.AUTO}`));
    const remain = el('wb-remain');
    const quit = el('wb-btn wb-quit', WB_TEXT.QUIT, 'button');
    quit.onclick = () => this.act.quit();
    top.append(label, remain, quit);
    const bar = el('wb-bar');
    const fill = el('wb-bar-fill');
    const hp = el('wb-bar-text');
    bar.append(fill, hp);
    const online = el('wb-online');
    const gold = el('wb-btn wb-cheer wb-gold', WB_TEXT.GOLD_CHEER, 'button');
    gold.onclick = () => askConfirm(WB_TEXT.CONFIRM_GOLD(WB_CHEER.GOLD), () => this.act.cheer(1));
    const silver = el('wb-btn wb-cheer wb-silver', WB_TEXT.SILVER_CHEER, 'button');
    silver.onclick = () => askConfirm(WB_TEXT.CONFIRM_SILVER(WB_CHEER.SILVER), () => this.act.cheer(2));
    const row = el('wb-row wb-cheers');
    row.append(online, gold, silver);
    root.append(top, bar, row);
    stageEl().appendChild(root);
    this.root = root;
    this.refs = { remain, hp, fill, online, auto, gold, silver };
  }

  private tick(down: boolean): void {
    if (down) this.left = Math.max(0, this.left - 1);
    this.refs.remain.textContent = wbRemainText(this.left);
  }

  private paintHp(): void {
    const { hp, fill } = this.refs;
    const pct = this.maxHp > 0 ? Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100)) : 0;
    fill.style.width = `${pct}%`;
    hp.textContent = `${Math.round(this.hp)}/${this.maxHp}`;
  }

  private float(n: number): void {
    const f = el('wb-float', `-${Math.round(n)}`);
    this.root?.appendChild(f);
    window.setTimeout(() => f.remove(), 1500);
  }
}
