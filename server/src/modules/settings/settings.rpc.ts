// Interface-setting RPCs (M9): uif(key, value, isPet) (apvp, auto-battle and hotbar keys), skillSetBattle(skillId, level, slot,
// isPet), skillSetUserBar(skillId, level, "<n>") -> true and us(map) -> {success} (bulk save: ubl and the "Hệ thống" panel keys).
// No pushes of its own (the Flash client updates its GLOBAL_SETTING locally); a changed dressHide runs the dress look sync (onEquipOn /
// onEquipOff dressFlag true + onSetRes, see AppearanceService).

import { Injectable } from '@nestjs/common';
import {
  isAutoSettingKey, isHotbarKey, isPetAutoKey, parseHotbarSlot, validAutoValue, validHotbarValue, validSkillSlot, type InterfaceData,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { AppearanceService } from '../appearance/appearance.service';
import { PkService } from '../pk/pk.service';
import { SettingsService } from './settings.service';
import { usValue } from './us-value';
import { PermissionService } from './permission.service';

@Injectable()
export class SettingsRpc {
  constructor(
    private readonly settings: SettingsService,
    private readonly pk: PkService,
    private readonly perms: PermissionService,
    private readonly appearance: AppearanceService,
  ) {}

  @Rpc('uif', { requireCharacter: true })
  async uif(session: Session, args: unknown[]): Promise<null> {
    const key = args[0];
    if (typeof key !== 'string') throw RpcException.invalidArgs('key');
    if (key === 'apvp') {
      if (typeof args[1] !== 'boolean') throw RpcException.invalidArgs('value');
      await this.pk.setApvp(session.characterId!, args[1]);
      return null;
    }
    if (isAutoSettingKey(key)) {
      const value = Number(args[1]);
      if (!validAutoValue(key, value)) throw RpcException.invalidArgs('value');
      if (Boolean(args[2]) !== isPetAutoKey(key)) throw RpcException.invalidArgs('isPet');
      await this.settings.setAutoKey(session.characterId!, key, value);
    } else if (isHotbarKey(key)) {
      const value = validHotbarValue(key, args[1]);
      if (value === null) throw RpcException.invalidArgs('value');
      await this.settings.setCharacterKeys(session.characterId!, { [key]: value });
    }
    return null; // other interface keys: ignored
  }

  @Rpc('skillSetUserBar', { requireCharacter: true })
  async skillSetUserBar(session: Session, args: unknown[]): Promise<boolean> {
    const skillId = Number(args[0]);
    if (!Number.isInteger(skillId) || skillId <= 0) throw RpcException.invalidArgs('skillId');
    if (!Number.isInteger(Number(args[1] ?? 0))) throw RpcException.invalidArgs('level');
    const slot = parseHotbarSlot(args[2]);
    if (slot === null) throw RpcException.invalidArgs('slot');
    await this.settings.setUserBarSkill(session.characterId!, slot, skillId);
    return true;
  }

  @Rpc('us', { requireCharacter: true })
  async us(session: Session, args: unknown[]): Promise<{ success: boolean }> {
    const raw = args[0];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw RpcException.invalidArgs('settings');
    const fields: InterfaceData = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const value = usValue(k, v);
      if (value === undefined) continue; // keys outside the whitelist are ignored
      if (value === null) throw RpcException.invalidArgs(k);
      fields[k] = value;
    }
    await this.settings.setCharacterKeys(session.characterId!, fields);
    this.perms.saved(session.characterId!, fields);
    await this.appearance.onSettingsSaved(session.characterId!, fields);
    return { success: true };
  }

  @Rpc('skillSetBattle', { requireCharacter: true })
  async skillSetBattle(session: Session, args: unknown[]): Promise<null> {
    const skillId = Number(args[0]);
    if (!Number.isInteger(skillId) || skillId < 0) throw RpcException.invalidArgs('skillId');
    if (!Number.isInteger(Number(args[1] ?? 0))) throw RpcException.invalidArgs('level');
    const slot = Number(args[2]);
    const isPet = Boolean(args[3]);
    if (!validSkillSlot(slot, isPet)) throw RpcException.invalidArgs('slot');
    await this.settings.setBattleSkill(session.characterId!, skillId, slot, isPet);
    return null;
  }
}
