// Pet turn-in quest objectives (quest_require kind 3 / type 12, phase D): the facts of the owned pets for the objective sync, and the
// deletion of the pets that pay a finished quest (lowest growRate first, Go consumeSubmitPetObjectives). consume() runs under the
// quest finish lock; it releases a following pet map-wide and returns the onDelPet pushes.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { petsToConsume, type PetObjectiveFacts, type PetObjectiveNeed } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { push, type Push } from '../inventory/pushes';
import { PetEquipService } from './pet-equip.service';
import { PetFollowService } from './pet-follow.service';
import { Pet } from './pet.schema';

/** One kind-3 objective: `q` is the require row's quality field (growth colour threshold = q / 10). */
export interface PetObjective {
  creatureId: number;
  q: number;
  required: number;
}

@Injectable()
export class PetObjectiveService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly gameData: GameDataService,
    private readonly follow: PetFollowService,
    private readonly gear: PetEquipService,
  ) {}

  /** Template name used for the "name unchanged" check ('' when the creature is unknown). */
  templateName(creatureId: number): string {
    return this.gameData.petTemplate(creatureId)?.name ?? '';
  }

  async facts(characterId: number): Promise<PetObjectiveFacts[]> {
    const rows = await this.pets.find({ characterId }, { tid: 1, petName: 1, growRate: 1 }).lean();
    return rows.map((r) => ({ id: r._id, tid: r.tid, petName: r.petName, growRate: r.growRate }));
  }

  /** Deletes the pets that pay the objectives. Throws FORBIDDEN when they cannot be paid (the caller checked, so only a race). */
  async consume(characterId: number, objectives: readonly PetObjective[]): Promise<Push[]> {
    if (objectives.length === 0) return [];
    const needs: PetObjectiveNeed[] = objectives.map((o) => ({ ...o, templateName: this.templateName(o.creatureId) }));
    const facts = await this.facts(characterId);
    const victims = petsToConsume(facts, needs);
    if (!victims) throw RpcException.forbidden('Không đủ pet theo yêu cầu nhiệm vụ');
    const pushes: Push[] = [];
    for (const id of victims) {
      pushes.push(...(await this.gear.returnAll(characterId, id))); // worn pet items go back to the bag first
      const row = await this.pets.findOneAndDelete({ _id: id, characterId }, { projection: { following: 1 } }).lean();
      if (!row) throw RpcException.forbidden('Pet vừa thay đổi, hãy thử lại');
      if (row.following) this.follow.cancelBroadcast(characterId);
      pushes.push(push('onDelPet', id));
    }
    return pushes;
  }
}
