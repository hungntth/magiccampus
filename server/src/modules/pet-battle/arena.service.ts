// Pet arena owner operations (Go application/petarena service.go RegisterArenaEntry, limits.go, rank_award.go): petArenaTicket,
// addPetFightNum, clearArenaCD, getPetRankAward and the non-arena line-up (petFightConf / getPetConf). Every one runs under the character
// lock, validates before it charges and charges before it credits (a failed save refunds the gold); a refusal changes nothing and is a
// line of the arena log (addArenaLog) or a note. Methods return the ordered pushes the RPC layer sends.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PetArenaConf, PetArenaRow, PlayerUpdate } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { Pet } from '../pet/pet.schema';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { PetArenaReward } from './arena-entry.schema';
import {
  ARENA_TEXT, addFightCost, arenaConfInputRefusal, arenaRegisterRefusal, arenaSlots, buyFight, clearCooldownCost, cooldownLeft, isTeamNameSet,
  normalizeArenaConf, previousWeekSeason, rankAward, teamNameValid,
} from './arena-rules';
import { ArenaStateService } from './arena-state.service';
import { ArenaViewService } from './arena-view.service';

const FARM_FEATURE = 'pet_fight_conf';
const note = (text: string): Push => push('onSystemMidMsgOrNote', text);
const log = (text: string): Push => push('addArenaLog', text);
const DUPLICATE_KEY = 11000;

/** The `{"5": {pid, pos, cmdList}}` map of the valid slots (one per pet, keyed by position). */
const confOf = (slots: ReturnType<typeof arenaSlots>): PetArenaConf => Object.fromEntries(slots.map((s) => [String(s.pos), s]));

@Injectable()
export class ArenaService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(PetArenaReward.name) private readonly rewards: Model<PetArenaReward>,
    private readonly state: ArenaStateService,
    private readonly view: ArenaViewService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly features: FeatureStoreService,
  ) {}

  /** petArenaTicket(name | "nl", conf): registers or updates this week's team, then the refreshed list. */
  register(characterId: number, rawName: unknown, rawConf: unknown): Promise<{ pushes: Push[]; enemies: PetArenaRow[] | null }> {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const refusal = arenaConfInputRefusal(rawConf) ?? (teamNameValid(name) ? null : ARENA_TEXT.teamName);
    if (refusal) return Promise.resolve({ pushes: [note(refusal)], enemies: null });
    return withCharLock(characterId, async () => {
      const me = await this.state.character(characterId);
      if (!me) return { pushes: [note(ARENA_TEXT.fightFailed)], enemies: null };
      const slots = arenaSlots(normalizeArenaConf(rawConf));
      const rows = await this.pets.find({ _id: { $in: slots.map((s) => s.pid) }, characterId }, { tid: 1, binded: 1 }).lean();
      const why = arenaRegisterRefusal(rows.map((r) => ({ id: r._id, tid: r.tid, binded: r.binded })), slots, me.level);
      if (why) return { pushes: [note(why)], enemies: null };
      const existing = await this.state.entryOf(characterId);
      // A real name replaces the stored one; "nl" keeps it (Go IsTeamNameSet).
      const teamName = isTeamNameSet(name) || !existing || !isTeamNameSet(existing.teamName) ? name : existing.teamName;
      await this.state.register(characterId, { teamName, conf1: confOf(slots) });
      const enemies = await this.view.enemies(characterId);
      return { pushes: [push('onGetEnemies', enemies), note(ARENA_TEXT.registered)], enemies };
    });
  }

  /** addPetFightNum: +1 turn today for (max - 19) * 5 gold, up to 30. Always ends with addArenaNum({f, max}). */
  addFightNum(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const entry = await this.state.entryOf(characterId);
      if (!entry) return [log(ARENA_TEXT.register), push('addArenaNum', { f: false, max: 20 })];
      const next = { ...entry };
      if (!buyFight(next)) return [log(ARENA_TEXT.turnsCapped), push('addArenaNum', { f: false, max: entry.maxFights })];
      const cost = addFightCost(entry.maxFights);
      const paid = await this.characters.spendMoney(characterId, 'gold', cost);
      if (paid === null) return [log(ARENA_TEXT.noGold), push('addArenaNum', { f: false, max: entry.maxFights })];
      await this.saveOrRefund(characterId, { maxFights: next.maxFights }, cost);
      return [...this.goldPushes(characterId, cost, paid), push('addArenaNum', { f: true, max: next.maxFights })];
    });
  }

  /** clearArenaCD: ends the cooldown for ceil(seconds left / 30) gold. `done` is the reply (false = nothing changed). */
  clearCooldown(characterId: number): Promise<{ done: boolean; pushes: Push[] }> {
    return withCharLock(characterId, async () => {
      const entry = await this.state.entryOf(characterId);
      if (!entry) return { done: false, pushes: [log(ARENA_TEXT.register)] };
      const cost = clearCooldownCost(cooldownLeft(entry, this.state.now()));
      if (cost <= 0) return { done: true, pushes: [] };
      const paid = await this.characters.spendMoney(characterId, 'gold', cost);
      if (paid === null) return { done: false, pushes: [log(ARENA_TEXT.noGold)] };
      await this.saveOrRefund(characterId, { cooldownEndsAt: 0 }, cost);
      return { done: true, pushes: this.goldPushes(characterId, cost, paid) };
    });
  }

  /** getPetRankAward: last week's rank pays once per season: the claim row is written first, the points after (a failed credit drops the claim). */
  claimRankAward(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const entry = await this.state.entryOf(characterId);
      if (!entry) return [log(ARENA_TEXT.register)];
      const rank = entry.lastRank + 1;
      const me = await this.state.character(characterId);
      const points = me && entry.lastRank >= 0 ? rankAward(await this.state.groupOf(characterId), rank) : 0;
      if (points <= 0) return [log(ARENA_TEXT.awardNone)];
      const season = previousWeekSeason(this.state.now());
      try {
        await this.rewards.create({ season, characterId, rank, points });
      } catch (e) {
        if ((e as { code?: number }).code === DUPLICATE_KEY) return [log(ARENA_TEXT.awardClaimed)];
        throw e;
      }
      let total: number;
      try {
        total = await this.currencies.credit(characterId, 'paPnt', points);
      } catch (e) {
        await this.rewards.deleteOne({ season, characterId });
        throw e;
      }
      return [await this.paPush(characterId, total), log(ARENA_TEXT.awardDone(rank, points))];
    });
  }

  /** onUPP {paPnt, currencies}: the new Diem Dau Pet total (Flash Player.paPnt) and the whole currency map the H5 client reads. */
  async paPush(characterId: number, total: number): Promise<Push> {
    const update: PlayerUpdate = { paPnt: total, currencies: await this.currencies.balances(characterId) };
    return push('onUPP', update);
  }

  // --- non-arena line-up (petFightConf / getPetConf) --------------------------------------------------------------------------
  /** petFightConf(conf, 1, isXiulianshi): stored as is for the character; the reply callback differs for the Tu Luyen Thach tab. */
  async saveFarmConf(characterId: number, rawConf: unknown, xiulianshi: boolean): Promise<Push[]> {
    const conf = normalizeArenaConf(rawConf);
    await this.features.put(characterId, FARM_FEATURE, { conf1: conf });
    return [push(xiulianshi ? 'onSubPetConfMT' : 'onSubPetConf', true)];
  }

  async farmConf(characterId: number): Promise<{ conf1: PetArenaConf }> {
    const stored = await this.features.get<{ conf1?: PetArenaConf }>(characterId, FARM_FEATURE, {});
    return { conf1: stored.conf1 ?? {} };
  }

  // --- helpers ----------------------------------------------------------------------------------------------------------------
  /** Writes the entry fields after the gold was taken; a failed write gives the gold back. */
  private async saveOrRefund(characterId: number, fields: Parameters<ArenaStateService['patch']>[1], gold: number): Promise<void> {
    try {
      await this.state.patch(characterId, fields);
    } catch (e) {
      await this.characters.addMoney(characterId, 'gold', gold);
      throw e;
    }
  }

  private goldPushes(characterId: number, spent: number, total: number): Push[] {
    return [push('onAddMoney', characterId, 'gold', -spent, total), push('onUPP', { gold: total } satisfies PlayerUpdate)];
  }
}
