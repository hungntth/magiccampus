// Guarding Tiểu Tinh Linh sprites on the map (legacy CreatureView.fairyOn / FairyView): one FairyFollower per owner from the scene rows
// (`av.fairy`) and the onFairyOn {cid, fairy:{resCode}} / onFairyOff(cid) pushes (self included), removed when the owner leaves.
// The art is a creature sheet (NPC_CRE_3000NN); a missing sheet keeps the state and draws nothing (logged once per art).

import { Container } from 'pixi.js';
import type { FairyOnPush, SceneCharacter } from '@mc/shared';
import type { GameClient } from '../net/client';
import { sheetNameFromResCode } from './AvatarView';
import { fairyFollowStep, fairyInFront, FAIRY_FACE_OWNER_DIST } from './fairyFollow';
import { Behavior, SheetAnim, dirFromDelta, loadSheet } from './SheetAnim';

export interface FairyOwner {
  x: number;
  y: number;
  dir: number;
  visible: boolean;
  /** Body lift while flying (the fairy flies along, FairyView.isFlying). */
  liftPx: number;
}

const missingLogged = new Set<string>();
const isNone = (res: string | undefined): boolean => !res || res === '0' || res === '-1';

class FairyFollower extends Container {
  private anim: SheetAnim | null = null;
  private dir: number;

  constructor(readonly res: string, x: number, y: number, dir: number) {
    super();
    this.position.set(x, y);
    this.dir = dir;
    this.eventMode = 'none';
    void this.load();
  }

  private async load(): Promise<void> {
    const name = sheetNameFromResCode(this.res);
    const sheet = name ? await loadSheet(name) : null;
    if (this.destroyed) return;
    if (!sheet || Object.keys(sheet.data.anims).length === 0) {
      if (!missingLogged.has(this.res)) {
        missingLogged.add(this.res);
        console.warn(`[fairy] no sheet for art ${this.res} (${name ?? 'unknown code'})`);
      }
      return;
    }
    const anim = new SheetAnim(sheet);
    const { width, height, meta } = sheet.data;
    anim.position.set(-(meta?.midX ?? width / 2), -(meta?.footY ?? height - 8));
    this.anim = anim;
    this.addChild(anim);
    this.face(this.dir, true);
  }

  private face(dir: number, force = false): void {
    if (dir === this.dir && !force) return;
    this.dir = dir;
    const a = this.anim;
    if (!a) return;
    // The fairy only breathes (FairyView never changes its behavior); dir 0 clips may sit under their Chinese names.
    if (!a.playDir(dir, Behavior.STAND, true) && !(dir === 0 && a.play(a.orderLabel(0), true))) a.play(a.firstLabel, true);
  }

  tick(dt: number, owner: FairyOwner): void {
    const target = { x: owner.x, y: owner.y - owner.liftPx };
    const next = fairyFollowStep(this, target, dt);
    const moved = next.x !== this.x || next.y !== this.y;
    if (next.dist > FAIRY_FACE_OWNER_DIST && moved) this.face(dirFromDelta(next.x - this.x, next.y - this.y, this.dir));
    else this.face(owner.dir);
    this.position.set(next.x, next.y);
    this.visible = owner.visible;
    // Depth against the owner (zIndex = foot y), not its own lifted y.
    this.zIndex = owner.y + (fairyInFront(owner.dir) ? 0.5 : -0.5);
    this.anim?.tick(dt);
  }
}

export class FairyLayer {
  private readonly fairies = new Map<number, FairyFollower>();
  private readonly offs: (() => void)[];

  constructor(
    client: GameClient,
    private readonly layer: Container,
    private readonly ownerOf: (id: number) => FairyOwner | undefined,
  ) {
    this.offs = [
      client.on('onFairyOn', (d) => {
        const p = d as FairyOnPush;
        this.set(Number(p.cid), String(p.fairy?.resCode ?? ''));
      }),
      client.on('onFairyOff', (cid) => this.remove(Number(cid))),
      client.on('onScenePlayerLeft', (cid) => this.remove(Number(cid))),
    ];
  }

  /** Scene row (self, createChars, onScenePlayerEntered): the guarding fairy art or none. */
  fromScene(sc: Pick<SceneCharacter, 'id' | 'av'>): void {
    this.set(sc.id, sc.av?.fairy ?? '');
  }

  /** Shows `res` beside the owner (same art keeps the sprite); empty / '0' removes it. */
  set(ownerId: number, res: string): void {
    if (isNone(res)) return this.remove(ownerId);
    if (this.fairies.get(ownerId)?.res === res) return;
    this.remove(ownerId);
    const owner = this.ownerOf(ownerId);
    if (!owner) return;
    const f = new FairyFollower(res, owner.x, owner.y - owner.liftPx, owner.dir);
    this.fairies.set(ownerId, f);
    this.layer.addChild(f);
  }

  remove(ownerId: number): void {
    this.fairies.get(ownerId)?.destroy({ children: true });
    this.fairies.delete(ownerId);
  }

  /** Art shown for an owner ('' = none); used by tests and the panel. */
  artOf(ownerId: number): string {
    return this.fairies.get(ownerId)?.res ?? '';
  }

  clear(): void {
    for (const f of this.fairies.values()) f.destroy({ children: true });
    this.fairies.clear();
  }

  tick(dt: number): void {
    for (const [id, f] of this.fairies) {
      const owner = this.ownerOf(id);
      if (owner) f.tick(dt, owner);
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.clear();
  }
}
