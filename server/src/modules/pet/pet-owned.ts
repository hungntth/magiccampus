// Loads a pet of a character with its creature template (NOT_FOUND when missing); shared by the pet skill / equipment services.

import type { Model } from 'mongoose';
import { RpcException } from '../../gateway/errors';
import type { GameDataService } from '../gamedata/gamedata.service';
import type { PetTemplate } from '../gamedata/pet-data';
import { idList } from './pet-gear-rules';
import type { Pet } from './pet.schema';

export async function loadOwnedPet(
  pets: Model<Pet>, gameData: GameDataService, characterId: number, petId: number,
): Promise<{ row: Pet; tpl: PetTemplate }> {
  const row = await pets.findOne({ _id: petId, characterId }).lean();
  if (!row) throw RpcException.notFound('Không tìm thấy pet');
  const tpl = gameData.petTemplate(row.tid);
  if (!tpl) throw RpcException.notFound('Không tìm thấy dữ liệu pet');
  return { row, tpl };
}

/** Creature class ids (`class_ids` pipe list, falling back to `class_id`). */
export function creatureClassIds(tpl: PetTemplate): number[] {
  const ids = idList(tpl.classIds);
  return ids.length > 0 ? ids : tpl.classId > 0 ? [tpl.classId] : [];
}
