// The battle stage: a 900x570 Pixi container (centred over the map by the controller) holding the combatants, floating
// damage popups and the crit shake. The dark tinted backdrop is the map itself (the controller tints the world and the
// stage adds the 0.6 black overlay). Units are clickable while a target is being picked.

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BattleStart } from '@mc/shared';
import { BattleUnit } from './BattleUnit';
import { BATTLE_H, BATTLE_W } from './slots';

interface Popup {
  text: Text;
  vy: number;
  life: number;
}

const POPUP_LIFE_MS = 900;
const SHAKE = [3, -2, 1, 0];

export class BattleStage extends Container {
  readonly units = new Map<number, BattleUnit>();
  private readonly layer = new Container();
  private readonly popups: Popup[] = [];
  private shakeLeft = 0;
  private picking = false;
  onPick: ((slot: number) => void) | null = null;

  constructor(start: BattleStart) {
    super();
    // Legacy bgImg: UI_LOADING_BACK at alpha 0.6 over the tinted map snapshot; a plain black overlay stands in for it.
    const dim = new Graphics().rect(-4000, -4000, 8000, 8000).fill({ color: 0x000000, alpha: 0.6 });
    dim.eventMode = 'static'; // swallow clicks so the map underneath never reacts
    this.layer.sortableChildren = true;
    this.addChild(dim, this.layer);
    for (const p of Object.values(start.cList)) {
      const unit = new BattleUnit(p);
      this.units.set(p.battleId, unit);
      this.layer.addChild(unit);
      if (unit.enemy) this.makePickable(unit);
    }
  }

  private makePickable(unit: BattleUnit): void {
    unit.eventMode = 'static';
    unit.cursor = 'crosshair';
    unit.hitArea = { contains: (x: number, y: number): boolean => this.picking && unit.hp > 0 && Math.abs(x) < 40 && y > unit.headY - 20 && y < 12 };
    unit.on('pointertap', (e) => {
      e.stopPropagation();
      if (this.picking && unit.hp > 0) this.onPick?.(unit.slot);
    });
    unit.on('pointerover', () => this.picking && unit.hp > 0 && (unit.tint = 0xff9999));
    unit.on('pointerout', () => (unit.tint = 0xffffff));
  }

  /** Enemy units react to clicks / hover only while this is on. */
  setPicking(on: boolean): void {
    this.picking = on;
    if (!on) for (const u of this.units.values()) u.tint = 0xffffff;
  }

  /** Floating number / text above a unit: damage red 32, crit 50 + shake, heal green, miss white 18. */
  popup(unit: BattleUnit, text: string, color: string, size: number): void {
    const t = new Text({
      text,
      style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: size, fontWeight: '900', fill: color, stroke: { color: '#000000', width: 4 } }),
    });
    t.anchor.set(0.5, 1);
    t.position.set(unit.x, unit.y + unit.headY - 20);
    t.zIndex = 100000;
    this.layer.addChild(t);
    this.popups.push({ text: t, vy: size >= 50 ? 3 : 2, life: POPUP_LIFE_MS });
  }

  /** Legacy criticalEffectRoute [3, -2, 1]: a few frames of stage jitter. */
  shake(): void {
    this.shakeLeft = SHAKE.length;
  }

  tick(dt: number): void {
    for (const u of this.units.values()) u.tick(dt);
    const frames = dt * 24;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt * 1000;
      p.text.y -= p.vy * frames;
      p.text.alpha = Math.min(1, p.life / 300);
      if (p.life <= 0) {
        p.text.destroy();
        this.popups.splice(i, 1);
      }
    }
    if (this.shakeLeft > 0) {
      this.layer.position.set(SHAKE[SHAKE.length - this.shakeLeft], SHAKE[SHAKE.length - this.shakeLeft]);
      this.shakeLeft--;
      if (this.shakeLeft === 0) this.layer.position.set(0, 0);
    }
  }

  /** Centres the 900x570 stage in a viewport of (w, h) stage pixels. */
  centerIn(w: number, h: number): void {
    this.position.set(Math.round((w - BATTLE_W) / 2), Math.round((h - BATTLE_H) / 2));
  }
}
