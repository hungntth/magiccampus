// Following pets on the map (pets phase B): one PetFollower per owner, created from scene payloads (showPetObj) and the
// onCreatePet / onCancelPet pushes, removed when the owner leaves. Spawns behind the owner by facing.

import type { Container } from 'pixi.js';
import type { OnCreatePetPush, PetSceneView, SceneCharacter } from '@mc/shared';
import type { GameClient } from '../net/client';
import { PetFollower } from './PetFollower';
import { petSpawnPos, type Point } from './petFollow';

export interface PetOwner extends Point {
  dir: number;
}

export class PetLayer {
  private readonly pets = new Map<number, PetFollower>();
  private readonly offs: (() => void)[];

  constructor(
    client: GameClient,
    private readonly layer: Container,
    private readonly ownerOf: (id: number) => PetOwner | undefined,
  ) {
    this.offs = [
      client.on('onCreatePet', (d) => this.set((d as OnCreatePetPush).cid, (d as OnCreatePetPush).petData)),
      client.on('onCancelPet', (cid) => this.remove(Number(cid))),
      client.on('onScenePlayerLeft', (cid) => this.remove(Number(cid))),
    ];
  }

  /** Scene payload entry (self, createChars, onScenePlayerEntered): shows the pet if the owner carries one. */
  fromScene(sc: SceneCharacter): void {
    if (sc.showPetObj) this.set(sc.id, sc.showPetObj);
  }

  /** Replaces the owner's pet; ignored while the owner is not on this map view. */
  set(ownerId: number, data: PetSceneView): void {
    this.remove(ownerId);
    const owner = this.ownerOf(ownerId);
    if (!owner) return;
    const at = petSpawnPos(owner, owner.dir);
    const pet = new PetFollower(ownerId, data, at.x, at.y, owner.dir);
    this.pets.set(ownerId, pet);
    this.layer.addChild(pet);
  }

  remove(ownerId: number): void {
    this.pets.get(ownerId)?.destroy({ children: true });
    this.pets.delete(ownerId);
  }

  has(ownerId: number): boolean {
    return this.pets.has(ownerId);
  }

  clear(): void {
    for (const p of this.pets.values()) p.destroy({ children: true });
    this.pets.clear();
  }

  tick(dt: number): void {
    for (const [id, pet] of this.pets) {
      const owner = this.ownerOf(id);
      if (owner) pet.tick(dt, owner);
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.clear();
  }
}
