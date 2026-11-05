// Combat flow: battle start (rosters for encounters / NPC fights; random encounters are EncounterService), command intake -> round -> playlist, deadline rounds and disconnects. Battles are in memory (BattleManager); rewards
// are settled by BattleSettleService when the result is decided, per-member end pushes by BattleEndService.
// Pushes: onUpdatePet(petId, currentHp / currentMp) then onSetCharState and onBattleStart (every participant; an owner's battle
// pet fights at owner slot + 5), onCmdReady(slot) (all participants, group battles), onUPP and onBattlePlayList (per recipient:
// the end marker carries that member's own report).

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  BattleAction, BattleResult, BATTLE_PET_SLOT_OFFSET, CharState, type BattleCmdReady, type BattlePlayList, type BattleStart,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import { PetBattleService, type BattlePet } from '../pet/pet-battle.service';
import type { Party } from '../party/party-rules';
import { CharacterStatsService, type CharStats } from '../stats/character-stats.service';
import { TradeService } from '../trade/trade.service';
import { BattleManager, roundMs } from './battle.manager';
import { BattleCommandService, parseCommands } from './battle-command.service';
import { BattleEndService, pushCharState } from './battle-end.service';
import { BattleSettleService } from './battle-settle.service';
import type { Battle, BattleContext, BattleMember, Fighter, Rng } from './battle.types';
import { ENCOUNTER_COOLDOWN_MS } from './encounter';
import { buildBattleStart, petFighter, playerFighter } from './fighters';
import { endStepFor } from './pvp-rules';
import { PvpService } from './pvp.service';
import { SpectateService } from './spectate.service';
import { missingCommands, playerSlot, selectRoster, type RosterCandidate } from './roster';
import { NpcSkillCatalog } from './npc-skill-catalog';
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
    private readonly petBattle: PetBattleService,
    private readonly pvp: PvpService,
    private readonly spectate: SpectateService,
    private readonly npcSkills: NpcSkillCatalog,
  ) {}

  onModuleInit(): void {
    this.manager.setExpiryHandler((battle) => this.onDeadline(battle));
    this.gateway.onDisconnect((session) => this.onSessionClosed(session));
  }

  /** The fighting pet (state 1, life > 0) of each character that has one, by owner id. */
  async loadPets(characterIds: readonly number[]): Promise<Map<number, BattlePet>> {
    const out = new Map<number, BattlePet>();
    for (const id of characterIds) {
      const pet = await this.petBattle.fighterOf(id);
      if (pet) out.set(id, pet);
    }
    return out;
  }

  /** Party members as roster candidates (the encounter roll and NPC line-up fights). */
  candidates(session: Session, party: Party | undefined, hpOf: (cid: number) => number): RosterCandidate[] {
    if (!party || party.leaderId !== session.characterId) return [];
    return party.members.map((cid) => {
      const s = this.scenes.findByCharacter(cid);
      return { cid, afk: party.afk.has(cid), online: s !== undefined, mapId: s?.mapId ?? -1, hp: hpOf(cid), inBattle: s !== undefined && s.battleId !== null };
    });
  }

  /** The leader's eligible party members on its map with their stats (hitNpc line-ups); just the caller when solo. */
  async roster(session: Session): Promise<{ sessions: Session[]; sts: CharStats[] }> {
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    const lead = party?.leaderId ?? null;
    const pre = selectRoster(cid, session.mapId, this.candidates(session, party, () => 1), lead);
    const sts = new Map(await Promise.all(pre.map(async (id): Promise<[number, CharStats]> => [id, await this.stats.compute(id)])));
    const ids = selectRoster(cid, session.mapId, this.candidates(session, party, (id) => sts.get(id)?.doc.currentHp ?? 0), lead);
    const sessions = ids.map((id) => this.scenes.findByCharacter(id)).filter((s): s is Session => s !== undefined && sts.has(s.characterId!));
    return { sessions, sts: sessions.map((s) => sts.get(s.characterId!)!) };
  }

  /** A solo battle (quest-battle NPCs stay solo). */
  start(session: Session, st: CharStats, enemies: Fighter[], nid: number, pets: ReadonlyMap<number, BattlePet> = new Map()): Battle | null {
    return this.startGroup([session], [st], enemies, nid, pets);
  }

  /**
   * Registers the battle (sessions[0] is the leader; player i fights at slot 10 + i) and sends every participant the start
   * pushes (self state, map state, onBattleStart). Sync after the last await; a member that started another battle meanwhile is dropped.
   * `pets` (by owner id) are the owners' battle pets: each joins at its owner's slot + 5.
   */
  startGroup(
    sessions: Session[], sts: CharStats[], enemies: Fighter[], nid: number, pets: ReadonlyMap<number, BattlePet> = new Map(),
    ctx?: BattleContext,
  ): Battle | null {
    const picks = sessions.map((s, i) => ({ s, st: sts[i] })).filter((p) => p.s.battleId === null);
    if (picks.length === 0 || picks[0].s !== sessions[0]) return null; // lost a race with a concurrent start
    const members = new Map<number, BattleMember>();
    const fighters = new Map<number, Fighter>();
    picks.forEach((p, i) => {
      const cid = p.s.characterId!;
      const f = playerFighter(playerSlot(i), p.st, this.characters.resCode(p.st.doc.classId, p.st.doc.gender));
      if (ctx?.atkMul && ctx.atkMul !== 1) {
        f.attack = Math.round(f.attack * ctx.atkMul); // M10 I: world boss cheer scales the character, not the pet
        f.magicAttack = Math.round(f.magicAttack * ctx.atkMul);
      }
      fighters.set(f.slot, f);
      const bp = pets.get(cid);
      if (bp) fighters.set(f.slot + BATTLE_PET_SLOT_OFFSET, petFighter(f.slot, bp));
      members.set(cid, {
        cid, slot: f.slot, left: false, acked: false,
        result: { report: { exp: 0, money: 0, items: [] }, levelUp: false, moneyTotal: 0, quest: null, loot: null, petPushes: [], catchPushes: [] },
      });
    });
    for (const e of enemies) fighters.set(e.slot, e);
    const now = Date.now();
    const leaderId = picks[0].s.characterId!;
    const battle: Battle = {
      id: `${now}_${leaderId}`, characterId: leaderId, members, commands: new Map(), mapId: picks[0].s.mapId, nid, fighters,
      round: 1, ended: false, result: BattleResult.LOSE, busy: false, deadline: now + roundMs(), ...(ctx ? { ctx } : {}),
    };
    this.manager.add(battle);
    const start: BattleStart = buildBattleStart(battle.id, nid, fighters.values(), enemies.some((e) => e.bossFlag > 0) ? 1 : 0);
    battle.start = start; // shown to spectators (onWatch)
    for (const { s } of picks) {
      this.spectate.release(s.characterId!); // a watcher that starts its own battle stops watching
      s.battleId = battle.id;
      this.trades.stopFor(s.characterId!, true); // a battle ends any open trade
      s.encounterUntil = now + ENCOUNTER_COOLDOWN_MS;
      const pet = fighters.get(battle.members.get(s.characterId!)!.slot + BATTLE_PET_SLOT_OFFSET);
      if (pet?.kind === 'pet') {
        s.callback('onUpdatePet', pet.refId, 'currentHp', pet.hpMax); // the client's pet HP/MP come from these, before the cList
        s.callback('onUpdatePet', pet.refId, 'currentMp', pet.mpMax);
      }
      pushCharState(this.scenes, s, CharState.BATTLE);
      s.callback('onBattleStart', start);
    }
    return battle;
  }

  /**
   * battleUpdateCmd([ownerCmd, petCmd?]): validates and stores this member's commands (the second is for its battle pet), tells
   * everyone (onCmdReady), and resolves the round once every alive player character has submitted. Earlier submitters simply
   * wait for the playlist. A dead owner with a live pet sends [defence, petCmd]: only the pet command is stored.
   */
  async command(session: Session, raw: unknown): Promise<void> {
    const battle = this.manager.ofCharacter(session.characterId!);
    const member = battle?.members.get(session.characterId!);
    if (!battle || !member || battle.ended || member.left) throw RpcException.notFound('Không trong trận chiến');
    const own = battle.fighters.get(member.slot)!;
    if (battle.busy) throw RpcException.forbidden('Đang xử lý lượt');
    const { own: ownCmd, pet: petCmd } = parseCommands(raw);
    const petF = battle.fighters.get(member.slot + BATTLE_PET_SLOT_OFFSET);
    const pet = petF?.kind === 'pet' && petF.alive && petCmd ? petF : undefined;
    if (!own.alive && !pet) throw RpcException.forbidden('Bạn đã gục, hãy chờ trận đấu kết thúc');
    const submitted = (): boolean => battle.commands.has(own.alive ? member.slot : pet!.slot);
    if (submitted()) throw RpcException.forbidden('Bạn đã gửi lệnh, đang chờ đồng đội');
    // The pet is resolved first: it has no side effects, so a bad pet command cannot waste the owner's potion.
    const petPc = pet ? await this.commands.resolve(session, battle, pet, petCmd!) : undefined;
    const pc = own.alive ? await this.commands.resolve(session, battle, own, ownCmd) : undefined;
    if (battle.ended || battle.busy || submitted()) throw RpcException.forbidden('Đang xử lý lượt');
    if (pc) battle.commands.set(member.slot, pc);
    if (pet && petPc) battle.commands.set(pet.slot, petPc);
    const ready: BattleCmdReady = member.slot;
    if (battle.members.size > 1 && !battle.pvp) this.pushAll(battle, 'onCmdReady', ready);
    await this.runIfReady(battle);
  }

  /** battlePlayEnd(): this client finished its end marker; push its own rewards and return the character to the map. */
  endBattle(session: Session): Promise<unknown> {
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
      const out = resolveRound(battle.fighters, cmds, battle.round, this.rng, battle.ctx?.roundCap, this.npcSkills, battle.deathRule);
      if (out.removed.length) (battle.fallen ??= []).push(...out.removed);
      battle.round++;
      battle.deadline = Date.now() + roundMs(battle); // H5: re-armed after every round, timeout rounds included
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
        groups = [...out.groups.slice(0, last), [endStepFor(battle.pvp, f.side, out.groups[last][0], m.result.report)]];
      }
      s.callback('onBattlePlayList', groups);
    }
    this.spectate.playlist(battle, out.groups, out.ended);
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
    // A kicked session (same character logged in again) must not take the new session's battle with it.
    if (!battle || !member || session.battleId !== battle.id) return;
    session.battleId = null;
    if (battle.ended) return void this.manager.detach(battle, member.cid);
    if (battle.pvp) return this.pvp.onLeave(battle, member); // the leaver loses
    const others = [...battle.members.values()].filter((m) => m.cid !== member.cid && !m.left);
    if (others.length === 0) {
      await this.settleService.settle(battle, BattleResult.FLED);
      this.manager.remove(battle);
      this.spectate.finish(battle); // cancelled: watchers get onWatchEnd
      return;
    }
    const own = battle.fighters.get(member.slot)!;
    member.left = true;
    battle.commands.set(member.slot, { action: BattleAction.ESCAPE, targetSlot: -1, leave: true });
    const pet = battle.fighters.get(member.slot + BATTLE_PET_SLOT_OFFSET);
    if (pet?.kind === 'pet') {
      pet.hp = 0; // the pet leaves with its owner (its life drain is still applied at settle)
      pet.alive = false;
    }
    this.manager.detach(battle, member.cid);
    await this.settleService.saveVitals(member.cid, own);
    await this.runIfReady(battle);
  }
}
