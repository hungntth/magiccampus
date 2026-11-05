// petArenaFight (Go application/petarena fight.go + replay_fight.go): one challenge on the headless pet runner. The attacker's pets stand at
// slots 15..19 (positions 5..9 + 10) against the defender's at 5..9, both from their saved cmdList scripts under the stat context `arena`
// (loaded from the database, so an offline defender fights too). An unfinished 24-round fight goes to the higher remaining-HP share, the
// attacker on a tie. Order: validate (refusals only write an arena log line), simulate, spend the turn / cooldown and move the ratings,
// swap the ladder, then credit the points. Runs under the attacker's character lock and the ladder lock.

import { Injectable } from '@nestjs/common';
import { arenaGroupOf, PPVE_RESULT, type PetArenaFightPush, type PetArenaRow } from '@mc/shared';
import { type Rng } from '../combat/battle.types';
import { NpcSkillCatalog } from '../combat/npc-skill-catalog';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { CurrencyService } from '../progression/currency.service';
import { ARENA_TEXT, arenaSlots, challengePoints, climbMilestone, fightBlocker, isTopRise, recordFight, settleFight } from './arena-rules';
import { ArenaFeedService } from './arena-feed.service';
import { ArenaNotifyService } from './arena-notify.service';
import { ArenaStateService } from './arena-state.service';
import { ArenaViewService } from './arena-view.service';
import { PetLineupService } from './pet-lineup.service';
import type { PetScript } from './pet-script';
import { simulatePetBattle, winnerByHp } from './pet-sim';
import { ReplayStore } from './replay.store';
import { ArenaService } from './arena.service';

/** Callback names of one fight flavour: the ladder fight or its H5 activity alias. */
export interface FightCallbacks {
  fight: string;
  log: string;
}

export interface FightReply {
  pushes: Push[];
  /** The attacker's onPetArenaFight payload, null when the challenge was refused (the refusal is an arena log line in `pushes`). */
  payload: PetArenaFightPush | null;
}

const refuse = (cb: FightCallbacks, text: string): FightReply => ({ pushes: [push(cb.log, text)], payload: null });
/** Position 5..9 of a saved line-up -> battle slot: the defender stands at 5..9, the attacker at 15..19. */
const ATTACKER_SLOT = (pos: number): number => pos + 10;
const DEFENDER_SLOT = (pos: number): number => pos;

@Injectable()
export class ArenaFightService {
  /** Swappable for tests / tools. */
  rng: Rng = Math.random;

  constructor(
    private readonly state: ArenaStateService,
    private readonly view: ArenaViewService,
    private readonly feed: ArenaFeedService,
    private readonly notify: ArenaNotifyService,
    private readonly lineups: PetLineupService,
    private readonly replays: ReplayStore,
    private readonly currencies: CurrencyService,
    private readonly arena: ArenaService,
    private readonly data: GameDataService,
    private readonly npcSkills: NpcSkillCatalog,
  ) {}

  fight(attackerId: number, defenderId: number, cb: FightCallbacks): Promise<FightReply> {
    if (attackerId === defenderId) return Promise.resolve(refuse(cb, ARENA_TEXT.fightFailed));
    return withCharLock(attackerId, () => this.state.withLadder(() => this.run(attackerId, defenderId, cb)));
  }

  private async run(attackerId: number, defenderId: number, cb: FightCallbacks): Promise<FightReply> {
    const entry = await this.state.entryOf(attackerId);
    if (!entry) return refuse(cb, ARENA_TEXT.register);
    const now = this.state.now();
    const blocked = fightBlocker(entry, now);
    if (blocked) return refuse(cb, blocked === 'noTurns' ? ARENA_TEXT.noTurns : ARENA_TEXT.cooldown);
    const me = await this.state.character(attackerId);
    const foe = await this.state.character(defenderId);
    if (!me || !foe) return refuse(cb, ARENA_TEXT.fightFailed);

    const group = arenaGroupOf(me.level);
    const ladder = await this.state.loadLadder(group);
    const att = ladder.members.get(attackerId);
    const def = ladder.members.get(defenderId); // missing = not registered this week or in another level group
    if (!att || !def) return refuse(cb, ARENA_TEXT.fightFailed);
    const [top, bottom] = await Promise.all([
      this.lineups.load(attackerId, { slots: arenaSlots(att.entry.conf1), ctx: 'arena', side: 'player', slotOf: ATTACKER_SLOT }),
      this.lineups.load(defenderId, { slots: arenaSlots(def.entry.conf1), ctx: 'arena', side: 'enemy', slotOf: DEFENDER_SLOT }),
    ]);
    if (top.fighters.length === 0 || bottom.fighters.length === 0) return refuse(cb, ARENA_TEXT.fightFailed);

    const scripts = new Map<number, PetScript>([...top.scripts, ...bottom.scripts]);
    const sim = simulatePetBattle({
      fighters: [...top.fighters, ...bottom.fighters], scripts, skill: (id) => this.data.skill(id), rng: this.rng, env: this.npcSkills,
      battleFieldId: `arena_${attackerId}_${defenderId}`,
    });
    const won = sim.outcome === PPVE_RESULT.WIN || (sim.outcome === PPVE_RESULT.NOT_END && winnerByHp(sim.hpShare) === 'player');
    const replay = this.replays.put(attackerId, sim, now, [defenderId]);
    const points = challengePoints(group, won);

    // Spend first: the turn, the cooldown and both rating blocks are saved before the ladder moves and the points are paid.
    recordFight(att.entry, now);
    settleFight(att.entry, def.entry, won);
    await this.state.patch(attackerId, {
      usedFights: att.entry.usedFights, cooldownEndsAt: att.entry.cooldownEndsAt, rating: att.entry.rating, wins: att.entry.wins,
      losses: att.entry.losses, combo: att.entry.combo, maxCombo: att.entry.maxCombo,
    });
    await this.state.patch(defenderId, { rating: def.entry.rating, wins: def.entry.wins, losses: def.entry.losses, combo: def.entry.combo, maxCombo: def.entry.maxCombo });
    const move = won ? await this.state.applyWin(ladder, attackerId, defenderId) : this.state.standing(ladder, attackerId, defenderId);
    const climbBefore = att.entry.climbNotified;
    this.announce(att.entry, { att: me.name, def: foe.name, ...move }, won);
    const dayStart = att.entry.dayStartRank || move.oldRank;
    await this.state.patch(attackerId, { dayStartRank: dayStart, climbNotified: att.entry.climbNotified });
    const total = await this.currencies.credit(attackerId, 'paPnt', points);

    const bid = replay.id;
    this.feed.recordBattle({ bid, attackerId, defenderId, result: won ? 1 : 2, season: this.state.season() });
    const sys = this.feed.recordSys(group, won, { id: attackerId, name: me.name }, att.entry.combo, climbBefore, att.entry.climbNotified);
    if (sys) this.notify.broadcastSys(group, sys);
    const attackerLine: PetArenaFightPush = { guest: false, g_cid: defenderId, g_name: foe.name, result: won ? 1 : 2, pnt: points, bid };
    const defenderLine: PetArenaFightPush = { guest: true, h_cid: attackerId, h_name: me.name, result: won ? 1 : 2, bid };
    if (won && move.defenderRank > 0) defenderLine.rank = move.defenderRank - 1;
    this.feed.pushLog(attackerId, attackerLine);
    this.feed.pushLog(defenderId, defenderLine);

    const rows = (own: number, info: { name: string; level: number }): PetArenaRow[] => this.view.rowsOf(ladder, own, ladder.members.get(own)!.entry, info);
    this.notify.toDefender(defenderId, { ...defenderLine, enemy: rows(defenderId, { name: foe.name, level: def.level }) });
    const payload: PetArenaFightPush = {
      ...attackerLine, today: att.entry.usedFights, max: att.entry.maxFights, cd: att.entry.cooldownEndsAt, maxCombo: att.entry.maxCombo,
      enemy: rows(attackerId, me),
    };
    return { pushes: [await this.arena.paPush(attackerId, total), push(cb.fight, payload)], payload };
  }

  /** System-channel lines: a win into the top 3, and a one-day climb of 100 / 200 ranks (each step once a day, remembered on the entry). */
  private announce(entry: { dayStartRank: number; climbNotified: number }, m: { att: string; def: string; oldRank: number; newRank: number }, won: boolean): void {
    if (!won) return;
    if (isTopRise(m.oldRank, m.newRank)) this.notify.announce(ARENA_TEXT.top(m.att, m.def, m.newRank));
    const step = climbMilestone(entry.dayStartRank || m.oldRank, m.newRank, entry.climbNotified);
    if (step > 0) {
      this.notify.announce(ARENA_TEXT.climb(m.att, step));
      entry.climbNotified = step;
    }
  }
}
