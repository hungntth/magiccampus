// Look + flying on the client (M13 phase A): pushes onEquipOn / onEquipOff (weapon dressFlag false, costume true), onSetRes, onFlyerOn,
// onMountOn / onMountOff and onBeginFlying / onStopFlying drive each Entity's AvatarView; the HUD "Bay" button / F key toggles flying
// (beginFlying; landing first walks to the nearest walkable cell, then stopFlying) and the character panel checkbox calls setDressHide.

import {
  FLIGHT_BUTTON_THROTTLE_MS, FLIGHT_FIX_INTERVAL_MS, FLIGHT_TEXT, FLYING_STATE, settingOn,
  type EquipOffPush, type EquipOnPush, type FlyerOnPush, type FlyingPush, type FlyingState, type MountOffPush, type MountOnPush, type PlayerData,
  type SetResPush,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import type { Entity } from './Entity';
import type { HitMask } from './HitMask';

export interface AppearanceHost {
  client: GameClient;
  player: PlayerData;
  entityOf(id: number): Entity | undefined;
  self(): Entity | null;
  hitMask(): HitMask | null;
  /** Walks the player in a straight / mask route to (x, y); `onArrive` runs at the end point. False when there is nowhere to go. */
  walkTo(self: Entity, x: number, y: number, onArrive?: () => void): boolean;
  /** Local player is a non-leader party member (the leader drives the flying state). */
  isFollower(): boolean;
  /** HUD fly button label: true = airborne ("Xuống"). */
  setFlyLabel(flying: boolean): void;
  /** A battle (or the revive dialog) is open: the camera zoom stays at 1. */
  inBattle(): boolean;
}

const LAND_SEARCH_RADIUS = 800;
/** Camera zoom while flying (Flash C_FLYING_ZOOM_RATE) reached over the 100 px lift (about 2.1 s); the `flyEffect` setting turns it off. */
const FLY_ZOOM = 0.7;
const FLY_ZOOM_SECONDS = 2.1;
/** Landing is retried from the air when no onStopFlying arrives (server cooldown refusal). */
const LAND_WAIT_MS = 2500;
const isNone = (res: string): boolean => res === '' || res === '0' || res === '-1';

export class AppearanceController {
  private readonly offs: (() => void)[] = [];
  private lastToggleAt = -Infinity;
  private lastFixAt = -Infinity;
  private landTimer: ReturnType<typeof setTimeout> | null = null;
  private zoom = 1;

  constructor(private readonly host: AppearanceHost) {
    const { client } = host;
    const on = (name: string, fn: (d: unknown) => void): void => void this.offs.push(client.on(name, fn));
    // Weapon (dressFlag false) is the held art; the costume flag only marks the body change that the following onSetRes applies.
    on('onEquipOn', (d) => {
      const p = d as EquipOnPush;
      if (!p.dressFlag) this.avatarOf(p.cid)?.setWeapon(String(p.resCode));
    });
    on('onEquipOff', (d) => {
      const p = d as EquipOffPush;
      if (!p.dressFlag) this.avatarOf(p.cid)?.setWeapon(null);
    });
    on('onSetRes', (d) => {
      const p = d as Partial<SetResPush> | null;
      if (!p || p.res === undefined) return;
      // Legacy pushes (VIP transform) carry no kind: a transform body.
      this.avatarOf(Number(p.id))?.setBody(String(p.res), p.body ?? 'transform');
    });
    on('onFlyerOn', (d) => {
      const p = d as FlyerOnPush;
      const res = String(p.resCode ?? '');
      this.avatarOf(p.cid)?.setFlyer(isNone(res) ? null : res, p.wavCode === undefined || isNone(String(p.wavCode)) ? null : String(p.wavCode));
    });
    on('onMountOn', (d) => this.avatarOf((d as MountOnPush).cid)?.setMount(String((d as MountOnPush).resCode)));
    on('onMountOff', (d) => this.avatarOf((d as MountOffPush).cid)?.setMount(null));
    on('onBeginFlying', (d) => this.host.entityOf(Number((d as FlyingPush).id))?.beginFlight());
    on('onStopFlying', (d) => {
      const e = this.host.entityOf(Number((d as FlyingPush).id));
      if (e === this.host.self()) this.clearLandTimer();
      e?.endFlight();
    });
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.clearLandTimer();
  }

  private avatarOf(id: number): Entity['avatar'] | undefined {
    return this.host.entityOf(Number(id))?.avatar;
  }

  /** The self entity of a fresh scene: label follows its flying state; a follower asks the leader's state once. */
  bindSelf(self: Entity): void {
    self.onFlyingState = (s: FlyingState) => this.host.setFlyLabel(s !== FLYING_STATE.ON_GROUND && s !== FLYING_STATE.LANDING);
    this.host.setFlyLabel(self.flyingState !== FLYING_STATE.ON_GROUND);
    if (this.host.isFollower()) this.fixState();
  }

  /** Camera zoom factor for this frame (1 on the ground, FLY_ZOOM while airborne when the `flyEffect` setting is on). */
  zoomStep(dt: number): number {
    const self = this.host.self();
    const air = self !== null && self.flyingState !== FLYING_STATE.ON_GROUND && self.flyingState !== FLYING_STATE.LANDING;
    const target = air && settingOn(this.host.player.interfaceData, 'flyEffect') && !this.host.inBattle() ? FLY_ZOOM : 1;
    const step = (Math.abs(Math.log(FLY_ZOOM)) / FLY_ZOOM_SECONDS) * dt;
    const cur = Math.log(this.zoom);
    const goal = Math.log(target);
    this.zoom = Math.exp(Math.abs(goal - cur) <= step ? goal : cur + Math.sign(goal - cur) * step);
    return this.zoom;
  }

  /** HUD "Bay / Xuống" button and F key (3 s client throttle, like Flash delayFlyButton). */
  toggleFlight(): void {
    const self = this.host.self();
    const now = performance.now();
    if (!self || now - this.lastToggleAt < FLIGHT_BUTTON_THROTTLE_MS) return;
    if (this.host.isFollower()) {
      toast(FLIGHT_TEXT.FOLLOW_LEADER);
      return this.fixState();
    }
    if (self.flyingState === FLYING_STATE.ON_GROUND) {
      this.lastToggleAt = now;
      void this.host.client.call('beginFlying').catch(() => undefined);
    } else if (self.flyingState === FLYING_STATE.IN_THE_AIR) {
      this.lastToggleAt = now;
      this.land(self);
    }
  }

  /** Follower: align with the leader (fixFlyState, at most every 30 s). */
  private fixState(): void {
    const now = performance.now();
    if (now - this.lastFixAt < FLIGHT_FIX_INTERVAL_MS) return;
    this.lastFixAt = now;
    void this.host.client.call('fixFlyState').catch(() => undefined);
  }

  /** PRE_LANDING: walk to the nearest walkable cell when the current one is not, then stopFlying. */
  private land(self: Entity): void {
    self.setFlyingState(FLYING_STATE.PRE_LANDING);
    const mask = this.host.hitMask();
    const target = mask ? mask.nearestWalkable(self.x, self.y, LAND_SEARCH_RADIUS) : { x: self.x, y: self.y };
    const stop = (): void => {
      void this.host.client.call('stopFlying').catch(() => undefined);
      this.clearLandTimer();
      // No onStopFlying (cooldown refusal): back in the air so the button works again.
      this.landTimer = setTimeout(() => {
        if (self.flyingState === FLYING_STATE.PRE_LANDING) self.setFlyingState(FLYING_STATE.IN_THE_AIR);
      }, LAND_WAIT_MS);
    };
    if (!target || (target.x === self.x && target.y === self.y)) return stop();
    if (!this.host.walkTo(self, target.x, target.y, stop)) stop();
  }

  private clearLandTimer(): void {
    if (this.landTimer) clearTimeout(this.landTimer);
    this.landTimer = null;
  }

  /** Character panel "Ẩn thời trang" checkbox: setDressHide(hide), then the stored flag is mirrored into the settings map. */
  setDressHide(hide: boolean, done: () => void): void {
    void this.host.client.call<boolean>('setDressHide', hide).then(
      (stored) => {
        this.host.player.interfaceData = { ...(this.host.player.interfaceData ?? {}), dressHide: stored ? 1 : 0 };
        done();
      },
      (e) => {
        toast((e as Error).message, true);
        done();
      },
    );
  }

  dressHidden(): boolean {
    return settingOn(this.host.player.interfaceData, 'dressHide');
  }
}
