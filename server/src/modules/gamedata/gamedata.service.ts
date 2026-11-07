// Read-only access to the static game tables imported from the old Postgres `data` schema.
// Collections keep their original names (data_tbl_map, data_tbl_class, ...) and snake_case columns.
// Hot tables (map, class, npc, quest + require/pre/award, scene items) are cached in memory at startup.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { MapInfo, PetSoulTemplate, PetStoneTemplate, SceneNpc } from '@mc/shared';
import { buildRecipePlans, type RecipePlan } from './forge-data';
import { buildGuildBuildingTables, buildGuildSkillTables, type GuildBuildingTables, type GuildLot, type GuildSkillTables } from './guild-data';
import type { BuildingRow, GuildSkillRow } from '@mc/shared';
import { buildHeiyaoshiTables, type HeiyaoshiTables } from './heiyaoshi-data';
import { artifactRowAt, buildArtifactTables, cumulativeSpirit, type ArtifactRow, type ArtifactTables, type MwSkill } from './artifact-data';
import { buildStarTables, starKey, type StarTables, type StarTemplate } from './star-data';
import { buildFeatureTables, type AwakenRow, type AwakenSkillRow, type FeatureTables, type SoulRow, type WspRow } from './feature-data';
import { buildNameIndex, nameKey } from './name-index';
import { isNpcVisible } from './npc-visibility';
import { applyNpcOverrides, applyQuestOverrides, OVERLAYS, unionRows } from './overlays';
import { buildSceneItemTables, type SceneItemRow, type SceneItemTables } from './sceneitem-data';
import {
  buildCombatTables, type CombatTables, type CreatureTemplate, type LootRow, type MapCreatureRow,
} from './combat-data';
import { buildPetTables, type PetTables, type PetTemplate } from './pet-data';
import {
  buildPetDepthTables, guardKey, type HandbookRow, type PetContractRow, type PetDepthTables, type PetGuardRow, type PetTalentRow,
} from './pet-depth-data';
import { buildPetSoulTables, type PetSoulTables } from './pet-soul-data';
import { buildPpveTables, type CarveAwardRow, type CarveMasterRow, type CarveRow, type PpveTables } from './ppve-data';
import { buildPetStoneTables, type PetStoneTables } from './pet-stone-data';
import { buildSublimationTables, type SublimationTables, type SublimeRow } from './sublimation-data';
import { buildSkillIndex, buildSkillTable, skillsByName, type SkillIndex, type SkillTemplate } from './skill-data';
import {
  buildQuestTables, type QuestAwardRow, type QuestPreRow, type QuestRequireRow, type QuestTables, type QuestTemplate,
} from './quest-data';

export type Row = Record<string, unknown>;

/** Template columns read by the shop view, buy / sell and the bag (item and equipment tables share these names). */
const TEMPLATE_FIELDS = {
  id: 1, name: 1, icon_code: 1, color: 1, color_code: 1, info: 1, description: 1, gold: 1, honor: 1, price: 1,
  stack_max: 1, single_flag: 1, endure_max: 1,
  // character core: use / equip gates, potion amounts (i1/i2 for food) and equipment stat lines
  type: 1, use_type: 1, req_level: 1, req_class: 1, i1: 1, i2: 1, position: 1, kind: 1, bind_type: 1,
  main_prop1: 1, main_prop2: 1, main_prop_num1: 1, main_prop_num2: 1, prop1: 1, prop2: 1, prop_num1: 1, prop_num2: 1,
  bind_prop_num: 1, req_class_id: 1, skill_id: 1,
  // forge: crafting requirements, material level, gem chain
  makable: 1, require_item1: 1, require_item2: 1, require_item3: 1, require_num1: 1, require_num2: 1, require_num3: 1,
  level: 1, item_level: 1, next_jewel_tid: 1, prop_type: 1, propl_num: 1, hole_num: 1, t: 1,
  // forge upgrades: tier upgrade target, soul (active prop) template values
  next_equ_tid: 1, active_prop_type: 1, active_prop_num: 1,
  // magic weapon: pipe list of skill ids (first = base skill)
  artifact_skill: 1,
  // avatar: weapon art in hand, costume body art (res_code_male / female), flyer art (res_code + wav_code front overlay)
  res_code_male: 1, res_code_female: 1, res_code: 1, wav_code: 1,
};

@Injectable()
export class GameDataService implements OnModuleInit {
  private readonly logger = new Logger(GameDataService.name);
  private maps = new Map<number, Row>();
  private classes = new Map<number, Row>();
  private npcsByMap = new Map<number, Row[]>();
  private npcsById = new Map<number, Row>();
  private quests: QuestTables = buildQuestTables([], [], []);
  private sceneItems: SceneItemTables = buildSceneItemTables([], []);
  private shopsById = new Map<number, Row>();
  private shopSlotsBySid = new Map<number, Row[]>();
  private shopSlotsById = new Map<number, Row>();
  private creditsById = new Map<number, Row>();
  private creditsByShop = new Map<number, Row[]>();
  private buffs = new Map<number, Row>();
  private titles = new Map<number, Row>();
  private titleNames = new Map<string, number[]>();
  private creatureNames = new Map<string, number[]>();
  private achievements: Row[] = [];
  private achievementRequires: Row[] = [];
  private itemNames: Map<string, number[]> | null = null;
  private readonly npcCreatureRows = new Map<number, Row[]>();
  private combat: CombatTables = buildCombatTables([], []);
  private skills = new Map<number, SkillTemplate>();
  private skillsByName = new Map<string, SkillTemplate[]>(); // pet skill books resolve skills by exact name
  private skillIdx: SkillIndex = { byCode: new Map(), level1: [] };
  private pets: PetTables = buildPetTables([], []);
  private petDepth: PetDepthTables = buildPetDepthTables([], []);
  private petStones: PetStoneTables = buildPetStoneTables([], [], () => false);
  private petSouls: PetSoulTables = buildPetSoulTables([]);
  private ppve: PpveTables = buildPpveTables([], [], []);
  private sublimation: SublimationTables = buildSublimationTables([], []);
  private recipePlans = new Map<number, RecipePlan[]>();
  private makable: Row[] | null = null;
  private guildBuildings: GuildBuildingTables = buildGuildBuildingTables([], []);
  private guildSkills: GuildSkillTables = buildGuildSkillTables([]);
  private features: FeatureTables = buildFeatureTables([], [], [], []);
  private heiyaoshi: HeiyaoshiTables = buildHeiyaoshiTables([], [], [], [], []);
  private stars: StarTables = buildStarTables([]);
  private artifacts: ArtifactTables = buildArtifactTables([], []);

  constructor(@InjectConnection() private readonly conn: Connection) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.maps = await this.indexById('data_tbl_map');
    this.classes = await this.indexById('data_tbl_class');
    const npcs = applyNpcOverrides(await this.rowsWithOverlays('data_tbl_npc'));
    this.npcsByMap = new Map();
    this.npcsById = new Map();
    for (const npc of npcs) {
      this.npcsById.set(Number(npc.id), npc);
      const mapId = Number(npc.pos_map_id);
      if (!this.npcsByMap.has(mapId)) this.npcsByMap.set(mapId, []);
      this.npcsByMap.get(mapId)!.push(npc);
    }
    const [quests, requires, pres, awards] = await Promise.all([
      this.rows('data_tbl_quest').then(applyQuestOverrides),
      this.rowsWithOverlays('data_tbl_quest_require'),
      this.rows('data_tbl_quest_pre'),
      this.rows('data_tbl_quest_award'),
    ]);
    this.quests = buildQuestTables(quests, requires, pres, awards);
    const [instances, templates] = await Promise.all([
      this.rows('data_tbl_sceneitem_instance'),
      this.rows('data_tbl_sceneitem_template'),
    ]);
    this.sceneItems = buildSceneItemTables(instances, templates);
    this.shopsById = await this.indexById('data_tbl_shop');
    const shopSlots = await this.rows('data_tbl_shop_slot');
    shopSlots.sort((a, b) => Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id));
    this.shopSlotsBySid = new Map();
    this.shopSlotsById = new Map();
    for (const slot of shopSlots) {
      this.shopSlotsById.set(Number(slot.id), slot);
      const sid = Number(slot.sid);
      if (!this.shopSlotsBySid.has(sid)) this.shopSlotsBySid.set(sid, []);
      this.shopSlotsBySid.get(sid)!.push(slot);
    }
    const credits = await this.rows('data_tbl_credit');
    credits.sort((a, b) => Number(a.tab) - Number(b.tab) || Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id));
    this.creditsById = new Map();
    this.creditsByShop = new Map();
    for (const c of credits) {
      this.creditsById.set(Number(c.id), c);
      const sid = Number(c.shop_id);
      if (!this.creditsByShop.has(sid)) this.creditsByShop.set(sid, []);
      this.creditsByShop.get(sid)!.push(c);
    }
    this.buffs = new Map((await this.rowsWithOverlays('data_tbl_buff')).map((r) => [Number(r.id), r]));
    this.titles = await this.indexById('data_tbl_title');
    this.titleNames = buildNameIndex(this.titles.values(), 'n');
    this.achievements = await this.rows('data_tbl_achievement');
    this.achievementRequires = await this.rows('data_tbl_achievement_require');
    this.itemNames = null;
    const [mapCreatures, creatures, loot] = await Promise.all([
      this.rows('data_tbl_map_creature'), this.rows('data_tbl_creature'), this.rowsWithOverlays('data_tbl_creature_loot'),
    ]);
    this.combat = buildCombatTables(mapCreatures, creatures, loot);
    this.creatureNames = buildNameIndex(creatures, 'name');
    this.pets = buildPetTables(creatures, await this.rowsWithOverlays('data_tbl_creature_skill'));
    this.petDepth = buildPetDepthTables(
      await this.rows('data_tbl_pet_contract'), await this.rows('data_tbl_creature_handbook'),
      await this.rows('data_tbl_pet_guard'), await this.rows('data_tbl_pet_talent'),
    );
    this.skills = buildSkillTable(await this.rows('data_tbl_skill'));
    this.skillsByName = skillsByName(this.skills);
    this.skillIdx = buildSkillIndex(this.skills);
    this.petStones = buildPetStoneTables(
      await this.rows('data_tbl_pet_stone'), await this.rows('data_tbl_skill', { ex_stone_sid: { $gt: 0 } }), (id) => this.skills.has(id),
    );
    this.petSouls = buildPetSoulTables(await this.rows('data_tbl_pet_soul'));
    this.ppve = buildPpveTables(
      await this.rows('data_tbl_carve'), await this.rows('data_tbl_carve_award'), await this.rows('data_tbl_carve_master'), this.pets.templates.values(),
    );
    this.sublimation = buildSublimationTables(await this.rows('data_tbl_sublimation'), await this.rows('data_tbl_sublimation_pet'));
    this.recipePlans = buildRecipePlans(await this.rows('data_tbl_recipe_plan'));
    this.makable = null;
    this.guildBuildings = buildGuildBuildingTables(await this.rows('data_tbl_building'), await this.rows('data_tbl_extend_position', { mid: 49 }));
    this.guildSkills = buildGuildSkillTables(await this.rows('data_tbl_skill', { use_env: 4 }));
    this.features = buildFeatureTables(
      await this.rows('data_tbl_soul'), await this.rows('data_tbl_awakening'), await this.rows('data_tbl_awakening_skill'),
      await this.rows('data_tbl_war_sprite'),
    );
    this.heiyaoshi = buildHeiyaoshiTables(
      await this.rows('data_tbl_heiyaoshi_point'), await this.rows('data_tbl_heiyaoshi_point_link'), await this.rows('data_tbl_heiyaoshi_area'),
      await this.rows('data_tbl_heiyaoshi_area_attribute'), await this.rows('data_tbl_heiyaoshi_full_buff'),
    );
    this.stars = buildStarTables(await this.rows('data_tbl_stars_template'));
    this.artifacts = buildArtifactTables(await this.rows('data_tbl_artifact'), await this.rows('data_tbl_skill', { use_env: 5 }));
    this.logger.log(
      `Loaded ${this.maps.size} maps, ${this.classes.size} classes, ${npcs.length} npcs, ` +
        `${quests.length} quests (${requires.length} require, ${pres.length} pre, ${awards.length} award), ` +
        `${instances.length} scene items (${this.sceneItems.gates.length} gates), ` +
        `${this.shopsById.size} shops (${shopSlots.length} slots), ${this.buffs.size} buffs, ` +
        `${this.combat.creatures.size} creatures (${mapCreatures.length} map rows, ${loot.length} loot rows), ${this.skills.size} skills` +
        (this.maps.size === 0 ? ' — run `pnpm import:seeds` to populate static data' : ''),
    );
  }

  /** Rows of a base table with its M10 seed overlays applied (overlays.ts: same id replaced, new ids appended). */
  async rowsWithOverlays(base: string, filter: Row = {}): Promise<Row[]> {
    const extra = await Promise.all((OVERLAYS[base] ?? []).map((c) => this.rows(c, filter)));
    return unionRows(await this.rows(base, filter), extra);
  }

  async rows(collection: string, filter: Row = {}): Promise<Row[]> {
    return this.conn.db!.collection<Row>(collection).find(filter).toArray();
  }

  getMap(id: number): Row | undefined {
    return this.maps.get(id);
  }

  listMaps(): Row[] {
    return [...this.maps.values()];
  }

  getClass(id: number): Row | undefined {
    return this.classes.get(id);
  }

  listClasses(): Row[] {
    return [...this.classes.values()].sort((a, b) => Number(a.id) - Number(b.id));
  }

  getNpc(id: number): Row | undefined {
    return this.npcsById.get(id);
  }

  /** NPCs of a map that createNpcs shows at `now`: legacy `at` schedule and hidden list applied. */
  npcsOnMap(mapId: number, now = new Date()): Row[] {
    return (this.npcsByMap.get(mapId) ?? []).filter((r) => isNpcVisible(Number(r.id), r.at, now));
  }

  getQuest(id: number): QuestTemplate | undefined {
    return this.quests.byId.get(id);
  }

  questsByStartNpc(npcId: number): QuestTemplate[] {
    return this.quests.byStartNpc.get(npcId) ?? [];
  }

  questsByFinishNpc(npcId: number): QuestTemplate[] {
    return this.quests.byFinishNpc.get(npcId) ?? [];
  }

  questRequire(qid: number): QuestRequireRow[] {
    return this.quests.require.get(qid) ?? [];
  }

  questPre(qid: number): QuestPreRow[] {
    return this.quests.pre.get(qid) ?? [];
  }

  /** data_tbl_quest_award rows of a quest, in row id order. */
  questAwards(qid: number): QuestAwardRow[] {
    return this.quests.award.get(qid) ?? [];
  }

  /** All scene items placed on a map, joined with their template, by id. */
  sceneItemsOnMap(mapId: number): SceneItemRow[] {
    return this.sceneItems.byMap.get(mapId) ?? [];
  }

  sceneItem(id: number): SceneItemRow | undefined {
    return this.sceneItems.byId.get(id);
  }

  /** Transport gates (template type 3) of every map, by id. */
  transportGates(): SceneItemRow[] {
    return this.sceneItems.gates;
  }

  /** Lowest-id map whose trimmed name equals `name`, ignoring `exceptMapId`; undefined if none. */
  mapByName(name: string, exceptMapId = 0): Row | undefined {
    const want = name.trim();
    let best: Row | undefined;
    for (const m of this.maps.values()) {
      if (Number(m.id) === exceptMapId || String(m.name ?? '').trim() !== want) continue;
      if (!best || Number(m.id) < Number(best.id)) best = m;
    }
    return best;
  }

  getShop(id: number): Row | undefined {
    return this.shopsById.get(id);
  }

  /** Slots of a shop, sorted by position then id. */
  shopSlots(sid: number): Row[] {
    return this.shopSlotsBySid.get(sid) ?? [];
  }

  /** One shop slot row (data_tbl_shop_slot) by its id. */
  getShopSlot(id: number): Row | undefined {
    return this.shopSlotsById.get(id);
  }

  /** Credit point shop rows (data_tbl_credit) of a shop, sorted by tab, position, id. */
  creditRows(shopId: number): Row[] {
    return this.creditsByShop.get(shopId) ?? [];
  }

  /** One credit row by id. */
  credit(id: number): Row | undefined {
    return this.creditsById.get(id);
  }

  /** Buff template (data_tbl_buff) by id, cached at startup. */
  getBuff(id: number): Row | undefined {
    return this.buffs.get(id);
  }

  /** Title template (data_tbl_title: n name, a style, b buff id, k kind, s special flag), cached at startup. */
  getTitle(id: number): Row | undefined {
    return this.titles.get(id);
  }

  /** Every title template (startup cache). */
  allTitles(): IterableIterator<Row> {
    return this.titles.values();
  }

  /** Lowest title id whose name equals `name` (case / spacing insensitive), or undefined. */
  titleIdByName(name: string): number | undefined {
    return this.titleNames.get(nameKey(name))?.[0];
  }

  /** Creature template ids whose name equals `name` exactly (achievement kill targets). */
  creatureIdsByName(name: string): readonly number[] {
    return this.creatureNames.get(nameKey(name)) ?? [];
  }

  /** Raw achievement tables (data_tbl_achievement / data_tbl_achievement_require), cached at startup. */
  achievementRows(): readonly Row[] {
    return this.achievements;
  }

  achievementRequireRows(): readonly Row[] {
    return this.achievementRequires;
  }

  /** Lowest item template id (data_tbl_item_template) with this exact name, or undefined; the name table loads on first use. */
  async itemIdByName(name: string): Promise<number | undefined> {
    if (!this.itemNames) {
      const rows = await this.conn.db!.collection<Row>('data_tbl_item_template').find({}, { projection: { id: 1, name: 1 } }).toArray();
      this.itemNames = buildNameIndex(rows, 'name');
    }
    return this.itemNames.get(nameKey(name))?.[0];
  }

  /** Spawn rows (data_tbl_map_creature) of a map, boss rows included. */
  mapCreatures(mapId: number): MapCreatureRow[] {
    return this.combat.mapCreatures.get(mapId) ?? [];
  }

  /** data_tbl_npc_creature rows of an NPC's line-up (hitNpc), cached per nid on first use. */
  async npcCreatures(nid: number): Promise<Row[]> {
    let hit = this.npcCreatureRows.get(nid);
    if (!hit) {
      hit = await this.rowsWithOverlays('data_tbl_npc_creature', { nid });
      this.npcCreatureRows.set(nid, hit);
    }
    return hit;
  }

  creature(id: number): CreatureTemplate | undefined {
    return this.combat.creatures.get(id);
  }

  /** Creature as a pet template (catch / class / quality / icon columns), cached at startup. */
  petTemplate(id: number): PetTemplate | undefined {
    return this.pets.templates.get(id);
  }

  /** Khe Uoc level row (1..50) of data_tbl_pet_contract, cached at startup. */
  petContract(level: number): PetContractRow | undefined {
    return this.petDepth.contracts.get(level);
  }

  /** Every Sach Tien Hoa entry (data_tbl_creature_handbook), ordered by id, cached at startup. */
  creatureHandbooks(): readonly HandbookRow[] {
    return this.petDepth.handbooks;
  }

  /** Chien Thu Ho Ve row (level 1..30, guard sid 1..4) of data_tbl_pet_guard, cached at startup. */
  petGuard(lev: number, sid: number): PetGuardRow | undefined {
    return this.petDepth.guards.get(guardKey(lev, sid));
  }

  /** Thien Phu record by id (data_tbl_pet_talent), cached at startup. */
  petTalent(id: number): PetTalentRow | undefined {
    return this.petDepth.talents.get(id);
  }

  /** Thang hoa level row (1..50) of data_tbl_sublimation_pet (`pet`) or data_tbl_sublimation (character gear), cached at startup. */
  sublimeRow(pet: boolean, level: number): SublimeRow | undefined {
    return (pet ? this.sublimation.pet : this.sublimation.character).get(level);
  }

  /** Pet stone record (data_tbl_pet_stone) by id, cached at startup. */
  petStone(id: number): PetStoneTemplate | undefined {
    return this.petStones.stones.get(id);
  }

  /** Ids of the regular (non-energy) pet stones of a level, ascending (Thu Thach random bags 6040-6044). */
  petStoneIdsAtLevel(level: number): number[] {
    return [...this.petStones.stones.values()].filter((s) => s.level === level && !s.energyFlag).map((s) => s.id).sort((a, b) => a - b);
  }

  /** Menh Hon row (data_tbl_pet_soul) by id, cached at startup. */
  petSoul(id: number): PetSoulTemplate | undefined {
    return this.petSouls.byId.get(id);
  }

  /** The gem family ladder (level 1 up) the id belongs to; empty for an unknown id. */
  petSoulLadder(id: number): readonly PetSoulTemplate[] {
    return this.petSouls.ladderOf.get(id) ?? [];
  }

  /** Prey pools: crystal N draws from colour N - 1 (Lv.1, type -1); the advanced pool is { ordinary, rare }. */
  petSoulPreyPool(color: number): readonly number[] {
    return this.petSouls.preyByColor.get(color) ?? [];
  }

  petSoulAdvancedPools(): { ordinary: readonly number[]; rare: readonly number[] } {
    return { ordinary: this.petSouls.advancedOrdinary, rare: this.petSouls.advancedRare };
  }

  /** changePetStoneEnergy draw pool: type 1 passive base skills, type 2 special ex-stone skills (sorted ids). */
  petStoneSkillPool(type: number): readonly number[] {
    return type === 2 ? this.petStones.specialSkills : this.petStones.passiveSkills;
  }

  /** Khac Van node (data_tbl_carve) by id, cached at startup. */
  carve(id: number): CarveRow | undefined {
    return this.ppve.carves.get(id);
  }

  /** Reward row of PPVE floor 1..150 (data_tbl_carve_award). */
  carveAward(floor: number): CarveAwardRow | undefined {
    return this.ppve.awards.get(floor);
  }

  /** Master level row 1..48 (data_tbl_carve_master). */
  carveMaster(mlv: number): CarveMasterRow | undefined {
    return this.ppve.masters.get(mlv);
  }

  /** The floor enemy pool: qLevel 1..3 creatures with a 2060* res code, sorted by id. */
  ppveEnemyPool(): readonly PetTemplate[] {
    return this.ppve.enemyPool;
  }

  /** Every Thien Phu record ordered by id. */
  petTalents(): readonly PetTalentRow[] {
    return this.petDepth.talentList;
  }

  /** data_tbl_creature.class_id of a creature (0 when unknown): the auction pet search type is 700 + class_id - 1. */
  creatureClassId(id: number): number {
    return this.pets.templates.get(id)?.classId ?? 0;
  }

  /** Default skill ids of a creature (data_tbl_creature_skill), ordered by position then id. */
  creatureSkillIds(cid: number): readonly number[] {
    return this.pets.creatureSkills.get(cid) ?? [];
  }

  /** Skill template (data_tbl_skill), cached at startup. */
  skill(id: number): SkillTemplate | undefined {
    return this.skills.get(id);
  }

  /** M9 skill window: code_name families (levels ascending) and every level-1 row. */
  skillIndex(): SkillIndex {
    return this.skillIdx;
  }

  /** Skills with exactly this name, lowest level first (pet skill books). */
  skillsNamed(name: string): readonly SkillTemplate[] {
    return this.skillsByName.get(name) ?? [];
  }

  /** Loot rows of a creature (data_tbl_creature_loot), cached at startup. */
  creatureLoot(creatureId: number): LootRow[] {
    return this.combat.loot.get(creatureId) ?? [];
  }

  /** Craft success plan rows of a recipe (equipment template id), cached at startup. */
  recipePlan(recipeId: number): readonly RecipePlan[] {
    return this.recipePlans.get(recipeId) ?? [];
  }

  /** Guild building templates (data_tbl_building) and the lots of the guild map, cached at startup. */
  guildBuildingRows(): BuildingRow[] {
    return [...this.guildBuildings.rows.values()];
  }

  guildBuildingRow(id: number): BuildingRow | undefined {
    return this.guildBuildings.rows.get(id);
  }

  guildLots(): GuildLot[] {
    return this.guildBuildings.lots;
  }

  /** Guild skill rows (data_tbl_skill use_env 4 with a develop cost): by id and per chain (levels ascending). */
  guildSkillRow(id: number): GuildSkillRow | undefined {
    return this.guildSkills.byId.get(id);
  }

  guildSkillChains(): Map<string, GuildSkillRow[]> {
    return this.guildSkills.chains;
  }

  /** Train soul row of a level (data_tbl_soul id = level 1..100), cached at startup. */
  soulRow(level: number): SoulRow | undefined {
    return this.features.soul.get(level);
  }

  /** Awakening row of a TARGET level (data_tbl_awakening id = level 1..77) and the skill rows, cached at startup. */
  awakenRow(level: number): AwakenRow | undefined {
    return this.features.awakening.get(level);
  }

  awakenSkillRow(id: number): AwakenSkillRow | undefined {
    return this.features.awakenSkills.get(id);
  }

  awakenSkillRows(): AwakenSkillRow[] {
    return [...this.features.awakenSkills.values()];
  }

  /** War sprite template (data_tbl_war_sprite: kind 1 level-up chain, kind 2 evolve chain), cached at startup. */
  warSpriteRow(id: number): WspRow | undefined {
    return this.features.warSprites.get(id);
  }

  /** Heiyaoshi topology (points / links, stage-1 triangles, completion bonuses), cached at startup. */
  heiyaoshiTables(): HeiyaoshiTables {
    return this.heiyaoshi;
  }

  /** Zodiac star template by row id or by (type 1..12, level 1..12), cached at startup. */
  starTemplate(id: number): StarTemplate | undefined {
    return this.stars.byId.get(id);
  }

  starTemplateAt(type: number, level: number): StarTemplate | undefined {
    return this.stars.byTypeLevel.get(starKey(type, level));
  }

  /** Magic weapon ladder row of a main template at a level (data_tbl_artifact, 50 levels per tid), cached at startup. */
  artifactRow(tid: number, level: number): ArtifactRow | undefined {
    return artifactRowAt(this.artifacts, tid, level);
  }

  /** Spirituality paid to reach `level` from 0 (resolve refund base). */
  artifactSpiritTotal(tid: number, level: number): number {
    return cumulativeSpirit(this.artifacts, tid, level);
  }

  /** Magic weapon skills (data_tbl_skill use_env = 5): the reset pool and the name lookup. */
  mwSkills(): ReadonlyMap<number, MwSkill> {
    return this.artifacts.skills;
  }

  /** Equipment templates with makable == 1 (the craft recipes), loaded once and cached. */
  async makableEquipment(): Promise<Row[]> {
    if (!this.makable) {
      this.makable = await this.conn.db!.collection<Row>('data_tbl_equipt_template')
        .find({ makable: 1, require_item1: { $gt: 0 } }, { projection: { ...TEMPLATE_FIELDS } }).sort({ req_level: 1, id: 1 }).toArray();
    }
    return this.makable;
  }

  /** Item (type 29) or equipment (type 19) template by id, queried on demand; undefined if unknown. */
  async template(type: number, id: number): Promise<Row | undefined> {
    return (await this.templatesByIds(type, [id])).get(id);
  }

  /** Item (any type but 19) or equipment (19) templates by id in one query; used by the shop view and the bag. */
  async templatesByIds(type: number, ids: number[]): Promise<Map<number, Row>> {
    const out = new Map<number, Row>();
    if (ids.length === 0) return out;
    const collection = type === 19 ? 'data_tbl_equipt_template' : 'data_tbl_item_template';
    const projection = { ...TEMPLATE_FIELDS };
    const rows = await this.conn.db!.collection<Row>(collection).find({ id: { $in: ids } }, { projection }).toArray();
    for (const row of rows) out.set(Number(row.id), row);
    return out;
  }

  /** Name of an item (table type 29) or equipment (type 19) template, queried on demand; '#<id>' if unknown. */
  async templateName(type: number, id: number): Promise<string> {
    const collection = type === 19 ? 'data_tbl_equipt_template' : type === 29 ? 'data_tbl_item_template' : null;
    if (!collection) return `#${id}`;
    const row = await this.conn.db!.collection<{ _id: number; name?: unknown }>(collection).findOne({ _id: id }, { projection: { name: 1 } });
    return row?.name ? String(row.name) : `#${id}`;
  }

  toMapInfo(row: Row): MapInfo {
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      type: Number(row.type ?? 1),
      resCode: String(row.res_code ?? 0),
      safeX: Number(row.safe_x ?? 0),
      safeY: Number(row.safe_y ?? 0),
      safeFlag: Number(row.safe_flag ?? 0),
      pk: Number(row.pk ?? 0),
      mMap: Number(row.m_map ?? 0),
      sArea: String(row.s_area ?? '0'),
      info: String(row.info ?? ''),
    };
  }

  toSceneNpc(row: Row): SceneNpc {
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      posX: Number(row.pos_x ?? 0),
      posY: Number(row.pos_y ?? 0),
      posDir: Number(row.pos_dir ?? 0),
      iconCode: String(row.icon_code ?? 0),
      resCode: String(row.res_code ?? 0),
      type: Number(row.type ?? 0),
      subType: String(row.sub_type ?? ''),
      questState: -1,
      miniMap: Number(row.mini_map ?? 0),
    };
  }

  private async indexById(collection: string): Promise<Map<number, Row>> {
    const out = new Map<number, Row>();
    for (const row of await this.rows(collection)) out.set(Number(row.id), row);
    return out;
  }
}
