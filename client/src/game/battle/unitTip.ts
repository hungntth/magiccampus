// Hover card of a battle unit, either side (under its feet): "Cấp: N" (+ red "Boss"), HP and MP bars with current/max figures.
// Owned by BattleStage, which shows it on pointerover and refreshes it every tick while it is up (hp / mp change mid-round).

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BattleUnit } from './BattleUnit';
import { BATTLE_H, BATTLE_W } from './slots';

const W = 124;
const PAD = 5;
const LABEL_W = 24;
const BAR_W = W - PAD * 2 - LABEL_W;
const BAR_H = 12;
const ROW = 16;
const H = PAD * 2 + ROW * 3;
/** Below the unit name (BattleUnit NAME_Y 10 + one 12 px line). */
const FEET_GAP = 28;

const style = (fill: string, size = 12): TextStyle =>
  new TextStyle({ fontFamily: 'Tahoma, Verdana, sans-serif', fontSize: size, fill, stroke: { color: '#000000', width: 2 } });

export class UnitTip extends Container {
  private readonly bg = new Graphics();
  private readonly bars = new Graphics();
  private readonly level = new Text({ text: '', style: style('#ffffff') });
  private readonly boss = new Text({ text: 'Boss', style: style('#ff3333') });
  private readonly hpText = new Text({ text: '', style: style('#ffffff', 11) });
  private readonly mpText = new Text({ text: '', style: style('#ffffff', 11) });
  private unit: BattleUnit | null = null;

  constructor() {
    super();
    const hpLabel = new Text({ text: 'HP:', style: style('#ff7744') });
    const mpLabel = new Text({ text: 'MP:', style: style('#66aaff') });
    this.level.position.set(PAD, PAD);
    hpLabel.position.set(PAD, PAD + ROW);
    mpLabel.position.set(PAD, PAD + ROW * 2);
    for (const t of [this.hpText, this.mpText]) t.anchor.set(0.5, 0);
    this.hpText.position.set(PAD + LABEL_W + BAR_W / 2, PAD + ROW);
    this.mpText.position.set(PAD + LABEL_W + BAR_W / 2, PAD + ROW * 2);
    this.bg.roundRect(0, 0, W, H, 3).fill({ color: 0x0c1c2c, alpha: 0.88 }).stroke({ color: 0x78c8e6, width: 1, alpha: 0.6 });
    this.addChild(this.bg, this.bars, this.level, this.boss, hpLabel, mpLabel, this.hpText, this.mpText);
    this.eventMode = 'none';
    this.zIndex = 100001;
    this.visible = false;
  }

  show(unit: BattleUnit): void {
    this.unit = unit;
    this.visible = true;
    this.refresh();
  }

  hide(unit?: BattleUnit): void {
    if (unit && unit !== this.unit) return;
    this.unit = null;
    this.visible = false;
  }

  /** Re-reads the unit's figures and keeps the card beside it; hides once the unit is dead. */
  refresh(): void {
    const u = this.unit;
    if (!u) return;
    if (u.destroyed || u.hp <= 0) return this.hide();
    this.level.text = `Cấp: ${u.level}`;
    this.boss.visible = u.bossFlag === 1;
    this.boss.position.set(this.level.x + this.level.width + 6, PAD);
    this.hpText.text = `${u.hp}/${u.hpMax}`;
    this.mpText.text = `${u.mp}/${u.mpMax}`;
    this.bars.clear();
    this.bar(PAD + ROW + 2, u.hp / u.hpMax, 0xcc1111);
    this.bar(PAD + ROW * 2 + 2, u.mp / u.mpMax, 0x2a66cc);
    // Under the feet, below the name label; flipped above the head near the stage bottom.
    const x = Math.max(0, Math.min(BATTLE_W - W, u.x - W / 2));
    const below = u.y + FEET_GAP;
    const y = below + H > BATTLE_H ? u.y + u.headY - 14 - H : below;
    this.position.set(Math.round(x), Math.round(y));
  }

  private bar(y: number, ratio: number, color: number): void {
    const x = PAD + LABEL_W;
    this.bars.rect(x, y, BAR_W, BAR_H).fill(0x222222).stroke({ color: 0x000000, width: 1 });
    const w = Math.round(BAR_W * Math.max(0, Math.min(1, ratio)));
    if (w > 0) this.bars.rect(x, y, w, BAR_H).fill(color);
  }
}
