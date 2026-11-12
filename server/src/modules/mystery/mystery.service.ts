// Mật Bảo service (M13 phase F): reads (bag, codex, skill, allowance, collection buffs), makeMysTre and addLimitMakeTimes. State = feature `mystery_treasure`. Every
// mutation runs under withCharLock: validate (pure rules) -> spend (materials / gold, conditional) -> write -> pushes. The dissolve lives in MysteryResolveService,
// the book learning in MysteryBooksService (inside useItem's lock).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, MYS, MYS_TEXT, SlotType, dayKey, mysAddTimesCost, rightEnabled, rightValue, type MakeMysTreReply, type MysBag, type MysBook, type MysBuffByKind, type MysBuffSimple,
  type MysCatalog, type MysLimit, type MysMakeData,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { ForgeItemsService } from '../forge/forge-items.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { sendPushes } from '../inventory/pushes';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { PmStateService } from '../vip/pm-state.service';
import {
  applyCraft, buffByKind, buffSimple, checkMats, collectedRows, collectionTotals, craftsLeft, isError, isLearned, pickCraftOutput, resolveInputs, rollDay,
  type OwnedStack,
} from './mystery-rules';
import { MYSTERY_FEATURE_KEY, bagWire, bookWire, encodeMystery, makeData, parseMystery, type MysteryState } from './mystery-state';

const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

@Injectable()
export class MysteryService {
  private catalogCache: MysCatalog | null = null;
  /** Injectable clock and dice (tests / smoke); roll(n) = 0..n-1. */
  now: () => number = () => Date.now();
  roll: (n: number) => number = (n) => Math.floor(Math.random() * n);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly stats: CharacterStatsService,
    private readonly vip: PmStateService,
    private readonly forgeItems: ForgeItemsService,
  ) {}

  today(): string {
    return dayKey(this.now());
  }

  load(cid: number): Promise<MysteryState> {
    return this.store.get(cid, MYSTERY_FEATURE_KEY, {}).then(parseMystery);
  }

  save(cid: number, state: MysteryState): Promise<void> {
    return this.store.put(cid, MYSTERY_FEATURE_KEY, encodeMystery(state));
  }

  /** VIP right 28: extra crafts a day at the character's VIP level (0 without it). */
  async vipBonus(cid: number): Promise<number> {
    const right = (await this.vip.rights()).find((r) => r.id === MYS.PM_RIGHT_MAKE_TIMES);
    const level = await this.vip.levelOf(cid);
    return right && rightEnabled(right, level) ? Math.max(0, rightValue(right, level) ?? 0) : 0;
  }

  /** Ids of the recipes that are free from the start (level 1). */
  level1Ids(): number[] {
    return this.gameData.mystreRecipes().filter((r) => r.level <= 1).map((r) => r.id);
  }

  /** H5 getMysCatalog: the 66 recipes (materials with their names / icons) + 720 pieces (the client has no tables). */
  async catalog(): Promise<MysCatalog> {
    if (this.catalogCache) return this.catalogCache;
    const recipes = this.gameData.mystreRecipes();
    const tpls = await this.gameData.templatesByIds(29, [...new Set(recipes.flatMap((r) => r.mats.map((m) => m.t)))]);
    const named = recipes.map((r) => ({ ...r, mats: r.mats.map((m) => ({ ...m, name: String(tpls.get(m.t)?.name ?? `#${m.t}`).trim(), ic: String(tpls.get(m.t)?.icon_code ?? 0) })) }));
    return (this.catalogCache = { recipes: named, items: this.gameData.mystres() });
  }

  async bag(cid: number): Promise<MysBag> {
    return bagWire(await this.load(cid));
  }

  async book(cid: number): Promise<MysBook> {
    return bookWire(await this.load(cid));
  }

  async makeDataOf(cid: number): Promise<MysMakeData> {
    return makeData(await this.load(cid), this.level1Ids());
  }

  /** onGetMakeLimitTimes: crafts left today (read only; the day roll is written by the next mutation). */
  async limit(cid: number): Promise<MysLimit> {
    const state = await this.load(cid);
    rollDay(state, this.today());
    return { n: craftsLeft(state, await this.vipBonus(cid)), t: state.make.day };
  }

  /** onGetMysAddTimes: purchases made today. */
  async addTimes(cid: number): Promise<MysLimit> {
    const state = await this.load(cid);
    rollDay(state, this.today());
    return { n: state.make.addTimes, t: state.make.day };
  }

  /** The collected rows (codex + bag) of `kind` (0 = all) and the stat totals they give. */
  async collection(cid: number, kind = 0): Promise<ReturnType<typeof collectionTotals>> {
    return collectionTotals(collectedRows(await this.load(cid), (id) => this.gameData.mystre(id), kind));
  }

  async buffByKind(cid: number, kind: number): Promise<MysBuffByKind> {
    return buffByKind(await this.collection(cid, kind));
  }

  async buffSimple(cid: number): Promise<MysBuffSimple> {
    return buffSimple(await this.collection(cid));
  }

  /** addLimitMakeTimes: gold (unbound) for one more craft today; the tier price follows the purchases of the day. */
  buy(session: Session): Promise<MysLimit> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      rollDay(state, this.today());
      const cost = mysAddTimesCost(state.make.addTimes);
      if (cost === null) return refuse(MYS_TEXT.BUY_DONE);
      const gold = await this.characters.spendMoney(cid, 'gold', cost);
      if (gold === null) return refuse(MYS_TEXT.NO_GOLD);
      state.make.addTimes += 1;
      try {
        await this.save(cid, state);
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', cost);
        throw e;
      }
      const n = craftsLeft(state, await this.vipBonus(cid));
      session.callback('onUPP', { gold });
      session.callback('onAddMoney', cid, 'gold', -cost, gold);
      session.callback('updateMysTreMakeTimes', n);
      return { n, t: state.make.day };
    });
  }

  private async ownedStacks(cid: number, ids: number[]): Promise<Map<number, OwnedStack>> {
    const rows = await this.items.find({ _id: { $in: ids }, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    return new Map(rows.map((r) => [r._id, { id: r._id, tid: r.templateId, color: r.colorCode, num: r.stackCount }]));
  }

  /** makeMysTre(recipeId, {slot:{idx}}, {slot:stack}): materials are spent first (whole recipe or nothing), then the product is written. */
  make(session: Session, recipeId: number, slots: unknown, stacks: unknown): Promise<MakeMysTreReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      rollDay(state, this.today());
      const recipe = this.gameData.mystreRecipe(recipeId);
      if (!recipe) return refuse(MYS_TEXT.NO_RECIPE);
      if (state.skiLvl < recipe.level) return refuse(MYS_TEXT.SKILL_LEVEL(recipe.level));
      if (!isLearned(state, recipe)) return refuse(MYS_TEXT.NOT_LEARNED);
      const vip = await this.vipBonus(cid);
      if (craftsLeft(state, vip) <= 0) return refuse(MYS_TEXT.NO_LIMIT);
      const inputs = resolveInputs(recipe, slots, stacks);
      if (isError(inputs)) return refuse(inputs.error);
      const mats = checkMats(inputs, await this.ownedStacks(cid, inputs.map((i) => i.itemId)));
      if (isError(mats)) return refuse(mats.error);
      const piece = pickCraftOutput(this.gameData.mystreGroup(recipe.kind, recipe.level), this.roll);
      if (!piece) return refuse(MYS_TEXT.NO_OUTPUT);
      const room = Object.values(state.bag).some((s) => s.mid === piece.id) || Object.keys(state.bag).length < MYS.BAG_SLOTS;
      if (!room) return refuse(MYS_TEXT.BAG_FULL);
      const spent = await this.forgeItems.consume(cid, mats.takes);
      const applied = applyCraft(state, piece)!;
      await this.save(cid, state);
      const n = craftsLeft(state, vip);
      sendPushes(session, spent.pushes);
      session.callback('updateMysTreMakeTimes', n);
      session.callback('updateMysTreBag', bagWire(state));
      session.callback('updateMysTreMakeData', makeData(state, this.level1Ids()));
      if (applied.fresh) {
        session.callback('updateMysTreBook', bookWire(state));
        session.callback('onActiveMysBookInfo', { t: MYS.ACTIVE_BOOK_KIND, id: piece.id });
        for (const u of await this.stats.gearChangeUpdates(cid)) session.callback('onUPP', u);
      }
      session.callback('onBlueMsg', MYS_TEXT.CRAFTED(piece.name, piece.star, applied.fresh));
      if (applied.skillUp) session.callback('onSystemMidMsgOrNote', MYS_TEXT.SKILL_UP(state.skiLvl));
      return { id: piece.id, kind: piece.kind, star: piece.star, fresh: applied.fresh, n };
    });
  }
}
