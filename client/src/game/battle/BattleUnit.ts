// One combatant on the battle stage: sheet animation (stand / run / attack / hurt / dead ...), name under the feet,
// legacy PropBar HP bar above the head (own side: HP/MP/SP stacked), run-to-target and fade tweens. Driven by BattleStage.tick(dt); one-shot actions resolve their promise when they finish.

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BattleParticipantType, type BattleParticipant } from '@mc/shared';
import { SheetAnim, loadSheet } from '../SheetAnim';
import { sheetNameFromResCode } from '../Entity';
import { viewSlot } from '@mc/shared';
import { Action, CLOSE_TO, RUN_SPEED, SLOT_POS, defaultDir, isEnemySlot } from './slots';
import { BuffBar } from './buffBar';

// Legacy PropBar: 50x4 bar, #333 back, 1 px black line around a #ddd frame at (-1, -2, w + 2, h + 3); each next bar sits at
// y + height - 1.
const BAR_W = 50;
const BAR_H = 4;
const BAR_STEP = BAR_H + 3 - 1;
// GamePredef PROPERTY_COLOR_HP / _MP / _SP.
const COLOR_HP = 0xff0000;
const COLOR_MP = 0x3333aa;
const COLOR_SP = 0xffff00;
const NAME_Y = 10; // CreatureView _textName.y: the name sits just under the feet
const nameStyle = (fill: string): TextStyle =>
  new TextStyle({
    fontFamily: 'Tahoma, Verdana, sans-serif',
    fontSize: 12,
    fill,
    stroke: { color: '#000000', width: 3, join: 'round' },
  });

export class BattleUnit extends Container {
  readonly slot: number;
  /** Where the unit is drawn: the slot itself, or the mirrored one for a `guest` client (PvP target). */
  readonly viewSlot: number;
  readonly enemy: boolean;
  readonly isPet: boolean;
  readonly level: number;
  /** Creature template id (type-1 participants; character id for players). */
  readonly refId: number;
  /** 1 boss (red name), 2 elite (green name). */
  readonly bossFlag: number;
  readonly homeX: number;
  readonly homeY: number;
  hp: number;
  mp: number;
  readonly hpMax: number;
  readonly mpMax: number;
  private readonly sp: number;
  private readonly spMax: number;
  dir: number;
  /** Top of the sprite relative to the feet (negative); bars and popups sit above it. */
  headY = -60;
  private anim: SheetAnim | null = null;
  /** Weapon in hand (characters, BattleParticipant.wp): same labels and frame timings as the body, played in lockstep. */
  private weapon: SheetAnim | null = null;
  private readonly body = new Container();
  private readonly bars = new Graphics();
  private readonly nameText: Text;
  private readonly isSelf: boolean;
  private waitIcon: Text | null = null;
  /** M10 E2: buff icons (sSObj / tSObj buffAdd, buffDel, buffClear). */
  readonly buffs = new BuffBar();
  private goal: { x: number; y: number; done: () => void } | null = null;
  private fade: { left: number; total: number; in?: boolean } | null = null;

  /** `selfId`: the local character id; in a group battle only that unit shows the MP / SP bars (teammates show HP only). */
  constructor(p: BattleParticipant, selfId?: number, guest = false) {
    super();
    this.slot = p.battleId;
    this.viewSlot = viewSlot(p.battleId, guest);
    this.enemy = isEnemySlot(this.viewSlot);
    this.isPet = p.type === BattleParticipantType.PET;
    this.level = p.level;
    this.refId = p.id;
    this.bossFlag = p.bossFlag;
    // The local character shows HP/MP/SP, its pet HP/MP (teammates and their pets: HP only).
    this.isSelf = selfId === undefined || (this.isPet ? p.cid === selfId : p.type === BattleParticipantType.CHARACTER && p.id === selfId);
    const home = SLOT_POS[this.viewSlot] ?? { x: 450, y: 285 };
    this.homeX = home.x;
    this.homeY = home.y;
    this.position.set(home.x, home.y);
    this.hp = p.hp;
    this.mp = p.mp;
    this.hpMax = Math.max(1, p.hpMax);
    this.mpMax = Math.max(1, p.mpMax);
    this.sp = p.sp;
    this.spMax = p.spMax;
    this.dir = defaultDir(this.viewSlot);

    const shadow = new Graphics().ellipse(0, 0, 22, 9).fill({ color: 0x000000, alpha: 0.35 });
    // Placeholder until the sheet loads (or when there is none).
    this.body.addChild(new Graphics().circle(0, -26, 18).fill({ color: this.enemy ? 0xc0504d : 0x4ba3e3, alpha: 0.9 }));
    const shown = p.type === BattleParticipantType.CREATURE ? p.name.split('【')[0] : p.name;
    const color = p.bossFlag === 1 ? '#ff0000' : p.bossFlag === 2 ? '#00ff00' : this.enemy ? '#ffffff' : '#ffff00';
    this.nameText = new Text({ text: shown, style: nameStyle(color) });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(0, NAME_Y);
    this.addChild(shadow, this.body, this.bars, this.nameText, this.buffs);
    this.eventMode = 'none';
    void this.load(p.resCode, p.type === BattleParticipantType.CHARACTER ? p.wp : undefined);
    this.layout();
  }

  private async load(resCode: string, wp: string | undefined): Promise<void> {
    const sheetName = sheetNameFromResCode(resCode);
    const wpName = wp ? sheetNameFromResCode(wp) : null;
    const [sheet, wpSheet] = await Promise.all([sheetName ? loadSheet(sheetName) : null, wpName ? loadSheet(wpName) : null]);
    if (this.destroyed || !sheet || Object.keys(sheet.data.anims).length === 0) return;
    const anim = new SheetAnim(sheet);
    const { width, height, meta } = sheet.data;
    const footY = meta?.footY ?? height - 8;
    anim.position.set(-(meta?.midX ?? width / 2), -footY);
    this.anim = anim;
    for (const c of this.body.removeChildren()) c.destroy();
    this.body.addChild(anim);
    if (wpSheet) {
      const w = new SheetAnim(wpSheet);
      const d = wpSheet.data;
      w.position.set(-(d.meta?.midX ?? d.width / 2), -(d.meta?.footY ?? d.height - 8));
      this.weapon = w;
      this.body.addChild(w);
    }
    this.headY = (meta?.bodyY ?? meta?.headY ?? 0) - footY - 4;
    this.stand();
    this.layout();
  }

  /** Bar stack from headY - 10 downward (legacy _barContainer.y); enemies show HP only, the own character HP/MP/SP. */
  private layout(): void {
    this.buffs.position.set(0, this.headY - 14);
    this.bars.clear();
    const rows: [number, number, number][] = [[this.hp, this.hpMax, COLOR_HP]];
    if (this.isSelf) {
      rows.push([this.mp, this.mpMax, COLOR_MP]);
      if (this.spMax > 0 && !this.isPet) rows.push([this.sp, this.spMax, COLOR_SP]);
    }
    const x = -BAR_W / 2;
    let y = this.headY - 10;
    for (const [v, max, color] of rows) {
      this.bars.rect(x - 1, y - 2, BAR_W + 2, BAR_H + 3).fill(0xdddddd).stroke({ color: 0x000000, width: 1 });
      this.bars.rect(x, y, BAR_W, BAR_H).fill(0x333333);
      const w = Math.round((BAR_W * Math.max(0, Math.min(max, v))) / max);
      if (w > 0) this.bars.rect(x, y, w, BAR_H).fill(color);
      y += BAR_STEP;
    }
  }

  /** Group battles: the "waiting for a command" bubble over a player character (BattleCreatureView.showWaitIcon). */
  setWait(on: boolean): void {
    if (!on) {
      this.waitIcon?.destroy();
      this.waitIcon = null;
      return;
    }
    if (this.waitIcon || this.hp <= 0) return;
    const icon = new Text({ text: '...', style: new TextStyle({ fontFamily: 'Tahoma, Verdana, sans-serif', fontSize: 18, fontWeight: '900', fill: '#ffffff', stroke: { color: '#000000', width: 4 } }) });
    icon.anchor.set(0.5, 1);
    icon.position.set(0, this.headY - 14);
    this.waitIcon = icon;
    this.addChild(icon);
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
      this.syncWeapon();
      return Promise.resolve();
    }
    this.syncWeapon();
    if (loop) return Promise.resolve();
    return new Promise<void>((resolve) => {
      anim.onComplete = () => {
        anim.onComplete = null;
        resolve();
      };
    });
  }

  /** Restarts the weapon on the body's label and loop flag (same frame timings, so both stay on the same frame). */
  private syncWeapon(): void {
    if (!this.anim || !this.weapon) return;
    this.weapon.loop = this.anim.loop;
    this.weapon.visible = this.weapon.play(this.anim.currentLabel, true);
  }

  /** Keeps the last frame of a finished one-shot (the dead pose) instead of going back to stand. */
  hold(): void {
    if (this.anim) this.anim.loop = false;
    if (this.weapon) this.weapon.loop = false;
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

  /** M10 E2.2 BH_SUMMONED (18000): a new unit fades in over `ms` while standing. */
  fadeIn(ms: number): void {
    this.alpha = 0;
    void this.play(Action.STAND, true);
    this.fade = { left: ms, total: ms, in: true };
  }

  /** Back to the slot with the stand pose and default facing (a dead unit stays as it is). */
  reset(): void {
    this.goal = null;
    this.position.set(this.homeX, this.homeY);
    this.dir = defaultDir(this.viewSlot);
    if (this.hp > 0) this.stand();
  }

  tick(dt: number): void {
    this.anim?.tick(dt);
    this.weapon?.tick(dt);
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
      const k = Math.max(0, this.fade.left / this.fade.total);
      this.alpha = this.fade.in ? 1 - k : k;
      if (this.fade.in && k === 0) this.fade = null;
    }
    this.zIndex = this.y;
  }
}
