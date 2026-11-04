// The map sprite of a following pet (legacy PetView): creature sheet from the pet's resCode, shadow and name line.
// Client simulated: PetLayer feeds it the owner's position each tick; there are no movement pushes for pets.

import { Container, Graphics } from 'pixi.js';
import type { PetSceneView } from '@mc/shared';
import { sheetNameFromResCode } from './Entity';
import { EntityLabels } from './EntityLabels';
import { Behavior, SheetAnim, dirFromDelta, loadSheet } from './SheetAnim';
import { petFollowStep, type Point } from './petFollow';

export class PetFollower extends Container {
  private anim: SheetAnim | null = null;
  private dir = 0;
  private behavior: number = Behavior.STAND;

  constructor(readonly ownerId: number, readonly data: PetSceneView, x: number, y: number, dir: number) {
    super();
    this.position.set(x, y);
    this.dir = dir;
    this.eventMode = 'none';
    this.addChild(new Graphics().ellipse(0, 0, 16, 7).fill({ color: 0x000000, alpha: 0.35 }));
    this.addChild(new EntityLabels(data.name, '#ffff00'));
    void this.loadSheet(data.resCode);
  }

  private async loadSheet(resCode: string): Promise<void> {
    const name = sheetNameFromResCode(resCode);
    const sheet = name ? await loadSheet(name) : null;
    if (this.destroyed || !sheet || Object.keys(sheet.data.anims).length === 0) return;
    const anim = new SheetAnim(sheet);
    const { width, height, meta } = sheet.data;
    anim.position.set(-(meta?.midX ?? width / 2), -(meta?.footY ?? height - 8));
    this.anim = anim;
    this.addChildAt(anim, 1);
    this.applyAnim(true);
  }

  /** Chases the owner when further than the follow radius; faces the walking direction. */
  tick(dt: number, owner: Point): void {
    const next = petFollowStep(this, owner, dt);
    const behavior = next.moved ? Behavior.RUN : Behavior.STAND;
    if (next.moved) {
      this.dir = dirFromDelta(next.x - this.x, next.y - this.y, this.dir);
      this.position.set(next.x, next.y);
    }
    if (behavior !== this.behavior) {
      this.behavior = behavior;
      this.applyAnim(true);
    } else if (next.moved) {
      this.applyAnim();
    }
    this.anim?.tick(dt);
    this.zIndex = this.y;
  }

  private applyAnim(restart = false): void {
    const a = this.anim;
    if (!a) return;
    if (!a.playDir(this.dir, this.behavior, restart) && !a.playDir(this.dir, Behavior.STAND, restart)) a.play(a.firstLabel, restart);
  }
}
