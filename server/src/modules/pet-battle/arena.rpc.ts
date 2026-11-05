// Pet arena RPCs with the Flash names (PetArenaPanel / PetFightConf): getPetArenaData, getPetArenaRank, getLastPetArenaRank, getPetRankAward,
// getPetArenaSysMsg, getPetArenaConf, getPetConf, petFightConf, petArenaTicket, petArenaFight, petFightResult, addPetFightNum, clearArenaCD,
// replayPetFight and the three activity aliases (getPetArenaActivityInfo, getPetArenaDataActivity, petArenaFightActivity). Pushes:
// onGetEnemies, onGetArenaLog, onPetArenaRank, onPetArenaSysMsg, onGetPetConf, onPetArenaFight / onPetArenaFightActivity, addArenaLog /
// addArenaLogActivity, addArenaNum, onUPP {paPnt}, onPetFightResult, onBattleReplay + onBattlePlayList. Most client calls pass a null
// Responder, so every RPC also returns what it pushed. Refusals of a challenge are arena log lines, not errors.

import { Injectable } from '@nestjs/common';
import type { PetArenaActivityInfo, PetArenaFightPush, PetArenaRankReply, PetArenaRow, PetArenaSysMsg, PetArenaPrevRank, PetFightResultReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes } from '../inventory/pushes';
import { ARENA_TEXT } from './arena-rules';
import { ArenaFeedService } from './arena-feed.service';
import { ArenaFightService, type FightCallbacks } from './arena-fight.service';
import { ArenaStateService } from './arena-state.service';
import { ArenaViewService } from './arena-view.service';
import { ArenaService } from './arena.service';
import { ReplayPlayerService } from './replay-player.service';

const OPTS = { requireCharacter: true, forbidInBattle: true } as const;
const LADDER_CALLBACKS: FightCallbacks = { fight: 'onPetArenaFight', log: 'addArenaLog' };
const ACTIVITY_CALLBACKS: FightCallbacks = { fight: 'onPetArenaFightActivity', log: 'addArenaLogActivity' };

/** A character id arrives as a number or a numeric string. */
function idArg(raw: unknown, field: string): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class ArenaRpc {
  constructor(
    private readonly arena: ArenaService,
    private readonly view: ArenaViewService,
    private readonly fights: ArenaFightService,
    private readonly feed: ArenaFeedService,
    private readonly state: ArenaStateService,
    private readonly player: ReplayPlayerService,
  ) {}

  // --- panel data -------------------------------------------------------------------------------------------------------------
  /** Opens the panel: onGetEnemies, then (once per connection) the kept fight log as onGetArenaLog. */
  @Rpc('getPetArenaData', { requireCharacter: true })
  async getPetArenaData(session: Session): Promise<PetArenaRow[]> {
    const id = session.characterId!;
    this.feed.markOpen(session);
    const enemies = await this.view.enemies(id);
    session.callback('onGetEnemies', enemies);
    const logs = this.feed.logsOf(id);
    if (this.feed.takeLogOnce(session) && logs.length > 0) session.callback('onGetArenaLog', logs);
    return enemies;
  }

  @Rpc('getPetArenaRank', { requireCharacter: true })
  async getPetArenaRank(session: Session): Promise<PetArenaRankReply> {
    const payload = await this.view.rank(session.characterId!);
    session.callback('onPetArenaRank', payload);
    return payload;
  }

  @Rpc('getLastPetArenaRank', { requireCharacter: true })
  getLastPetArenaRank(): Promise<PetArenaPrevRank> {
    return this.view.previousRanks();
  }

  /** getPetArenaSysMsg(rid, -1): the latest war report of the group (the caller's own group when `rid` is not 0..5). */
  @Rpc('getPetArenaSysMsg', { requireCharacter: true })
  async getPetArenaSysMsg(session: Session, args: unknown[]): Promise<PetArenaSysMsg | Record<string, never>> {
    const rid = Number(args[0]);
    const group = Number.isInteger(rid) && rid >= 0 && rid <= 5 ? rid : await this.state.groupOf(session.characterId!);
    const msg = this.feed.sysOf(group);
    session.callback('onPetArenaSysMsg', msg, group);
    return msg;
  }

  // --- line-ups -------------------------------------------------------------------------------------------------------------
  @Rpc('getPetArenaConf', { requireCharacter: true })
  async getPetArenaConf(session: Session): Promise<Awaited<ReturnType<ArenaViewService['conf']>>> {
    const payload = await this.view.conf(session.characterId!);
    session.callback('onGetPetConf', payload);
    return payload;
  }

  @Rpc('getPetConf', { requireCharacter: true })
  async getPetConf(session: Session): Promise<Awaited<ReturnType<ArenaService['farmConf']>>> {
    const payload = await this.arena.farmConf(session.characterId!);
    session.callback('onGetPetConf', payload);
    return payload;
  }

  /** petFightConf(conf, 1, isXiulianshi): the non-arena line-up. */
  @Rpc('petFightConf', OPTS)
  async petFightConf(session: Session, args: unknown[]): Promise<{ success: true }> {
    if (typeof args[0] !== 'object' || args[0] === null) throw RpcException.invalidArgs('conf');
    sendPushes(session, await this.arena.saveFarmConf(session.characterId!, args[0], args[2] === true || args[2] === 1));
    return { success: true };
  }

  /** petArenaTicket(name | "nl", conf): register / update; the reply is the refreshed list (null when refused with a note). */
  @Rpc('petArenaTicket', OPTS)
  async petArenaTicket(session: Session, args: unknown[]): Promise<PetArenaRow[] | null> {
    this.feed.markOpen(session);
    const { pushes, enemies } = await this.arena.register(session.characterId!, args[0], args[1]);
    sendPushes(session, pushes);
    return enemies;
  }

  // --- fights ---------------------------------------------------------------------------------------------------------------
  @Rpc('petArenaFight', OPTS)
  petArenaFight(session: Session, args: unknown[]): Promise<PetArenaFightPush | null> {
    return this.challenge(session, args, LADDER_CALLBACKS);
  }

  /** H5 alias over the same ladder with the activity callbacks (the client hides that panel until an activity schedule exists). */
  @Rpc('petArenaFightActivity', OPTS)
  petArenaFightActivity(session: Session, args: unknown[]): Promise<PetArenaFightPush | null> {
    return this.challenge(session, args, ACTIVITY_CALLBACKS);
  }

  private async challenge(session: Session, args: unknown[], cb: FightCallbacks): Promise<PetArenaFightPush | null> {
    const defenderId = idArg(args[0], 'defCid');
    const { pushes, payload } = await this.fights.fight(session.characterId!, defenderId, cb);
    sendPushes(session, pushes);
    return payload;
  }

  /** petFightResult(bid): the stored outcome of a fight the caller took part in, also pushed as onPetFightResult. */
  @Rpc('petFightResult', { requireCharacter: true })
  petFightResult(session: Session, args: unknown[]): PetFightResultReply {
    const result = this.feed.battle(String(args[0] ?? ''));
    const id = session.characterId!;
    if (!result || (result.attackerId !== id && result.defenderId !== id)) throw RpcException.notFound('battle not found');
    session.callback('onPetFightResult', result);
    return result;
  }

  /** The "[Chien cuoc]" log link: onBattleReplay now, onBattlePlayList 2.5 s later; a gone replay is a log line. */
  @Rpc('replayPetFight', { requireCharacter: true })
  replayPetFight(session: Session, args: unknown[]): null {
    const bid = args[0] === undefined || args[0] === null ? '' : String(args[0]);
    if (!bid || !this.player.play(session, session.characterId!, bid)) session.callback('addArenaLog', ARENA_TEXT.replayMissing);
    return null;
  }

  // --- turns, cooldown, award -----------------------------------------------------------------------------------------------
  @Rpc('addPetFightNum', OPTS)
  async addPetFightNum(session: Session): Promise<null> {
    sendPushes(session, await this.arena.addFightNum(session.characterId!));
    return null;
  }

  @Rpc('clearArenaCD', OPTS)
  async clearArenaCD(session: Session): Promise<boolean> {
    const { done, pushes } = await this.arena.clearCooldown(session.characterId!);
    sendPushes(session, pushes);
    return done;
  }

  @Rpc('getPetRankAward', OPTS)
  async getPetRankAward(session: Session): Promise<null> {
    sendPushes(session, await this.arena.claimRankAward(session.characterId!));
    return null;
  }

  // --- activity aliases -------------------------------------------------------------------------------------------------------
  /** The activity ladder is closed: there is no H5 activity schedule yet. */
  @Rpc('getPetArenaActivityInfo', { requireCharacter: true })
  getPetArenaActivityInfo(): PetArenaActivityInfo {
    return { season: this.state.season(), isActive: false };
  }

  /** getEnemiesActivity(list) like the Go handler: the same ladder list under the activity callback. */
  @Rpc('getPetArenaDataActivity', { requireCharacter: true })
  async getPetArenaDataActivity(session: Session): Promise<PetArenaRow[]> {
    const enemies = await this.view.enemies(session.characterId!);
    session.callback('getEnemiesActivity', enemies);
    return enemies;
  }
}
