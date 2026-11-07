// Pet-target item effects (item-use plan phases D / E): grow potions (fixed exp under the owner level cap), the lifespan items 1533 /
// 1534 and the aptitude fruit 3984. Each method validates first and returns a refusal text or an `apply` step; the caller consumes
// the item between the two (spend before credit) and holds the character lock, so nothing here locks. Pet HP / MP and loyalty are
// not persisted in this port (a pet is always full), so potions for those never reach this service.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ITEM_USE_TEXT, PetLimits, PetState, itemUseText } from '@mc/shared';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { push, type Push } from '../inventory/pushes';
import { PetBattleService } from './pet-battle.service';
import { PetBonusService } from './pet-bonus.service';
import { aptName } from './pet-growth-rules';
import { APT_LABEL, growGain, lifeAfter, pickAptitudeRaise, rollLife } from './pet-item-rules';
import { Pet } from './pet.schema';
import { sheetAptitudes } from './pet-view';

export type PetItemPlan = { refuse: string } | { apply: () => Promise<Push[]> };

@Injectable()
export class PetItemService {
  rng: () => number = Math.random;

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly battle: PetBattleService,
    private readonly bonus: PetBonusService,
  ) {}

  /** Grow potion: the pet needs `reqLevel`, and must be below owner level + 5; the exp is clamped to that cap. */
  async planGrow(characterId: number, petId: number, templateId: number, reqLevel: number): Promise<PetItemPlan> {
    const row = await this.pets.findOne({ _id: petId, characterId }, { level: 1, exp: 1 }).lean();
    if (!row) return { refuse: ITEM_USE_TEXT.NEED_PET };
    if (row.level < reqLevel) return { refuse: ITEM_USE_TEXT.PET_LEVEL_LOW };
    const owner = (await this.chars.findById(characterId, { level: 1 }).lean())?.level ?? 1;
    const g = growGain(templateId, row.exp, owner);
    if (g.gain <= 0) return { refuse: ITEM_USE_TEXT.PET_OWNER_CAP };
    return { apply: () => this.battle.grantExp(characterId, petId, g.gain) };
  }

  /** Tho Menh Dan: +min..max life (rolled now), capped at the pet maximum; a pet at the maximum keeps the item. */
  async planLife(characterId: number, petId: number, min: number, max: number): Promise<PetItemPlan> {
    const row = await this.pets.findOne({ _id: petId, characterId }, { life: 1 }).lean();
    if (!row || row.life >= PetLimits.maxLife) return { refuse: ITEM_USE_TEXT.PET_LIFE_FULL };
    const after = lifeAfter(row.life, rollLife(min, max, this.rng));
    return {
      apply: async () => {
        await this.pets.updateOne({ _id: petId, characterId }, { $set: { life: after.life } });
        return [
          push('onUpdatePet', petId, 'life', after.life),
          push('onSystemMidMsgOrNote', itemUseText(ITEM_USE_TEXT.PET_LIFE_GAIN, after.gained, after.life, PetLimits.maxLife)),
        ];
      },
    };
  }

  /** The pet that fights, else the one that follows (Go GetActivePet); null when the character has neither. */
  async activePetId(characterId: number): Promise<number | null> {
    const row = await this.pets.findOne({ characterId, $or: [{ state: PetState.BATTLE }, { following: true }] }, { _id: 1, state: 1 })
      .sort({ state: 1 }).lean();
    return row?._id ?? null;
  }

  /** Tinh Hon Chi Thuc: +1 to the lowest aptitude below its cap on `petId` (null = the active pet). */
  async planAptitudeFruit(characterId: number, petId: number | null): Promise<PetItemPlan> {
    const id = petId ?? (await this.activePetId(characterId));
    if (id === null) return { refuse: ITEM_USE_TEXT.FRUIT_NO_PET };
    const row = await this.pets.findOne({ _id: id, characterId }).lean();
    const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
    if (!row || !tpl) return { refuse: ITEM_USE_TEXT.FRUIT_NO_PET };
    const apt = sheetAptitudes(row, tpl);
    const raise = pickAptitudeRaise(tpl.apt, apt.base, { ...(row.aptRefined ?? {}) });
    if (!raise) return { refuse: ITEM_USE_TEXT.FRUIT_MAX };
    return {
      apply: async () => {
        await this.pets.updateOne({ _id: id, characterId }, { $set: { [`aptRefined.${raise.key}`]: raise.after } });
        const next = { ...row, aptRefined: { ...row.aptRefined, [raise.key]: raise.after } };
        return [
          push('onUpdatePet', id, aptName(raise.key), raise.after),
          await this.bonus.refreshPush(characterId, next, tpl),
          push('onSystemMidMsgOrNote', itemUseText(ITEM_USE_TEXT.FRUIT_GAIN, APT_LABEL[raise.key], row.petName, raise.before, raise.after)),
        ];
      },
    };
  }
}
