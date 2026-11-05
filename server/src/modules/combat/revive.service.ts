// Death and relive (M9 phase D, legacy standin/relive_modes.go + scene/movement.go toSafe): the map relive mode (1 Hình Nhân,
// 2 free, 3 gold), reliveUseItem (doll 721 else 18 gold), toSafe (safe point, half HP/MP, 20 % durability penalty on mode-1 maps
// from level 20), freeRelive (mode 2), bbGoldRelive / bbNormalRelive (mode 3, the price is the server's countdown). Each relive
// is one conditional write on a dead character; a refusal (alive, in battle, wrong mode) pushes the current onUPP {currentHp, currentMp}.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { bbGoldPrice, DOLL_GOLD, DOLL_TID, RELIVE_TEXT, ReliveMode, SlotType, type ReliveSwitchResult } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { applyLoss, goldReliveSecondsLeft, isDress, penaltyApplies, reliveMode } from './relive-mode';

const FALLBACK_SAFE = { x: 100, y: 100 };
const note = (session: Session, text: string): void => session.callback('onSystemMidMsgOrNote', text);

@Injectable()
export class ReviveService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
    private readonly transport: SceneTransportService,
    private readonly inventory: InventoryService,
  ) {}

  modeOf(mapId: number): 1 | 2 | 3 {
    const map = this.gameData.getMap(mapId);
    return reliveMode(mapId, Number(map?.dead ?? 0), Number(map?.pk ?? 0));
  }

  /** reliveSwitch(): 0 when alive or fighting, else the map's mode. */
  async reliveSwitch(session: Session): Promise<ReliveSwitchResult> {
    if (session.battleId !== null) return ReliveMode.NONE;
    const doc = await this.chars.findById(session.characterId!, { currentHp: 1 }).lean();
    return doc && doc.currentHp <= 0 ? this.modeOf(session.mapId) : ReliveMode.NONE;
  }

  /** freeRelive(1): mode 2 only, in place with full HP/MP. */
  async reviveHere(session: Session): Promise<boolean> {
    if (!(await this.allowed(session, [ReliveMode.FREE]))) return false;
    const st = await this.stats.compute(session.characterId!);
    return this.restore(session, st.maxHp, st.maxMp);
  }

  /** freeRelive(2) (mode 2), toSafe (modes 1 / 2, penalty on 1), bbNormalRelive (mode 3): the safe point at half HP/MP. */
  async reviveAtSafePoint(session: Session, modes: readonly number[]): Promise<boolean> {
    if (!(await this.allowed(session, modes))) return false;
    const st = await this.stats.compute(session.characterId!);
    const ok = await this.restore(session, Math.max(1, Math.floor(st.maxHp / 2)), Math.max(0, Math.floor(st.maxMp / 2)));
    if (!ok) return false;
    if (penaltyApplies(this.modeOf(session.mapId), st.doc.level)) await this.durabilityPenalty(session);
    const map = this.gameData.getMap(session.mapId);
    const x = Number(map?.safe_x ?? FALLBACK_SAFE.x) || FALLBACK_SAFE.x;
    const y = Number(map?.safe_y ?? FALLBACK_SAFE.y) || FALLBACK_SAFE.y;
    session.callback('onSceneEnter', await this.transport.moveToMap(session, session.mapId, x, y));
    return true;
  }

  /** reliveUseItem(): mode 1. One Hình Nhân from the bag, else 18 gold (never goldBind); in place at full HP/MP. */
  async reliveUseItem(session: Session): Promise<void> {
    if (!(await this.allowed(session, [ReliveMode.DOLL]))) return;
    const cid = session.characterId!;
    const st = await this.stats.compute(cid);
    const dolls = (await this.inventory.countByTemplate(cid, [DOLL_TID])).get(DOLL_TID) ?? 0;
    if (dolls > 0) {
      const spent = await this.inventory.removeByTemplate(cid, DOLL_TID, 1);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      note(session, RELIVE_TEXT.LOST_DOLL);
      await this.restore(session, st.maxHp, st.maxMp);
      return;
    }
    await this.goldRevive(session, DOLL_GOLD, st.maxHp, st.maxMp, RELIVE_TEXT.NO_DOLL_GOLD);
  }

  /** bbGoldRelive(price): mode 3. The client price is ignored: the server charges int(left / 5) + 1 from the death time. */
  async bbGoldRelive(session: Session): Promise<void> {
    if (!(await this.allowed(session, [ReliveMode.GOLD]))) return;
    const doc = await this.chars.findById(session.characterId!, { deathAt: 1 }).lean();
    const price = bbGoldPrice(goldReliveSecondsLeft(doc?.deathAt ?? null, Date.now()));
    const st = await this.stats.compute(session.characterId!);
    await this.goldRevive(session, price, st.maxHp, st.maxMp, RELIVE_TEXT.NO_RELIVE_GOLD);
  }

  /** Spend and revive in one conditional write: dead and holding the gold. */
  private async goldRevive(session: Session, price: number, hp: number, mp: number, short: string): Promise<void> {
    const doc = await this.chars.findOneAndUpdate(
      { _id: session.characterId!, currentHp: { $lte: 0 }, gold: { $gte: price } },
      { $inc: { gold: -price }, $set: { currentHp: hp, currentMp: mp, deathAt: null } },
      { new: true, projection: { gold: 1 } },
    ).lean();
    if (!doc) {
      note(session, short);
      await this.pushVitals(session);
      return;
    }
    session.callback('onUPP', { currentHp: hp, currentMp: mp, gold: doc.gold });
  }

  /** Dead, not fighting, and the map offers this relive; else the refusal push. */
  private async allowed(session: Session, modes: readonly number[]): Promise<boolean> {
    const doc = await this.chars.findById(session.characterId!, { currentHp: 1 }).lean();
    const ok = session.battleId === null && !!doc && doc.currentHp <= 0 && modes.includes(this.modeOf(session.mapId));
    if (!ok) await this.pushVitals(session);
    return ok;
  }

  private async pushVitals(session: Session): Promise<void> {
    const doc = await this.chars.findById(session.characterId!, { currentHp: 1, currentMp: 1 }).lean();
    if (doc) session.callback('onUPP', { currentHp: doc.currentHp, currentMp: doc.currentMp });
  }

  /** Worn non-fashion gear loses ceil(20 % max) durability (min 1); each changed row is re-pushed. */
  private async durabilityPenalty(session: Session): Promise<void> {
    const cid = session.characterId!;
    const worn = await this.items.find({ characterId: cid, slotType: SlotType.EQUIP }).lean();
    const tpls = await this.gameData.templatesByIds(19, worn.map((w) => w.templateId));
    const changed: number[] = [];
    for (const it of worn) {
      const tpl = tpls.get(it.templateId);
      if (isDress(Number(tpl?.kind ?? 0), it.slotIndex + 1)) continue;
      const next = applyLoss(it.durability ?? 0, it.maxDurability ?? 0);
      if (next === null) continue;
      const r = await this.items.updateOne({ _id: it._id, durability: it.durability }, { $set: { durability: next } });
      if (r.modifiedCount === 1) changed.push(it._id);
    }
    for (const item of await this.inventory.byIds(cid, changed)) session.callback('onAddCharactorSlot', item);
  }

  /** Conditional write (only while HP <= 0) then the onUPP push; a second call finds the character alive and does nothing. */
  private async restore(session: Session, hp: number, mp: number): Promise<boolean> {
    const res = await this.chars.updateOne(
      { _id: session.characterId!, currentHp: { $lte: 0 } },
      { $set: { currentHp: hp, currentMp: mp, deathAt: null } },
    );
    if (res.modifiedCount !== 1) return false;
    session.callback('onUPP', { currentHp: hp, currentMp: mp });
    return true;
  }
}
