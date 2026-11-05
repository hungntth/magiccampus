// Interface settings (M9): the auto-battle keys of the character (Character.interfaceData) and of the active pet
// (Pet.battleSetting), written by uif / skillSetBattle, the hotbar keys st/sid/au/ubl (skillSetUserBar, uif, us), the system
// panel keys (us) and the merged login `interfaceData` map.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AUTO_DEFAULTS, AutoSlotKind, hotbarDefaults, SYSTEM_SETTING_DEFAULTS, HotbarKind, isPetAutoKey, PetState, skillCategory, type AutoSettingKey, type InterfaceData,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { Pet } from '../pet/pet.schema';
import { SkillLearnService } from '../skill/skill-learn.service';
import { SkillService } from '../skill/skill.service';

export const NO_ACTIVE_PET = 'Chưa có pet xuất chiến';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly gameData: GameDataService,
    private readonly skills: SkillService,
    private readonly learn: SkillLearnService,
  ) {}

  /** Login map: defaults, then the character bucket, then the active pet bucket (pet keys only). */
  async loginInterfaceData(characterId: number): Promise<InterfaceData> {
    const [doc, pet] = await Promise.all([
      this.chars.findById(characterId, { interfaceData: 1 }).lean(),
      this.activePet(characterId),
    ]);
    const out: InterfaceData = { ...SYSTEM_SETTING_DEFAULTS, ...hotbarDefaults(), ...AUTO_DEFAULTS };
    for (const [k, v] of Object.entries(doc?.interfaceData ?? {})) out[k] = v;
    for (const [k, v] of Object.entries(pet?.battleSetting ?? {})) out[k] = v;
    return out;
  }

  /** uif(<auto key>, value, isPet): value already range-checked; a non-zero bs set this way must be an item template. */
  async setAutoKey(characterId: number, key: AutoSettingKey, value: number): Promise<void> {
    if (key.startsWith('bs') && value > 0 && !(await this.gameData.template(29, value))) throw RpcException.invalidArgs('value');
    await this.write(characterId, isPetAutoKey(key), { [key]: value });
  }

  /** skillSetBattle(skillId, level, slot, isPet): slot parity already checked. skillId 0 clears the slot. */
  async setBattleSkill(characterId: number, skillId: number, slot: number, isPet: boolean): Promise<void> {
    if (skillId === 0) {
      await this.write(characterId, isPet, { [`bt${slot}`]: AutoSlotKind.NONE, [`bs${slot}`]: 0 });
      return;
    }
    const tpl = this.gameData.skill(skillId);
    if (!tpl) throw RpcException.invalidArgs('skillId');
    if (skillCategory(tpl.type) === 'passive') throw RpcException.forbidden('Không thể sử dụng kỹ năng bị động');
    if (isPet) {
      const pet = await this.activePet(characterId);
      if (!pet) throw RpcException.forbidden(NO_ACTIVE_PET);
      if (!(pet.skills ?? []).includes(skillId)) throw RpcException.forbidden('Pet chưa học kỹ năng này');
    } else if (!(await this.skills.owns(characterId, skillId))) {
      throw RpcException.forbidden('Bạn chưa học kỹ năng này');
    }
    await this.write(characterId, isPet, { [`bt${slot}`]: AutoSlotKind.SKILL, [`bs${slot}`]: skillId });
  }

  /** Character-bucket keys already validated by the caller (hotbar / system settings). One $set. */
  async setCharacterKeys(characterId: number, fields: InterfaceData): Promise<void> {
    const set: Record<string, number | boolean> = {};
    for (const [k, v] of Object.entries(fields)) set[`interfaceData.${k}`] = v;
    if (Object.keys(set).length > 0) await this.chars.updateOne({ _id: characterId }, { $set: set });
  }

  /** skillSetUserBar: an owned skill (exact id or the family at >= that level) or a skill of the active pet. */
  async setUserBarSkill(characterId: number, slot: number, skillId: number): Promise<void> {
    if (!this.gameData.skill(skillId)) throw RpcException.invalidArgs('skillId');
    if (!(await this.learn.ownsFamilyAtLeast(characterId, skillId))) {
      const pet = await this.activePet(characterId);
      if (!(pet?.skills ?? []).includes(skillId)) throw RpcException.forbidden('Bạn chưa học kỹ năng này');
    }
    await this.setCharacterKeys(characterId, { [`st${slot}`]: HotbarKind.SKILL, [`sid${slot}`]: skillId });
  }

  private activePet(characterId: number): Promise<Pick<Pet, '_id' | 'skills' | 'battleSetting'> | null> {
    return this.pets.findOne({ characterId, state: PetState.BATTLE }, { _id: 1, skills: 1, battleSetting: 1 }).lean();
  }

  private async write(characterId: number, isPet: boolean, fields: Record<string, number>): Promise<void> {
    if (isPet) {
      const pet = await this.activePet(characterId);
      if (!pet) throw RpcException.forbidden(NO_ACTIVE_PET);
      await this.pets.updateOne({ _id: pet._id }, { $set: prefixed('battleSetting', fields) });
      return;
    }
    await this.chars.updateOne({ _id: characterId }, { $set: prefixed('interfaceData', fields) });
  }
}

function prefixed(root: string, fields: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(fields)) out[`${root}.${k}`] = v;
  return out;
}
