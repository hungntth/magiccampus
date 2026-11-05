// Loop bosses (M9 phase E, Go quest/loop_boss.go + handlers/item/loop_boss_use.go): the in-memory Trị An summons, the bosses a
// character sees on a map (createBoss), onBossOn when a map-mode round is taken or an order item is used, and onBossOff
// when the kill is done or the round is finished / cancelled (the order items go with it). Summons are lost on restart:
// the order item is not consumed on use, so using it again re-summons. Summons survive a relog.

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { BossRow } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { UseItemService } from '../inventory/use-item.service';
import { CharacterQuest } from '../quest/quest.schema';
import {
  bossByItem, bossByNpc, bossByQuest, bossRow, hasUnfinishedKill, LOOP_BOSSES, mapBossPresent, standPos, SUMMON_OFFSET_X,
  type LoopBossSpec,
} from './loop-boss';
import { CharacterQuestLoop } from './loop.schema';

interface Summon {
  questId: number;
  npcId: number;
  mapId: number;
  x: number;
  y: number;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

@Injectable()
export class LoopBossService implements OnModuleInit {
  private readonly summons = new Map<number, Summon>();

  constructor(
    @InjectModel(CharacterQuestLoop.name) private readonly loops: Model<CharacterQuestLoop>,
    @InjectModel(CharacterQuest.name) private readonly quests: Model<CharacterQuest>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly useItem: UseItemService,
    private readonly scenes: SceneManager,
  ) {}

  onModuleInit(): void {
    this.useItem.setOrderHook((cid, tid) => this.summon(cid, this.scenes.findByCharacter(cid)?.mapId ?? 0, tid));
  }

  private async activeRounds(cid: number): Promise<Set<number>> {
    const docs = await this.loops.find({ characterId: cid, active: true }, { activeQuestId: 1 }).lean();
    return new Set(docs.map((d) => d.activeQuestId ?? 0).filter((q) => q > 0));
  }

  private async objectives(cid: number, questId: number): Promise<CharacterQuest['objectives'] | undefined> {
    return (await this.quests.findOne({ characterId: cid, questId }, { objectives: 1 }).lean())?.objectives;
  }

  private row(spec: LoopBossSpec, x: number, y: number): BossRow | null {
    const npc = this.gameData.getNpc(spec.npcId);
    if (!npc) return null;
    return bossRow({ id: spec.npcId, name: str(npc.name), resCode: str(npc.res_code), type: Number(npc.type ?? 0) }, x, y, spec.air);
  }

  private mapRow(spec: LoopBossSpec): BossRow | null {
    const npc = this.gameData.getNpc(spec.npcId);
    const [x, y] = standPos(Number(npc?.pos_x ?? 0), Number(npc?.pos_y ?? 0));
    return this.row(spec, x, y);
  }

  /** createBoss: every loop boss the character sees on `mapId` (its summon there plus the map-mode bosses). */
  async scene(cid: number, mapId: number): Promise<BossRow[]> {
    const out: BossRow[] = [];
    const s = this.summons.get(cid);
    if (s && s.mapId === mapId && hasUnfinishedKill(await this.objectives(cid, s.questId))) {
      const spec = bossByQuest(s.questId);
      const row = spec && this.row(spec, s.x, s.y);
      if (row) out.push(row);
    }
    const active = await this.activeRounds(cid);
    for (const spec of LOOP_BOSSES) {
      if (spec.maps.length === 0 || !active.has(spec.questId) || !spec.maps.includes(mapId)) continue;
      if (!mapBossPresent(spec, mapId, active, await this.objectives(cid, spec.questId))) continue;
      const row = this.mapRow(spec);
      if (row) out.push(row);
    }
    return out;
  }

  /** The boss NPC `npcId` stands on `mapId` for this character (clickNpc gate and the quest-battle fallback). */
  async present(cid: number, mapId: number, npcId: number): Promise<LoopBossSpec | null> {
    const spec = bossByNpc(npcId);
    if (!spec) return null;
    return (await this.scene(cid, mapId)).some((r) => r.nid === npcId) ? spec : null;
  }

  /** A map-mode round was just taken: its boss appears at once when the character stands on a listed map. */
  async roundTaken(cid: number, mapId: number, questId: number): Promise<Push[]> {
    const spec = bossByQuest(questId);
    if (!spec || !spec.maps.includes(mapId)) return [];
    const row = this.mapRow(spec);
    return row ? [push('onBossOn', { ...row, v: -1 })] : [];
  }

  /**
   * Order item use (useItem hook): null when `tid` is not an order item. The round must be active with its kill open; the
   * boss replaces the character's previous summon, 80 px right of the player, on a field map. The item is kept.
   */
  async summon(cid: number, mapId: number, tid: number): Promise<Push[] | null> {
    const spec = bossByItem(tid);
    if (!spec) return null;
    const note = (m: string): Push[] => [push('onSystemMidMsgOrNote', m)];
    const active = await this.activeRounds(cid);
    if (!active.has(spec.questId) || !hasUnfinishedKill(await this.objectives(cid, spec.questId))) {
      return note('Hiện không cần dùng vật phẩm này');
    }
    if (Number(this.gameData.getMap(mapId)?.safe_flag ?? 0) > 0) return note('Không thể triệu hồi ở khu vực an toàn');
    const doc = await this.chars.findById(cid, { posX: 1, posY: 1 }).lean();
    const x = (doc?.posX ?? 0) + SUMMON_OFFSET_X;
    const y = doc?.posY ?? 0;
    const row = this.row(spec, x, y);
    if (!row) return note('Hiện không cần dùng vật phẩm này');
    const prev = this.summons.get(cid);
    this.summons.set(cid, { questId: spec.questId, npcId: spec.npcId, mapId, x, y });
    const off = prev && prev.mapId === mapId && prev.npcId !== spec.npcId ? [push('onBossOff', prev.npcId)] : [];
    return [...off, push('onBossOn', { ...row, v: -1 })];
  }

  /** After kill credit: a loop-boss round whose kill just completed loses its boss (Go LoopBossDefeated). */
  async defeated(cid: number, questIds: readonly number[]): Promise<Push[]> {
    const out: Push[] = [];
    for (const questId of questIds) out.push(...(await this.defeatedOne(cid, questId)));
    return out;
  }

  private async defeatedOne(cid: number, questId: number): Promise<Push[]> {
    const spec = bossByQuest(questId);
    if (!spec || hasUnfinishedKill(await this.objectives(cid, questId))) return [];
    if (this.summons.get(cid)?.questId === questId) this.summons.delete(cid);
    return [push('onBossOff', spec.npcId)];
  }

  /** Round finished or cancelled: onBossOff and the leftover order items leave the bag. */
  async closed(cid: number, questId: number): Promise<Push[]> {
    const spec = bossByQuest(questId);
    if (!spec) return [];
    if (this.summons.get(cid)?.questId === questId) this.summons.delete(cid);
    const out: Push[] = [push('onBossOff', spec.npcId)];
    if (spec.itemId > 0) {
      const n = (await this.inventory.countByTemplate(cid, [spec.itemId])).get(spec.itemId) ?? 0;
      if (n > 0) {
        const spent = await this.inventory.removeByTemplate(cid, spec.itemId, n);
        for (const item of spent.updated) out.push(push('onAddCharactorSlot', item));
        for (const gone of spent.deleted) out.push(push('onDelCharactorSlot', gone.id, gone.sid));
      }
    }
    return out;
  }
}
