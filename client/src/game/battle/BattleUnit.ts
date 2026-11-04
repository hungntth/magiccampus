// One combatant on the battle stage: sheet animation (stand / run / attack / hurt / dead ...), name, HP (and own MP) bar,
// run-to-target and fade tweens. Driven by BattleStage.tick(dt); one-shot actions resolve their promise when they finish.

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BattleParticipantType, type BattleParticipant } from '@mc/shared';
import { SheetAnim, loadSheet } from '../SheetAnim';
import { sheetNameFromResCode } from '../Entity';
import { Action, CLOSE_TO, RUN_SPEED, SLOT_POS, defaultDir, isEnemySlot } from './slots';

const BAR_W = 50;
const BAR_H = 4;
const nameStyle = (fill: string): TextStyle =>
  new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '700', fill, stroke: { color: '#000000', width: 3 } });

export class BattleUnit extends Container {
  readonly slot: number;
  readonly enemy: boolean;
  readonly homeX: number;
  readonly homeY: number;
  hp: number;
  mp: number;
  readonly hpMax: number;
  readonly mpMax: number;
  dir: number;
  /** Top of the sprite relative to the feet (negative); bars and popups sit above it. */
  headY = -60;
  private anim: SheetAnim | null = null;
  private readonly body = new Container();
  private readonly bars = new Graphics();
  private readonly nameText: Text;
  private readonly isSelf: boolean;
  private goal: { x: number; y: number; done: () => void } | null = null;
  private fade: { left: number; total: number } | null = null;

  constructor(p: BattleParticipant) {
    super();
    this.slot = p.battleId;
    this.enemy = isEnemySlot(p.battleId);
    this.isSelf = p.type === BattleParticipantType.CHARACTER;
    const home = SLOT_POS[p.battleId] ?? { x: 450, y: 285 };
    this.homeX = home.x;
    this.homeY = home.y;
    this.position.set(home.x, home.y);
    this.hp = p.hp;
    this.mp = p.mp;
    this.hpMax = Math.max(1, p.hpMax);
    this.mpMax = Math.max(1, p.mpMax);
    this.dir = defaultDir(p.battleId);

    const shadow = new Graphics().ellipse(0, 0, 22, 9).fill({ color: 0x000000, alpha: 0.35 });
    // Placeholder until the sheet loads (or when there is none).
    this.body.addChild(new Graphics().circle(0, -26, 18).fill({ color: this.enemy ? 0xc0504d : 0x4ba3e3, alpha: 0.9 }));
    const shown = p.type === BattleParticipantType.CREATURE ? p.name.split('【')[0] : p.name;
    const color = p.bossFlag === 1 ? '#ff0000' : p.bossFlag === 2 ? '#00ff00' : this.enemy ? '#ffffff' : '#ffff00';
    this.nameText = new Text({ text: shown, style: nameStyle(color) });
    this.nameText.anchor.set(0.5, 1);
    this.addChild(shadow, this.body, this.bars, this.nameText);
    this.eventMode = 'none';
    void this.load(p.resCode);
    this.layout();
  }

  private async load(resCode: string): Promise<void> {
    const sheetName = sheetNameFromResCode(resCode);
    const sheet = sheetName ? await loadSheet(sheetName) : null;
    if (this.destroyed || !sheet || Object.keys(sheet.data.anims).length === 0) return;
    const anim = new SheetAnim(sheet);
    const { width, height, meta } = sheet.data;
    const footY = meta?.footY ?? height - 8;
    anim.position.set(-(meta?.midX ?? width / 2), -footY);
    this.anim = anim;
    for (const c of this.body.removeChildren()) c.destroy();
    this.body.addChild(anim);
    this.headY = (meta?.bodyY ?? meta?.headY ?? 0) - footY - 4;
    this.stand();
    this.layout();
  }

  /** Bars at headY - 10 (HP; own MP stacked under it), name just above them. */
  private layout(): void {
    this.bars.clear();
    const draw = (y: number, v: number, max: number, color: number): void => {
      this.bars.rect(-BAR_W / 2, y, BAR_W, BAR_H).fill(0x333333);
      this.bars.rect(-BAR_W / 2, y, (BAR_W * Math.max(0, Math.min(max, v))) / max, BAR_H).fill(color);
      this.bars.rect(-BAR_W / 2, y, BAR_W, BAR_H).stroke({ color: 0xdddddd, width: 1 });
    };
    const top = this.headY - 10;
    draw(top, this.hp, this.hpMax, 0xff0000);
    if (this.isSelf) draw(top + BAR_H - 1, this.mp, this.mpMax, 0x3333aa);
    this.nameText.position.set(0, top - 2);
  }

  setHp(hp: number): void {
    this.hp = Math.max(0, hp);
    this.layout();
  }

  setMp(mp: number): void {
    this.mp = Math.max(0, mp);
    this.layout();
  }

  face(dir: number): void {
    this.dir = dir;
  }

  /** Loops the stand pose in the current direction. */
  stand(): void {
    this.fade = null;
    this.alpha = 1;
    void this.play(Action.STAND, true);
  }

  /** Plays `<dir>-<action>`; one-shots resolve when the last frame ends (or at once if the sheet lacks the label). */
  play(action: number, loop = false): Promise<void> {
    const anim = this.anim;
    if (!anim) return Promise.resolve();
    anim.onComplete = null;
    anim.loop = loop;
    if (!anim.playDir(this.dir, action, true)) {
      anim.loop = true;
      anim.playDir(this.dir, Action.STAND, true);
      return Promise.resolve();
    }
    if (loop) return Promise.resolve();
    return new Promise<void>((resolve) => {
      anim.onComplete = () => {
        anim.onComplete = null;
        resolve();
      };
    });
  }

  /** Keeps the last frame of a finished one-shot (the dead pose) instead of going back to stand. */
  hold(): void {
    if (this.anim) this.anim.loop = false;
  }

  /** Runs toward (tx, ty) and stops `stopShort` px away, at battle run speed. */
  runToward(tx: number, ty: number, stopShort = CLOSE_TO): Promise<void> {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= stopShort) return Promise.resolve();
    const k = (dist - stopShort) / dist;
    return this.runTo(this.x + dx * k, this.y + dy * k);
  }

  runTo(x: number, y: number): Promise<void> {
    void this.play(Action.RUN, true);
    return new Promise<void>((resolve) => {
      this.goal = { x, y, done: resolve };
    });
  }

  fadeOut(ms: number): void {
    this.fade = { left: ms, total: ms };
  }

  /** Back to the slot with the stand pose and default facing (a dead unit stays as it is). */
  reset(): void {
    this.goal = null;
    this.position.set(this.homeX, this.homeY);
    this.dir = defaultDir(this.slot);
    if (this.hp > 0) this.stand();
  }

  tick(dt: number): void {
    this.anim?.tick(dt);
    if (this.goal) {
      const dx = this.goal.x - this.x;
      const dy = this.goal.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = RUN_SPEED * dt;
      if (dist <= step) {
        this.position.set(this.goal.x, this.goal.y);
        const done = this.goal.done;
        this.goal = null;
        done();
      } else {
        this.position.set(this.x + (dx / dist) * step, this.y + (dy / dist) * step);
      }
    }
    if (this.fade) {
      this.fade.left -= dt * 1000;
      this.alpha = Math.max(0, this.fade.left / this.fade.total);
    }
    this.zIndex = this.y;
  }
}
