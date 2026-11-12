// Pet map follow (phase B): startPetFollow / cancelPetFollow state, the map broadcast (onCancelPet then onCreatePet, owner
// included) and the scene payload decoration (showPetId / showPetObj). Following persists in the pet row (H5: survives
// portals and relog). Mutations run under withCharLock; broadcast() is also called by PetService (which holds the lock).
// Look hook (M13 G, Chân Hồn Thần Thú): PrsModule registers `setLookHook`; the equipped form id goes on the scene character
// (`prsUseId`) and its art replaces the following pet's resCode while that pet is the battle pet (Go pet SceneDTO / look.go).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PetState, type OnCreatePetPush, type SceneCharacter } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { Pet } from './pet.schema';
import { petShownOnMap } from './pet-rules';
import { petSceneView } from './pet-view';

/** Equipped look of a character's battle pet: the form id and its art (resource code string). */
export interface PetLook {
  useId: number;
  resCode: string;
}

@Injectable()
export class PetFollowService {
  private lookHook: ((characterId: number) => Promise<PetLook | null>) | null = null;

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly scenes: SceneManager,
    private readonly gameData: GameDataService,
  ) {}

  setLookHook(hook: (characterId: number) => Promise<PetLook | null>): void {
    this.lookHook = hook;
  }

  /** The equipped battle-pet look, or null (no hook / none / failure). */
  async lookOf(characterId: number): Promise<PetLook | null> {
    if (!this.lookHook) return null;
    try {
      return await this.lookHook(characterId);
    } catch {
      return null;
    }
  }

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
    const look = await this.lookOf(sc.id);
    const base = look ? { ...sc, prsUseId: look.useId } : sc;
    if (!petShownOnMap(base)) return base;
    const petData = await this.sceneViewOf(base.id, look);
    return petData ? { ...base, showPetId: petData.id, showPetObj: petData } : base;
  }

  /** `look` undefined = fetch it here; null = none. */
  async sceneViewOf(characterId: number, look?: PetLook | null): Promise<OnCreatePetPush['petData'] | null> {
    const row = await this.pets.findOne({ characterId, following: true }).lean();
    const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
    if (!row || !tpl) return null;
    const view = petSceneView(row, tpl);
    const form = row.state === PetState.BATTLE ? (look === undefined ? await this.lookOf(characterId) : look) : null;
    return form ? { ...view, resCode: form.resCode } : view;
  }
}
