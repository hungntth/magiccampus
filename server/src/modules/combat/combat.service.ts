// Combat flow: random encounter start (cbom, rolled for the party leader or a solo player; the roster is the party's eligible
// members), command intake -> round -> playlist, deadline rounds and disconnects. Battles are in memory (BattleManager); rewards
// are settled by BattleSettleService when the result is decided, per-member end pushes by BattleEndService.
// Pushes: onSetCharState, onBattleStart (every participant), onCmdReady(slot) (all participants, group battles), onUPP and
// onBattlePlayList (per recipient: the end marker carries that member's own report).

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  BattleAction, BattleResult, BATTLE_ENEMY_SLOTS, CharState, type BattleCmdReady, type BattlePlayList, type BattleStart,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import type { Party } from '../party/party-rules';
import { CharacterStatsService, type CharStats } from '../stats/character-stats.service';
import { TradeService } from '../trade/trade.service';
import { BattleManager, BATTLE_DEADLINE_MS } from './battle.manager';
import { BattleCommandService, parseCommand } from './battle-command.service';
import { BattleEndService, pushCharState } from './battle-end.service';
import { BattleSettleService } from './battle-settle.service';
import type { Battle, BattleMember, Fighter, Rng } from './battle.types';
import { ENCOUNTER_COOLDOWN_MS, rollEncounter } from './encounter';
import { playerFighter, spawnFighter, toParticipant } from './fighters';
import { missingCommands, playerSlot, selectRoster, type RosterCandidate } from './roster';
import { resolveRound, type RoundOutcome } from './round';

@Injectable()
export class CombatService implements OnModuleInit {
  /** Swappable for tests / tools. */
  rng: Rng = Math.random;

  constructor(
    private readonly manager: BattleManager,
    private readonly settleService: BattleSettleService,
    private readonly ends: BattleEndService,
    private readonly commands: BattleCommandService,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
    private readonly characters: CharacterService,
    private readonly parties: PartyManager,
    private readonly trades: TradeService,
  ) {}

  onModuleInit(): void {
    this.manager.setExpiryHandler((battle) => this.onDeadline(battle));
    this.gateway.onDisconnect((session) => this.onSessionClosed(session));
  }

  /**
   * cbom(x, y): rolls a random encounter for the session's map; silently does nothing when none starts. Only the party leader
   * (or a solo / AFK player) rolls; a follower's cbom is ignored. The roster is the leader's eligible members.
   */
  async tryRandomEncounter(session: Session): Promise<void> {
    if (session.battleId !== null || Date.now() < session.encounterUntil) return;
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    if (party && party.leaderId !== cid && !party.afk.has(cid)) return;
    const map = this.gameData.getMap(session.mapId);
    if (!map || Number(map.safe_flag ?? 0) > 0) return;
    const lead = party?.leaderId ?? null;
    // The enemy count depends on the roster size, so a first roster (HP unknown) is picked before the encounter roll.
    const pre = selectRoster(cid, session.mapId, this.candidates(session, party, () => 1), lead);
    const rows = rollEncounter(Number(map.basic_battle_rate ?? 0), this.gameData.mapCreatures(session.mapId), this.rng, pre.length);
    if (!rows) return;
    const sts = new Map(await Promise.all(pre.map(async (id): Promise<[number, CharStats]> => [id, await this.stats.compute(id)])));
    const hpOf = (id: number): number => sts.get(id)?.doc.currentHp ?? 0;
    if (hpOf(cid) <= 0) return; // H5: a dead character cannot be attacked
    const roster = selectRoster(cid, session.mapId, this.candidates(session, party, hpOf), lead);
    const sessions = roster.map((id) => this.scenes.findByCharacter(id)).filter((s): s is Session => s !== undefined);
    const mapLevel = Number(map.level) > 0 ? Number(map.level) : Number(map.lv ?? 0);
    const enemies: Fighter[] = [];
    for (const row of rows) {
      const tpl = this.gameData.creature(row.creatureId);
      const slot = BATTLE_ENEMY_SLOTS[enemies.length];
      if (tpl && slot !== undefined) enemies.push(spawnFighter(slot, row, tpl, mapLevel, sts.get(cid)!.doc.level));
    }
    if (enemies.length === 0) return;
    this.startGroup(sessions, sessions.map((s) => sts.get(s.characterId!)!), enemies, 0);
  }

  private candidates(session: Session, party: Party | undefined, hpOf: (cid: number) => number): RosterCandidate[] {
    if (!party || party.leaderId !== session.characterId) return [];
    return party.members.map((cid) => {
      const s = this.scenes.findByCharacter(cid);
      return { cid, afk: party.afk.has(cid), online: s !== undefined, mapId: s?.mapId ?? -1, hp: hpOf(cid), inBattle: s !== undefined && s.battleId !== null };
    });
  }

  /** A solo battle (quest-battle NPCs stay solo). */
  start(session: Session, st: CharStats, enemies: Fighter[], nid: number): Battle | null {
    return this.startGroup([session], [st], enemies, nid);
  }

  /**
   * Registers the battle (sessions[0] is the leader; player i fights at slot 10 + i) and sends every participant the start
   * pushes (self state, map state, onBattleStart). Sync after the last await; a member that started another battle meanwhile is dropped.
   */
  startGroup(sessions: Session[], sts: CharStats[], enemies: Fighter[], nid: number): Battle | null {
    const picks = sessions.map((s, i) => ({ s, st: sts[i] })).filter((p) => p.s.battleId === null);
    if (picks.length === 0 || picks[0].s !== sessions[0]) return null; // lost a race with a concurrent start
    const members = new Map<number, BattleMember>();
    const fighters = new Map<number, Fighter>();
    picks.forEach((p, i) => {
      const cid = p.s.characterId!;
      const f = playerFighter(playerSlot(i), p.st, this.characters.resCode(p.st.doc.classId, p.st.doc.gender));
      fighters.set(f.slot, f);
      members.set(cid, {
        cid, slot: f.slot, left: false, acked: false,
        result: { report: { exp: 0, money: 0, items: [] }, levelUp: false, moneyTotal: 0, quest: null, loot: null },
      });
    });
    for (const e of enemies) fighters.set(e.slot, e);
    const now = Date.now();
    const leaderId = picks[0].s.characterId!;
    const battle: Battle = {
      id: `${now}_${leaderId}`, characterId: leaderId, members, commands: new Map(), mapId: picks[0].s.mapId, nid, fighters,
      round: 1, ended: false, result: BattleResult.LOSE, busy: false, deadline: now + BATTLE_DEADLINE_MS,
    };
    this.manager.add(battle);
    const cList: BattleStart['cList'] = {};
    for (const f of fighters.values()) cList[String(f.slot)] = toParticipant(f);
    const start: BattleStart = {
      battleFieldId: battle.id, nid, cList, bossFlag: enemies.some((e) => e.bossFlag > 0) ? 1 : 0, sneakFlag: 0, guest: false, airBattle: false,
    };
    for (const { s } of picks) {
      s.battleId = battle.id;
      this.trades.stopFor(s.characterId!, true); // a battle ends any open trade
      s.encounterUntil = now + ENCOUNTER_COOLDOWN_MS;
      pushCharState(this.scenes, s, CharState.BATTLE);
      s.callback('onBattleStart', start);
    }
    return battle;
  }

  /**
   * battleUpdateCmd([cmd]): validates and stores this member's command, tells everyone (onCmdReady), and resolves the round
   * once every alive player character has submitted. Earlier submitters simply wait for the playlist.
   */
  async command(session: Session, raw: unknown): Promise<void> {
    const battle = this.manager.ofCharacter(session.characterId!);
    const member = battle?.members.get(session.characterId!);
    if (!battle || !member || battle.ended || member.left) throw RpcException.notFound('Không trong trận chiến');
    const own = battle.fighters.get(member.slot)!;
    if (battle.busy) throw RpcException.forbidden('Đang xử lý lượt');
    if (!own.alive) throw RpcException.forbidden('Bạn đã gục, hãy chờ trận đấu kết thúc');
    if (battle.commands.has(member.slot)) throw RpcException.forbidden('Bạn đã gửi lệnh, đang chờ đồng đội');
    const pc = await this.commands.resolve(session, battle, own, parseCommand(raw));
    if (battle.ended || battle.busy || battle.commands.has(member.slot)) throw RpcException.forbidden('Đang xử lý lượt');
    battle.commands.set(member.slot, pc);
    const ready: BattleCmdReady = member.slot;
    if (battle.members.size > 1) this.pushAll(battle, 'onCmdReady', ready);
    await this.runIfReady(battle);
  }

  /** battlePlayEnd(): this client finished its end marker; push its own rewards and return the character to the map. */
  endBattle(session: Session): Promise<void> {
    return this.ends.end(session);
  }

  /** Runs the round when no alive, connected player character is still missing a command. */
  private async runIfReady(battle: Battle): Promise<void> {
    if (battle.busy || battle.ended) return;
    const submitted = new Set(battle.commands.keys());
    const left = new Set([...battle.members.values()].filter((m) => m.left).map((m) => m.slot));
    if (missingCommands(battle.fighters.values(), submitted, left).length > 0) return;
    await this.runRound(battle);
  }

  /** Resolves one round (missing commands count as timeouts) and pushes: (on end) settle, then each member's playlist. */
  private async runRound(battle: Battle): Promise<void> {
    battle.busy = true;
    try {
      const cmds = new Map(battle.commands);
      battle.commands.clear();
      const out = resolveRound(battle.fighters, cmds, battle.round, this.rng);
      battle.round++;
      battle.deadline = Date.now() + BATTLE_DEADLINE_MS; // H5: re-armed after every round, timeout rounds included
      if (out.ended) await this.settleService.settle(battle, out.result);
      this.sendPlaylist(battle, out);
    } finally {
      battle.busy = false;
    }
  }

  /** The same playlist to every connected member; on the end each gets its own onUPP (before the list, Go order) and report. */
  private sendPlaylist(battle: Battle, out: RoundOutcome): void {
    for (const m of battle.members.values()) {
      const s = m.left ? undefined : this.scenes.findByCharacter(m.cid);
      if (!s) continue;
      let groups: BattlePlayList = out.groups;
      if (out.ended) {
        const f = battle.fighters.get(m.slot)!;
        s.callback('onUPP', { currentHp: f.hp, currentMp: f.mp });
        const last = out.groups.length - 1;
        groups = [...out.groups.slice(0, last), [{ ...out.groups[last][0], report: m.result.report }]];
      }
      s.callback('onBattlePlayList', groups);
    }
  }

  private pushAll(battle: Battle, method: string, ...args: unknown[]): void {
    for (const m of battle.members.values()) if (!m.left) this.scenes.findByCharacter(m.cid)?.callback(method, ...args);
  }

  private async onDeadline(battle: Battle): Promise<void> {
    if (battle.ended || battle.busy) return;
    await this.runRound(battle);
  }

  /**
   * Connection closed. Alone in the battle (or it already ended): settle as fled and drop it. In a group the leaver's HP/MP are
   * saved, it is marked left and a queued leave runs in the next round (immediately when nobody else is still missing a command).
   */
  private async onSessionClosed(session: Session): Promise<void> {
    if (session.characterId === null) return;
    const battle = this.manager.ofCharacter(session.characterId);
    const member = battle?.members.get(session.characterId);
    if (!battle || !member) return;
    session.battleId = null;
    if (battle.ended) return void this.manager.detach(battle, member.cid);
    const others = [...battle.members.values()].filter((m) => m.cid !== member.cid && !m.left);
    if (others.length === 0) {
      await this.settleService.settle(battle, BattleResult.FLED);
      this.manager.remove(battle);
      return;
    }
    const own = battle.fighters.get(member.slot)!;
    member.left = true;
    battle.commands.set(member.slot, { action: BattleAction.ESCAPE, targetSlot: -1, leave: true });
    this.manager.detach(battle, member.cid);
    await this.settleService.saveVitals(member.cid, own);
    await this.runIfReady(battle);
  }
}
