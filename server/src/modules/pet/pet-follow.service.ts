// Pet map follow (phase B): startPetFollow / cancelPetFollow state, the map broadcast (onCancelPet then onCreatePet, owner
// included) and the scene payload decoration (showPetId / showPetObj). Following persists in the pet row (H5: survives
// portals and relog). Mutations run under withCharLock; broadcast() is also called by PetService (which holds the lock).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { OnCreatePetPush, SceneCharacter } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { Pet } from './pet.schema';
import { petShownOnMap } from './pet-rules';
import { petSceneView } from './pet-view';

@Injectable()
export class PetFollowService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly scenes: SceneManager,
    private readonly gameData: GameDataService,
  ) {}

  /** startPetFollow(petId, currentShowPetId): one following pet per character; `state` is untouched. */
  start(characterId: number, petId: number): Promise<true> {
    return withCharLock(characterId, async () => {
      const row = await this.pets.findOne({ _id: petId, characterId }).lean();
      if (!row) throw RpcException.notFound('Không tìm thấy pet');
      await this.pets.updateMany({ characterId, following: true, _id: { $ne: petId } }, { $set: { following: false } });
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { following: true } });
      await this.broadcast(characterId);
      return true as const;
    });
  }

  /** cancelPetFollow(showPetId): clears every following pet of the character (idempotent). */
  cancel(characterId: number): Promise<true> {
    return withCharLock(characterId, async () => {
      await this.pets.updateMany({ characterId, following: true }, { $set: { following: false } });
      this.cancelBroadcast(characterId);
      return true as const;
    });
  }

  /** onCancelPet(ownerCid), then onCreatePet when the character has a following pet; to the whole map incl. the owner. */
  async broadcast(characterId: number): Promise<void> {
    const mapId = this.scenes.findByCharacter(characterId)?.mapId;
    if (!mapId) return;
    this.scenes.broadcast(mapId, 'onCancelPet', [characterId]);
    const petData = await this.sceneViewOf(characterId);
    if (petData) this.scenes.broadcast(mapId, 'onCreatePet', [{ cid: characterId, petData } satisfies OnCreatePetPush]);
  }

  /** onCancelPet(ownerCid) to the owner's map (release of a following pet). */
  cancelBroadcast(characterId: number): void {
    const mapId = this.scenes.findByCharacter(characterId)?.mapId;
    if (mapId) this.scenes.broadcast(mapId, 'onCancelPet', [characterId]);
  }

  /** Scene payloads (createChars, onScenePlayerEntered, sceneLogin self) carry showPetId / showPetObj. */
  async decorate(sc: SceneCharacter): Promise<SceneCharacter> {
    if (!petShownOnMap(sc)) return sc;
    const petData = await this.sceneViewOf(sc.id);
    return petData ? { ...sc, showPetId: petData.id, showPetObj: petData } : sc;
  }

  async sceneViewOf(characterId: number): Promise<OnCreatePetPush['petData'] | null> {
    const row = await this.pets.findOne({ characterId, following: true }).lean();
    const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
    return row && tpl ? petSceneView(row, tpl) : null;
  }
}
