// Weapon art held in the character's hand (legacy CreatureView weapon layer): `weaponRes` reads the equipped weapon's res_code_male /
// res_code_female and caches it for the synchronous battle start (`wp` of battle participants). The scene payload `wp` and the
// onEquipOn / onEquipOff pushes are built by the appearance module (AppearanceService), which calls `weaponRes`.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlotType, WEAPON_POSITION } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from './character-item.schema';

@Injectable()
export class WeaponLookService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
  ) {}

  /** Last weapon art read per character: battle starts are synchronous, and every scene entry / weapon change refreshes it. */
  private readonly last = new Map<number, string>();

  /** Weapon art of the equipped weapon, '0' when none (gender 1 = female art). */
  async weaponRes(characterId: number, gender: number): Promise<string> {
    const row = await this.items.findOne({ characterId, slotType: SlotType.EQUIP, slotIndex: WEAPON_POSITION - 1 }, { templateId: 1 }).lean();
    const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
    const code = gender === 1 ? tpl?.res_code_female : tpl?.res_code_male;
    const res = code ? String(code) : '0';
    this.last.set(characterId, res);
    return res;
  }

  /** Weapon art as last read (scene entry or weapon change), '0' when unknown; for the synchronous battle start. */
  cached(characterId: number): string {
    return this.last.get(characterId) ?? '0';
  }
}
