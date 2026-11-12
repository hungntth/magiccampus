// Avatar appearance service (M13 phase A): reads the worn weapon / costume / flyer, the flags and the mount into the pure resolver
// (appearance-rules.ts) and builds the scene / login `av` plus the look pushes. Pushes go to the owner's map, self included:
// weapon onEquipOn / onEquipOff (dressFlag false), dress look sync (onEquipOn|onEquipOff dressFlag true then onSetRes), onFlyerOn, onFairyOn / onFairyOff.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DRESS_POSITION, DRESS_TYPE, FLYER_POSITION, WEAPON_POSITION, WING_POSITION, SlotType, parseWing, settingOn, wingColourOf, wingResFor,
  DECO_POSITION_CALLBACK, type AvatarView, type DecoLook, type DecoOffPush, type DecoOnPush, type EquipOffPush, type EquipOnPush, type FlyerOnPush, type PlayerData, type SceneCharacter, type SetResPush,
  type FairyOnPush, type WingOffPush, type WingOnPush,
} from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { WeaponLookService } from '../inventory/weapon-look.service';
import { decoLooks, positionLook } from '../deco/deco-look';
import { DECO_FEATURE_KEY, decoInfoOf, parseDeco } from '../deco/deco-state';
import { DRESS_FEATURE_KEY, parseDress } from '../dress/dress-state';
import { FAIRY_FEATURE_KEY, FAIRY_SKIN_FEATURE_KEY, guardLook, parseFairyState, parseSkinState } from '../fairy/fairy-state';
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

  private async wornArts(characterId: number, gender: number): Promise<{ costume: string | null; flyer: FlyerArt | null; wing: string | null }> {
    const rows = await this.items
      .find(
        { characterId, slotType: SlotType.EQUIP, slotIndex: { $in: [DRESS_POSITION - 1, FLYER_POSITION - 1, WING_POSITION - 1] } },
        { templateId: 1, slotIndex: 1, colorCode: 1, properties: 1 },
      )
      .lean();
    let costume: string | null = null;
    let flyer: FlyerArt | null = null;
    let wing: string | null = null;
    for (const r of rows) {
      const tpl = await this.gameData.template(19, r.templateId);
      if (r.slotIndex === DRESS_POSITION - 1) costume = costumeArt(tpl, gender);
      else if (r.slotIndex === WING_POSITION - 1) wing = this.wingArt(tpl, r.colorCode, r.properties?.wing);
      else flyer = flyerArt(tpl);
    }
    return { costume, flyer, wing };
  }

  /** Art of a worn wing: the template res_code (colour variants and level looks hang off it, wing.ts), null without art. */
  private wingArt(tpl: Record<string, unknown> | undefined, colorCode: number, state: unknown): string | null {
    const w = parseWing(state);
    const art = wingResFor(Number(tpl?.res_code ?? 0), wingColourOf(colorCode), w.level, w.look, w.dye);
    return art === '0' ? null : art;
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

  /** Fake dress / fake flyer art from the Tủ Đồ state (the dress must still be in the book; the resolver only applies it to worn gear). */
  private async fakeArts(characterId: number, gender: number): Promise<{ fakeDress: string | null; fakeFlyer: FlyerArt | null }> {
    const row = await this.features.findOne({ characterId, featureKey: DRESS_FEATURE_KEY }, { state: 1 }).lean();
    if (!row) return { fakeDress: null, fakeFlyer: null };
    const dress = parseDress(row.state);
    const def = (id: number, type: number) => {
      const d = id > 0 && dress.book[String(id)] ? this.gameData.dressRow(id) : undefined;
      return d && d.type === type ? d : undefined;
    };
    const fashion = def(dress.fakeDressId, DRESS_TYPE.FASHION);
    const flyer = def(dress.fakeFlyDressId, DRESS_TYPE.FLYER);
    return {
      fakeDress: fashion ? costumeArt(await this.gameData.template(19, fashion.equiptId), gender) : null,
      fakeFlyer: flyer ? flyerArt(await this.gameData.template(19, flyer.equiptId)) : null,
    };
  }

  private async decoState(characterId: number) {
    return parseDeco((await this.features.findOne({ characterId, featureKey: DECO_FEATURE_KEY }, { state: 1 }).lean())?.state);
  }

  /** Hồn Khí looks of the equipped, visible positions. */
  private async decoLooksOf(characterId: number): Promise<DecoLook[]> {
    return decoLooks(await this.decoState(characterId), (id) => this.gameData.decoHole(id), (id) => this.gameData.decoShow(id));
  }

  /** Art of the guarding Tiểu Tinh Linh (active skin or its own template), null when none guards. */
  private async fairyArt(characterId: number): Promise<string | null> {
    const rows = await this.features.find({ characterId, featureKey: { $in: [FAIRY_FEATURE_KEY, FAIRY_SKIN_FEATURE_KEY] } }, { featureKey: 1, state: 1 }).lean();
    const of = (k: string) => rows.find((r) => r.featureKey === k)?.state;
    return guardLook(parseFairyState(of(FAIRY_FEATURE_KEY)), parseSkinState(of(FAIRY_SKIN_FEATURE_KEY)), (tid) => this.gameData.fairyTemplate(tid));
  }

  /** Resolver input of a character on `mapId`; `settle` grounds a stale flying flag (scene entry only). */
  async inputOf(characterId: number, mapId: number, settle = false): Promise<LookInput | null> {
    const char = await this.chars.findById(characterId, { classId: 1, gender: 1, level: 1, interfaceData: 1, appearance: 1 }).lean<CharLook>();
    if (!char) return null;
    const [worn, transform, mount, fake, weapon, deco, fairy] = await Promise.all([
      this.wornArts(characterId, char.gender), this.vip.activeTransform(characterId), this.mountArt(characterId), this.fakeArts(characterId, char.gender),
      this.weapons.weaponRes(characterId, char.gender), this.decoLooksOf(characterId), this.fairyArt(characterId),
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
      wing: settingOn(char.interfaceData, 'wingHide') ? null : worn.wing, deco, fairy,
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

  /** Wing worn / removed / changed / hidden: onWingOn with the resolved art, or onWingOff. */
  async pushWing(characterId: number): Promise<void> {
    const view = await this.viewOf(characterId);
    if (!view) return;
    if (view.wing) this.send(characterId, 'onWingOn', { cid: characterId, resCode: view.wing } satisfies WingOnPush);
    else this.send(characterId, 'onWingOff', { cid: characterId } satisfies WingOffPush);
  }

  /** Guarding fairy changed (state, skin, release): onFairyOn {cid, fairy: {resCode}} or onFairyOff(cid) to the map, self included. */
  async pushFairy(characterId: number): Promise<void> {
    const view = await this.viewOf(characterId);
    if (view?.fairy) this.send(characterId, 'onFairyOn', { cid: characterId, fairy: { resCode: view.fairy } } satisfies FairyOnPush);
    else if (view) this.send(characterId, 'onFairyOff', characterId);
  }

  /** Hồn Khí look changed on `positions`: per position onDeco<Pos>Off first (unloads the old graphic), then onDeco<Pos>On when equipped and visible. */
  async pushDeco(characterId: number, positions: readonly number[]): Promise<void> {
    const state = await this.decoState(characterId);
    const holeOf = (id: number) => this.gameData.decoHole(id);
    const decoInfo = decoInfoOf(state, holeOf);
    for (const pos of positions) {
      const name = DECO_POSITION_CALLBACK[pos];
      if (!name) continue;
      this.send(characterId, `onDeco${name}Off`, { cid: characterId, pos, decoInfo } satisfies DecoOffPush);
      const look = positionLook(state, pos, holeOf, (id) => this.gameData.decoShow(id));
      if (look) this.send(characterId, `onDeco${name}On`, { cid: characterId, decoInfo, ...look } satisfies DecoOnPush);
    }
  }

  /** EquipHooks listener: position 3 weapon, 21 costume, 14 flyer, 22 wing. */
  async onEquipChanged(characterId: number, position: number): Promise<void> {
    if (position === WEAPON_POSITION) await this.pushWeapon(characterId);
    else if (position === DRESS_POSITION) await this.syncDress(characterId);
    else if (position === FLYER_POSITION) await this.pushFlyer(characterId);
    else if (position === WING_POSITION) await this.pushWing(characterId);
  }

  /** setWingHide(hide): persists interfaceData.wingHide (0 / 1) and pushes the wing look. Returns the stored flag. */
  async setWingHide(characterId: number, hide: boolean): Promise<boolean> {
    await this.chars.updateOne({ _id: characterId }, { $set: { 'interfaceData.wingHide': hide ? 1 : 0 } });
    await this.pushWing(characterId);
    return hide;
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
    if ('wingHide' in fields) await this.pushWing(characterId);
  }
}
