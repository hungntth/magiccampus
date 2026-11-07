// Avatar appearance service (M13 phase A): reads the worn weapon / costume / flyer, the flags and the mount into the pure resolver
// (appearance-rules.ts) and builds the scene / login `av` plus the look pushes. Pushes go to the owner's map, self included:
// weapon onEquipOn / onEquipOff (dressFlag false), dress look sync (onEquipOn|onEquipOff dressFlag true then onSetRes), onFlyerOn.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DRESS_POSITION, FLYER_POSITION, WEAPON_POSITION, SlotType, settingOn,
  type AvatarView, type EquipOffPush, type EquipOnPush, type FlyerOnPush, type PlayerData, type SceneCharacter, type SetResPush,
} from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { WeaponLookService } from '../inventory/weapon-look.service';
import { mountTables } from '../mount/mount-data';
import { MOUNT_FEATURE_KEY, ownedDresses, parseMount } from '../mount/mount-rules';
import { CharacterFeature } from '../progression/feature.schema';
import { PmStateService } from '../vip/pm-state.service';
import { NO_LOOK_INPUT, appearanceOf, costumeArt, flyerArt, type FlyerArt, type LookInput } from './appearance-rules';
import { settledFlying } from './flight-rules';

type CharLook = Pick<Character, 'classId' | 'gender' | 'level' | 'interfaceData' | 'appearance'>;

@Injectable()
export class AppearanceService {
  /** Persisted "in the air" flag as last read / written, for the synchronous checks (random encounters, NPC fights). */
  private readonly flyingCache = new Map<number, boolean>();

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(CharacterFeature.name) private readonly features: Model<CharacterFeature>,
    private readonly gameData: GameDataService,
    private readonly weapons: WeaponLookService,
    private readonly vip: PmStateService,
    private readonly scenes: SceneManager,
  ) {}

  mapFlyable(mapId: number): boolean {
    return Number(this.gameData.getMap(mapId)?.flyable) === 1;
  }

  /** Worn flyer art, null when no flyer is worn. */
  async wornFlyer(characterId: number): Promise<FlyerArt | null> {
    return (await this.wornArts(characterId, 0)).flyer;
  }

  private async wornArts(characterId: number, gender: number): Promise<{ costume: string | null; flyer: FlyerArt | null }> {
    const rows = await this.items
      .find({ characterId, slotType: SlotType.EQUIP, slotIndex: { $in: [DRESS_POSITION - 1, FLYER_POSITION - 1] } }, { templateId: 1, slotIndex: 1 })
      .lean();
    let costume: string | null = null;
    let flyer: FlyerArt | null = null;
    for (const r of rows) {
      const tpl = await this.gameData.template(19, r.templateId);
      if (r.slotIndex === DRESS_POSITION - 1) costume = costumeArt(tpl, gender);
      else flyer = flyerArt(tpl);
    }
    return { costume, flyer };
  }

  /** Art of the riding mount skin, null when not riding or the skin expired. */
  private async mountArt(characterId: number): Promise<string | null> {
    const row = await this.features.findOne({ characterId, featureKey: MOUNT_FEATURE_KEY }, { state: 1 }).lean();
    if (!row) return null;
    const state = parseMount(row.state);
    if (state.useDress <= 0) return null;
    const t = await mountTables(this.gameData);
    const dress = t.dresses.get(state.useDress);
    return dress && ownedDresses(state, t.rows, Date.now()).has(state.useDress) && dress.resCode !== '0' ? dress.resCode : null;
  }

  /** Fake dress / fake flyer art (phase B plugs the dress table in here). */
  protected async fakeArts(_char: CharLook): Promise<{ fakeDress: string | null; fakeFlyer: FlyerArt | null }> {
    return { fakeDress: null, fakeFlyer: null };
  }

  /** Resolver input of a character on `mapId`; `settle` grounds a stale flying flag (scene entry only). */
  async inputOf(characterId: number, mapId: number, settle = false): Promise<LookInput | null> {
    const char = await this.chars.findById(characterId, { classId: 1, gender: 1, level: 1, interfaceData: 1, appearance: 1 }).lean<CharLook>();
    if (!char) return null;
    const [worn, transform, mount, fake, weapon] = await Promise.all([
      this.wornArts(characterId, char.gender), this.vip.activeTransform(characterId), this.mountArt(characterId), this.fakeArts(char),
      this.weapons.weaponRes(characterId, char.gender),
    ]);
    const cls = this.gameData.getClass(char.classId);
    const mapFlyable = this.mapFlyable(mapId);
    let flying = char.appearance?.flying === true;
    if (settle && flying && !settledFlying(true, { level: char.level, flyerWorn: worn.flyer !== null, mapFlyable })) {
      flying = false;
      await this.chars.updateOne({ _id: characterId }, { $set: { 'appearance.flying': false } });
    }
    this.flyingCache.set(characterId, flying);
    return {
      ...NO_LOOK_INPUT,
      classBody: String((char.gender === 1 ? cls?.res_code_female : cls?.res_code_male) ?? 0),
      transform, weapon, costume: worn.costume, hideDress: settingOn(char.interfaceData, 'dressHide'),
      fakeDress: fake.fakeDress, flyer: worn.flyer, fakeFlyer: fake.fakeFlyer, flying, mapFlyable, mount,
    };
  }

  /** Look of a character on its own map (`mapId` defaults to the session's). */
  async viewOf(characterId: number, mapId?: number, settle = false): Promise<AvatarView | null> {
    const input = await this.inputOf(characterId, mapId ?? this.scenes.findByCharacter(characterId)?.mapId ?? 0, settle);
    return input ? appearanceOf(input) : null;
  }

  /** Adds `av` (and the mirrored `resCode` / `wp`) to a scene payload; `settle` is true for the scene entry of the owner. */
  async decorate<T extends SceneCharacter>(sc: T, mapId: number, settle = true): Promise<T> {
    const view = await this.viewOf(sc.id, mapId, settle);
    if (!view) return sc;
    return Object.assign(sc, { av: view, resCode: view.res, wp: view.wp });
  }

  /** Login extra (`chooseCharactor` payload): the look on the character's saved map. */
  async loginExtra(characterId: number): Promise<Partial<PlayerData>> {
    const char = await this.chars.findById(characterId, { mapId: 1 }).lean();
    const av = char ? await this.viewOf(characterId, char.mapId) : null;
    return av ? { av } : {};
  }

  /** In the air right now (persisted flag on a flyable map), from the cache when known. */
  async isFlying(session: Session): Promise<boolean> {
    const cid = session.characterId!;
    let flying = this.flyingCache.get(cid);
    if (flying === undefined) {
      flying = (await this.chars.findById(cid, { appearance: 1 }).lean())?.appearance?.flying === true;
      this.flyingCache.set(cid, flying);
    }
    return flying && this.mapFlyable(session.mapId);
  }

  /** Persists the flying flag. */
  async setFlying(characterId: number, flying: boolean): Promise<void> {
    await this.chars.updateOne({ _id: characterId }, { $set: { 'appearance.flying': flying } });
    this.flyingCache.set(characterId, flying);
  }

  private mapOf(characterId: number): number {
    return this.scenes.findByCharacter(characterId)?.mapId ?? 0;
  }

  private send(characterId: number, method: string, payload: unknown): void {
    const mapId = this.mapOf(characterId);
    if (mapId) this.scenes.broadcast(mapId, method, [payload]);
  }

  /** Weapon changed: onEquipOn (weapon worn) or onEquipOff (bare hands), raw art (the client hides it on a non-class body). */
  async pushWeapon(characterId: number): Promise<void> {
    const view = await this.viewOf(characterId);
    if (!view) return;
    if (view.wp !== '0') this.send(characterId, 'onEquipOn', { cid: characterId, resCode: view.wp, dressFlag: false } satisfies EquipOnPush);
    else this.send(characterId, 'onEquipOff', { cid: characterId, resCode: '0', dressFlag: false } satisfies EquipOffPush);
  }

  /** onSetRes of the resolved body (transform revert, curse cure, dress sync). */
  async pushRes(characterId: number): Promise<void> {
    const view = await this.viewOf(characterId);
    if (view) this.send(characterId, 'onSetRes', { id: characterId, res: view.res, body: view.body } satisfies SetResPush);
  }

  /** Dress look sync (Go appearance_dress_sync.go): costume on / off, the weapon back when bare, then onSetRes. */
  async syncDress(characterId: number): Promise<void> {
    const view = await this.viewOf(characterId);
    if (!view) return;
    if (view.body === 'dress') {
      this.send(characterId, 'onEquipOn', { cid: characterId, resCode: view.res, dressFlag: true } satisfies EquipOnPush);
    } else {
      this.send(characterId, 'onEquipOff', { cid: characterId, resCode: view.body === 'class' ? view.res : '-1', dressFlag: true } satisfies EquipOffPush);
      if (view.wp !== '0') this.send(characterId, 'onEquipOn', { cid: characterId, resCode: view.wp, dressFlag: false } satisfies EquipOnPush);
    }
    this.send(characterId, 'onSetRes', { id: characterId, res: view.res, body: view.body } satisfies SetResPush);
  }

  /** Flyer worn / removed / faked: onFlyerOn with the resolved art, or '-1' (Flash has no flyer-off callback). Does not land. */
  async pushFlyer(characterId: number): Promise<void> {
    const view = await this.viewOf(characterId);
    if (!view) return;
    const p: FlyerOnPush = view.flyer
      ? { cid: characterId, resCode: view.flyer, ...(view.flyerFront ? { wavCode: view.flyerFront } : {}) }
      : { cid: characterId, resCode: '-1', wavCode: '-1' };
    this.send(characterId, 'onFlyerOn', p);
  }

  /** EquipHooks listener: position 3 weapon, 21 costume, 14 flyer. */
  async onEquipChanged(characterId: number, position: number): Promise<void> {
    if (position === WEAPON_POSITION) await this.pushWeapon(characterId);
    else if (position === DRESS_POSITION) await this.syncDress(characterId);
    else if (position === FLYER_POSITION) await this.pushFlyer(characterId);
  }

  /** setDressHide(hide): persists interfaceData.dressHide (0 / 1), then the look sync. Returns the stored flag. */
  async setDressHide(characterId: number, hide: boolean): Promise<boolean> {
    await this.chars.updateOne({ _id: characterId }, { $set: { 'interfaceData.dressHide': hide ? 1 : 0 } });
    await this.syncDress(characterId);
    return hide;
  }

  /** After the settings panel (us) saved: a changed dressHide re-syncs the look. */
  async onSettingsSaved(characterId: number, fields: Record<string, unknown>): Promise<void> {
    if ('dressHide' in fields) await this.syncDress(characterId);
  }
}
