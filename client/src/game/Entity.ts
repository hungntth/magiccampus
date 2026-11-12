// A player or NPC on the map. The sprite is an AvatarView (body / weapon / flyer / mount layers from the converted SWF sheets, 8
// directions); without a sheet the portrait icon + marker shows instead. Linear interpolation along a route; direction / behavior
// switch automatically while moving. Flying (M13): the body lifts FLIGHT_HEIGHT px with a tween and the flyer layers show.

import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { FLIGHT_HEIGHT, FLIGHT_LIFT_PX_PER_SEC, FLYING_STATE, type FlyingState, type SceneCharacter } from '@mc/shared';
import { iconUrl } from '../assets';
import { AvatarView, sheetNameFromResCode } from './AvatarView';
import { Behavior, dirFromDelta } from './SheetAnim';
import { CHAR_SELECTED_GLOW } from './GlowFilter';
import { EntityLabels, type TitleLabel } from './EntityLabels';

const MOVE_SPEED = 220;
// Speech bubble = legacy PopupText: 100px wrap, 80-char cap (CHAT_POPUP_MAXCHAR), hides after 5 s.
const BUBBLE_MS = 5000;
const BUBBLE_WRAP = 100;
const BUBBLE_MAX_CHARS = 80;
const BUBBLE_EDGE = 0xff9900;
const BUBBLE_FILL = 0xffff65;

// Flash TextField default format (Times New Roman 12, black).
const bubbleStyle = new TextStyle({
  fontFamily: '"Times New Roman", serif',
  fontSize: 12,
  fill: '#000000',
  align: 'center',
  wordWrap: true,
  wordWrapWidth: BUBBLE_WRAP,
  breakWords: true,
});

const markerStyle = (fill: string): TextStyle =>
  new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 22, fontWeight: '700', fill, stroke: { color: '#000000', width: 4 } });

// H5 placeholder for the Flash STATE_ICON art (not in the dump): 102 '!', 103 grey '?', 104 yellow '?'.
const QUEST_MARKERS: Record<number, { text: string; style: TextStyle }> = {
  102: { text: '!', style: markerStyle('#ffd23f') },
  103: { text: '?', style: markerStyle('#b0b6c2') },
  104: { text: '?', style: markerStyle('#ffd23f') },
};

export type EntityKind = 'self' | 'player' | 'npc';

// Name colors: players CreatureView 0xFFFF00, NPCs NPCView 13434828 (0xCCFFCC).
const NAME_COLOR: Record<EntityKind, string> = { self: '#ffff00', player: '#ffff00', npc: '#ccffcc' };

export { sheetNameFromResCode };

export class Entity extends Container {
  private route: { x: number; y: number }[] = [];
  private onArrive: (() => void) | null = null;
  /** Layered body / weapon / flyer / mount sprite. */
  readonly avatar: AvatarView;
  private fallback: Container;
  private marker: Graphics;
  private readonly labels: EntityLabels;
  /** Name shown in the label (changes with the rename card). */
  displayName: string;
  /** Top of the sprite relative to the feet; bubbles and quest markers sit above it. */
  private headY = -44;
  dir = 0;
  private behavior: number = Behavior.STAND;
  private bubble: Container | null = null;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private questMarker: Text | null = null;
  /** Last QuestState passed to setQuestState (-1 none); the area map picks its NPC icon from it. */
  questState = -1;
  private leaderFlag: Text | null = null;
  private baseIcon = '';
  private portraitLoaded = false;
  /** Flying state (Flash FLYING_STATE_*) and the current body lift in px (0..FLIGHT_HEIGHT). */
  private flyState: FlyingState = FLYING_STATE.ON_GROUND;
  private lift = 0;
  /** Fires on every flying state change (the HUD button of the local player). */
  onFlyingState: ((state: FlyingState) => void) | null = null;

  constructor(
    readonly entityId: number,
    readonly kind: EntityKind,
    displayName: string,
    iconCode: string,
    resCode: string,
    x: number,
    y: number,
    dir = 0,
    readonly npcType = 0,
  ) {
    super();
    this.position.set(x, y);
    this.dir = dir;
    const color = kind === 'self' ? 0xe0a944 : kind === 'npc' ? 0x4ba3e3 : 0x8fd18f;

    const shadow = new Graphics().ellipse(0, 0, 18, 8).fill({ color: 0x000000, alpha: 0.35 });
    shadow.eventMode = 'none';
    this.addChild(shadow);

    this.avatar = new AvatarView((headY) => this.onBody(headY));
    this.addChild(this.avatar);

    this.fallback = new Container();
    this.marker = new Graphics().circle(0, -22, 16).fill({ color, alpha: 0.9 }).stroke({ color: 0x000000, width: 2 });
    this.fallback.addChild(this.marker);
    this.addChild(this.fallback);

    this.displayName = displayName;
    this.labels = new EntityLabels(displayName, NAME_COLOR[kind]);
    this.addChild(this.labels);

    if (kind !== 'self') {
      this.eventMode = 'static';
      this.cursor = 'pointer';
      // Legacy CreatureView mouseOver/mouseOut: white glow on the sprite only (not the name label).
      this.on('pointerover', () => this.setHover(true));
      this.on('pointerout', () => this.setHover(false));
    }

    this.baseIcon = iconCode;
    this.avatar.setBody(resCode, 'class', resCode);
    if (!sheetNameFromResCode(resCode)) this.onBody(null); // no sheet at all: portrait marker
  }

  /** Full look of a scene row (self / peers / scene re-entry): body, weapon, flyer, mount and the flying flag (no tween). */
  applyScene(sc: Pick<SceneCharacter, 'resCode' | 'wp' | 'av'>): void {
    const av = sc.av;
    this.avatar.setBody(av?.res ?? sc.resCode, av?.body ?? 'class', av?.base ?? sc.resCode);
    this.avatar.setWeapon(av?.wp ?? sc.wp);
    this.avatar.setFlyer(av?.flyer, av?.flyerFront);
    this.avatar.setMount(av?.mount);
    this.avatar.setWing(av?.wing);
    this.avatar.setDeco(av?.deco);
    if (av?.flying) this.beginFlight(true);
    else this.endFlight(true);
  }

  private onBody(headY: number | null): void {
    if (headY === null) {
      this.fallback.visible = true;
      if (!this.portraitLoaded) {
        this.portraitLoaded = true;
        void this.loadPortrait(this.baseIcon);
      }
      return;
    }
    this.fallback.visible = false;
    this.headY = headY;
    this.layoutMarker();
  }

  get flyingState(): FlyingState {
    return this.flyState;
  }

  /** Current body lift in px (0 on the ground, FLIGHT_HEIGHT in the air); the guarding fairy follows it. */
  get liftPx(): number {
    return this.lift;
  }

  /** True while taking off or in the air: moves ignore the hit mask. */
  get airborne(): boolean {
    return this.flyState === FLYING_STATE.TAKING_OFF || this.flyState === FLYING_STATE.IN_THE_AIR;
  }

  /** Straight-line routes: in the air, and while walking to the cell to land on (the start may be off the mask). */
  get freeFlight(): boolean {
    return this.airborne || this.flyState === FLYING_STATE.PRE_LANDING;
  }

  setFlyingState(state: FlyingState): void {
    if (this.flyState === state) return;
    this.flyState = state;
    this.avatar.setAirborne(state !== FLYING_STATE.ON_GROUND);
    this.onFlyingState?.(state);
  }

  /** onBeginFlying (tween up) or a scene row of a character already airborne (`instant`). */
  beginFlight(instant = false): void {
    if (instant) {
      this.lift = FLIGHT_HEIGHT;
      this.setFlyingState(FLYING_STATE.IN_THE_AIR);
      this.applyLift();
    } else if (!this.airborne) {
      this.setFlyingState(FLYING_STATE.TAKING_OFF);
    }
  }

  /** onStopFlying (tween down) or an instant landing (`instant`: scene entry on the ground). */
  endFlight(instant = false): void {
    if (this.flyState === FLYING_STATE.ON_GROUND) return;
    if (instant) {
      this.lift = 0;
      this.setFlyingState(FLYING_STATE.ON_GROUND);
      this.applyLift();
    } else {
      this.setFlyingState(FLYING_STATE.LANDING);
    }
  }

  private applyLift(): void {
    this.avatar.y = -this.lift;
    this.labels.y = -this.lift;
    this.layoutMarker();
  }

  private tickFlight(dt: number): void {
    if (this.flyState === FLYING_STATE.TAKING_OFF) {
      this.lift = Math.min(FLIGHT_HEIGHT, this.lift + FLIGHT_LIFT_PX_PER_SEC * dt);
      if (this.lift >= FLIGHT_HEIGHT) this.setFlyingState(FLYING_STATE.IN_THE_AIR);
    } else if (this.flyState === FLYING_STATE.LANDING) {
      this.lift = Math.max(0, this.lift - FLIGHT_LIFT_PX_PER_SEC * dt);
      if (this.lift <= 0) this.setFlyingState(FLYING_STATE.ON_GROUND);
    } else {
      return;
    }
    this.applyLift();
  }

  /**
   * Speech bubble above the name label (legacy CreatureView.onSay → PopupText), used for local chat, NPC
   * greetings and quest texts alike; empty text shows nothing.
   */
  say(text: string): void {
    this.clearBubble();
    if (!text.trim() || this.destroyed) return;
    const shown = text.length > BUBBLE_MAX_CHARS ? `${text.slice(0, BUBBLE_MAX_CHARS)}...` : text;
    const label = new Text({ text: shown, style: bubbleStyle });
    // PopupText geometry: text box (tw×th, 2px gutter) centred on x=0, a 2px orange rim around a yellow
    // fill, and an orange tail hanging under the left edge.
    const tw = label.width + 4;
    const th = label.height + 4;
    const tx = -tw / 2;
    label.position.set(tx + 2, 2);
    const bg = new Graphics()
      .roundRect(tx - 5, -5, tw + 10, th + 10, 2)
      .fill(BUBBLE_EDGE)
      .roundRect(tx - 3, -3, tw + 6, th + 6, 2)
      .fill(BUBBLE_FILL)
      .poly([tx + 3, th + 5, tx + 8, th + 12, tx + 10, th + 5])
      .fill(BUBBLE_EDGE);
    const bubble = new Container();
    bubble.addChild(bg, label);
    bubble.eventMode = 'none';
    const above = Math.max(this.questMarker?.height ?? 0, this.leaderFlag?.height ?? 0);
    bubble.position.set(0, this.headY - this.lift - above - 2 - (th + 12));
    this.addChild(bubble);
    this.bubble = bubble;
    this.bubbleTimer = setTimeout(() => this.clearBubble(), BUBBLE_MS);
  }

  /** Quest marker above the head (QuestState 102/103/104); any other value hides it. */
  setQuestState(state: number): void {
    this.questState = state;
    this.questMarker?.destroy();
    this.questMarker = null;
    const m = QUEST_MARKERS[state];
    if (!m || this.destroyed) return;
    this.questMarker = new Text({ text: m.text, style: m.style });
    this.questMarker.anchor.set(0.5, 1);
    this.questMarker.eventMode = 'none';
    this.addChild(this.questMarker);
    this.layoutMarker();
  }

  /** Party leader flag above the head (legacy UI_LEADER_FLAG; H5 draws a crown). */
  setLeaderFlag(on: boolean): void {
    if (on === (this.leaderFlag !== null) || this.destroyed) return;
    this.leaderFlag?.destroy();
    this.leaderFlag = null;
    if (on) {
      this.leaderFlag = new Text({ text: '♛', style: markerStyle('#ffd23f') });
      this.leaderFlag.anchor.set(0.5, 1);
      this.leaderFlag.eventMode = 'none';
      this.addChild(this.leaderFlag);
    }
    this.layoutMarker();
  }

  private layoutMarker(): void {
    this.questMarker?.position.set(0, this.headY - this.lift - 2);
    this.leaderFlag?.position.set(0, this.headY - this.lift - 2);
  }

  /** Name / title lines on or off (system setting "Ẩn tên", M9). */
  showLabels(on: boolean): void {
    this.labels.visible = on;
  }

  setName(name: string): void {
    this.displayName = name;
    this.labels.setName(name);
  }

  /**
   * Permanent title (line above the name) and active/temporary title (line below it); null hides a line.
   * Not fed by the server yet (no title data ported); legacy fields are `t` and `actT` (data_tbl_title ids).
   */
  setTitles(title: TitleLabel | null, actTitle: TitleLabel | null): void {
    this.labels.setTitles(title, actTitle);
  }

  private clearBubble(): void {
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    this.bubble?.destroy({ children: true });
    this.bubble = null;
  }

  private setHover(on: boolean): void {
    this.avatar.setHover(on);
    this.fallback.filters = on ? [CHAR_SELECTED_GLOW] : [];
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    super.destroy(options);
  }

  private async loadPortrait(iconCode: string): Promise<void> {
    if (!iconCode || iconCode === '0') return;
    try {
      const texture = (await Assets.load<Texture>({ src: iconUrl(iconCode), loadParser: 'loadTextures' })) as Texture;
      if (this.destroyed) return;
      const sprite = new Sprite(texture);
      const size = 40;
      const scale = size / Math.max(texture.width, texture.height);
      sprite.scale.set(scale);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(0, -4);
      const mask = new Graphics().roundRect(-size / 2, -4 - size, size, size, 6).fill(0xffffff);
      sprite.mask = mask;
      this.fallback.addChild(mask, sprite);
      this.marker.visible = false;
    } catch {
      /* keep marker */
    }
  }

  private applyAnim(restart = false): void {
    this.avatar.play(this.dir, this.behavior, restart);
  }

  setBehavior(behavior: number): void {
    if (this.behavior === behavior) return;
    this.behavior = behavior;
    this.applyAnim(true);
  }

  face(dir: number): void {
    if (this.dir === dir) return;
    this.dir = dir;
    this.applyAnim();
  }

  moveAlong(route: number[][], onArrive?: () => void): void {
    this.route = route.map(([x, y]) => ({ x, y }));
    this.onArrive = onArrive ?? null;
    if (this.route.length > 0) {
      this.face(dirFromDelta(this.route[0].x - this.x, this.route[0].y - this.y, this.dir));
      this.setBehavior(Behavior.RUN);
    }
  }

  teleport(x: number, y: number): void {
    this.route = [];
    this.position.set(x, y);
    this.setBehavior(Behavior.STAND);
  }

  get moving(): boolean {
    return this.route.length > 0;
  }

  tick(dtSeconds: number): void {
    let budget = MOVE_SPEED * dtSeconds;
    while (budget > 0 && this.route.length > 0) {
      const target = this.route[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        this.position.set(target.x, target.y);
        this.route.shift();
        budget -= dist;
        if (this.route.length === 0) {
          this.setBehavior(Behavior.STAND);
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        } else {
          this.face(dirFromDelta(this.route[0].x - this.x, this.route[0].y - this.y, this.dir));
        }
      } else {
        this.position.set(this.x + (dx / dist) * budget, this.y + (dy / dist) * budget);
        budget = 0;
      }
    }
    this.tickFlight(dtSeconds);
    this.avatar.tick(dtSeconds);
    this.zIndex = this.y;
  }
}
