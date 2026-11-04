// Combat flow: random encounter start (cbom), command -> round -> playlist, battlePlayEnd and cleanup on disconnect /
// deadline. Battles are in memory (BattleManager); rewards are settled by BattleSettleService at the moment the result is
// decided. Pushes: onSetCharState, onBattleStart, onUPP, onBattlePlayList, then the end-of-battle set in endBattle():
// onAddChaQuest / onSetNpcState, onAddMoney, onUPP, onPlayerLevelUp, onAddItem + onAddCharactorSlot / onRedMsg, onSetCharState.

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  BattleAction, BattleResult, BATTLE_ENEMY_SLOTS, BATTLE_PLAYER_SLOT, CharState,
  type BattleCommand, type BattleStart, type PlayerLevelUp, type SetCharState,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { sendPushes } from '../inventory/pushes';
import { UseItemService } from '../inventory/use-item.service';
import { QuestService } from '../quest/quest.service';
import { SkillService } from '../skill/skill.service';
import { CharacterStatsService, type CharStats } from '../stats/character-stats.service';
import { BattleManager, BATTLE_DEADLINE_MS } from './battle.manager';
import { BattleSettleService } from './battle-settle.service';
import type { Battle, Fighter, PlayerCommand, Rng } from './battle.types';
import { ENCOUNTER_COOLDOWN_MS, rollEncounter } from './encounter';
import { playerFighter, spawnFighter, toParticipant } from './fighters';
import { resolveRound } from './round';
import { planCast } from './skill-cast';

@Injectable()
export class CombatService implements OnModuleInit {
  /** Swappable for tests / tools. */
  rng: Rng = Math.random;

  constructor(
    private readonly manager: BattleManager,
    private readonly settleService: BattleSettleService,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
    private readonly characters: CharacterService,
    private readonly useItem: UseItemService,
    private readonly quests: QuestService,
    private readonly skills: SkillService,
  ) {}

  onModuleInit(): void {
    this.manager.setExpiryHandler((battle) => this.onDeadline(battle));
    this.gateway.onDisconnect((session) => this.onSessionClosed(session));
  }

  /** cbom(x, y): rolls a random encounter for the session's map; silently does nothing when none starts. */
  async tryRandomEncounter(session: Session): Promise<void> {
    if (session.battleId !== null || Date.now() < session.encounterUntil) return;
    const map = this.gameData.getMap(session.mapId);
    if (!map || Number(map.safe_flag ?? 0) > 0) return;
    const rows = rollEncounter(Number(map.basic_battle_rate ?? 0), this.gameData.mapCreatures(session.mapId), this.rng);
    if (!rows) return;
    const st = await this.stats.compute(session.characterId!);
    if (st.doc.currentHp <= 0) return; // H5: a dead character cannot be attacked
    const mapLevel = Number(map.level) > 0 ? Number(map.level) : Number(map.lv ?? 0);
    const enemies: Fighter[] = [];
    for (const row of rows) {
      const tpl = this.gameData.creature(row.creatureId);
      const slot = BATTLE_ENEMY_SLOTS[enemies.length];
      if (tpl && slot !== undefined) enemies.push(spawnFighter(slot, row, tpl, mapLevel, st.doc.level));
    }
    if (enemies.length === 0) return;
    this.start(session, st, enemies, 0);
  }

  /** Registers the battle and sends the start pushes (self state, map state, onBattleStart). Sync after the last await. */
  start(session: Session, st: CharStats, enemies: Fighter[], nid: number): Battle | null {
    if (session.battleId !== null) return null; // lost a race with a concurrent start
    const cid = session.characterId!;
    const player = playerFighter(BATTLE_PLAYER_SLOT, st, this.characters.resCode(st.doc.classId, st.doc.gender));
    const fighters = new Map<number, Fighter>([[player.slot, player], ...enemies.map((e): [number, Fighter] => [e.slot, e])]);
    const now = Date.now();
    const battle: Battle = {
      id: `${now}_${cid}`, characterId: cid, mapId: session.mapId, nid, fighters, round: 1, ended: false,
      result: BattleResult.LOSE, busy: false, deadline: now + BATTLE_DEADLINE_MS, report: null, levelUp: false, moneyTotal: 0,
      quest: null, loot: null,
    };
    this.manager.add(battle);
    session.battleId = battle.id;
    session.encounterUntil = now + ENCOUNTER_COOLDOWN_MS;
    this.pushState(session, CharState.BATTLE);
    const cList: BattleStart['cList'] = {};
    for (const f of fighters.values()) cList[String(f.slot)] = toParticipant(f);
    const boss = enemies.some((e) => e.bossFlag > 0) ? 1 : 0;
    session.callback('onBattleStart', {
      battleFieldId: battle.id, nid, cList, bossFlag: boss, sneakFlag: 0, guest: false, airBattle: false,
    } satisfies BattleStart);
    return battle;
  }

  /** battleUpdateCmd([cmd]): validates the command, resolves the whole round and pushes the playlist. */
  async command(session: Session, raw: unknown): Promise<void> {
    const battle = this.manager.ofCharacter(session.characterId!);
    if (!battle || battle.ended) throw RpcException.notFound('Không trong trận chiến');
    if (battle.busy) throw RpcException.forbidden('Đang xử lý lượt');
    const cmd = parseCommand(raw);
    battle.busy = true;
    try {
      await this.runRound(session, battle, await this.resolveCommand(session, battle, cmd));
    } finally {
      battle.busy = false;
    }
  }

  /** battlePlayEnd(): the client finished the end marker; push the rewards and return the character to the map. */
  async endBattle(session: Session): Promise<void> {
    const battle = this.manager.ofCharacter(session.characterId!);
    const cid = session.characterId!;
    if (battle) {
      // A premature call (battle still running) counts as fleeing: HP/MP are kept, nothing is rewarded.
      if (!battle.ended) await this.settleService.settle(battle, BattleResult.FLED);
      this.manager.remove(battle);
      await this.pushQuestKills(session, battle);
      const report = battle.report;
      if (report && report.money > 0) session.callback('onAddMoney', cid, 'moneyBind', report.money, battle.moneyTotal);
      const update = await this.stats.refreshPayload(cid);
      session.callback('onUPP', update);
      if (battle.levelUp) {
        const lv: PlayerLevelUp = { id: cid, level: update.level ?? 0, exp: update.exp ?? 0, lp: update.attrPoints ?? 0 };
        session.callback('onPlayerLevelUp', lv);
      }
      this.pushLoot(session, battle);
    }
    session.battleId = null;
    session.encounterUntil = Date.now() + ENCOUNTER_COOLDOWN_MS;
    this.pushState(session, CharState.NORMAL);
  }

  /** Kill credit: the changed quests (remaining counts), then the marker of each finish NPC standing on this map. */
  private async pushQuestKills(session: Session, battle: Battle): Promise<void> {
    const credit = battle.quest;
    if (!credit) return;
    for (const q of credit.quests) session.callback('onAddChaQuest', q);
    const npcIds = [...new Set(credit.finishNpcs)].filter((id) => this.quests.npcOnMap(id, session.mapId));
    if (npcIds.length === 0) return;
    for (const [npcId, state] of await this.quests.npcStates(battle.characterId, npcIds)) session.callback('onSetNpcState', npcId, state);
  }

  private pushLoot(session: Session, battle: Battle): void {
    const loot = battle.loot;
    if (!loot) return;
    for (const notice of loot.notices) session.callback('onAddItem', notice);
    for (const item of loot.changed) session.callback('onAddCharactorSlot', item);
    if (loot.bagFull) session.callback('onRedMsg', 'Túi đồ đã đầy');
  }

  private pushState(session: Session, state: number): void {
    const msg: SetCharState = { cid: session.characterId!, state };
    session.callback('onSetCharState', msg);
    this.scenes.broadcast(session.mapId, 'onSetCharState', [msg], session);
  }

  /** Turns the wire command into the round's PlayerCommand; a potion is consumed here (spend before credit). */
  private async resolveCommand(session: Session, battle: Battle, cmd: BattleCommand): Promise<PlayerCommand> {
    const player = battle.fighters.get(BATTLE_PLAYER_SLOT)!;
    switch (cmd.action) {
      case BattleAction.ATTACK: {
        const target = battle.fighters.get(cmd.tid);
        if (!target || target.side !== 'enemy' || !target.alive) throw RpcException.invalidArgs('tid');
        return { action: BattleAction.ATTACK, targetSlot: target.slot };
      }
      case BattleAction.SKILL:
        return this.resolveSkill(session, battle, cmd);
      case BattleAction.DEFENCE:
      case BattleAction.ESCAPE:
      case BattleAction.TIMEOUT:
        return { action: cmd.action, targetSlot: -1 };
      case BattleAction.ITEM: {
        const room = { hp: player.hpMax - player.hp, mp: player.mpMax - player.mp };
        const used = await this.useItem.consumeForBattle(session.characterId!, cmd.id, room);
        sendPushes(session, used.pushes);
        return { action: BattleAction.ITEM, targetSlot: BATTLE_PLAYER_SLOT, heal: used.heal };
      }
      default:
        throw RpcException.invalidArgs('action');
    }
  }

  /** -50: ownership, passive / unsupported refusal, MP check (short on MP = basic attack on the target), then the cast. */
  private async resolveSkill(session: Session, battle: Battle, cmd: BattleCommand): Promise<PlayerCommand> {
    const player = battle.fighters.get(BATTLE_PLAYER_SLOT)!;
    const tpl = this.gameData.skill(cmd.id);
    if (!tpl) throw RpcException.invalidArgs('id');
    if (!(await this.skills.owns(session.characterId!, tpl.id))) throw RpcException.forbidden('Bạn chưa học kỹ năng này');
    const plan = planCast(tpl, player.mp, player.mpMax);
    if (plan.kind === 'refused') {
      throw RpcException.forbidden(plan.reason === 'passive' ? 'Không thể sử dụng kỹ năng bị động' : 'Kỹ năng chưa được hỗ trợ');
    }
    const self = plan.kind === 'cast' && plan.cast.category === 'heal';
    const alive = [...battle.fighters.values()].filter((f) => f.side === 'enemy' && f.alive);
    let target = battle.fighters.get(cmd.tid);
    if (!self && (!target || target.side !== 'enemy' || !target.alive)) {
      // A fallback attack may arrive with a self target (heal skill without MP): hit the first living enemy.
      if (plan.kind !== 'basic') throw RpcException.invalidArgs('tid');
      target = alive[0];
    }
    if (!self && !target) throw RpcException.invalidArgs('tid');
    return {
      action: BattleAction.ATTACK, targetSlot: self ? BATTLE_PLAYER_SLOT : target!.slot,
      ...(plan.kind === 'cast' ? { skill: plan.cast } : {}),
    };
  }

  /** Resolves one round and pushes: (on end) settle + onUPP, then onBattlePlayList. Re-arms the deadline. */
  private async runRound(session: Session, battle: Battle, pc: PlayerCommand): Promise<void> {
    const out = resolveRound(battle.fighters, pc, battle.round, this.rng);
    battle.round++;
    battle.deadline = Date.now() + BATTLE_DEADLINE_MS; // H5: re-armed after every round, timeout rounds included
    if (out.ended) {
      const report = await this.settleService.settle(battle, out.result);
      const end = out.groups[out.groups.length - 1][0];
      end.report = report;
      const p = battle.fighters.get(BATTLE_PLAYER_SLOT)!;
      session.callback('onUPP', { currentHp: p.hp, currentMp: p.mp }); // before the playlist (Go order)
    }
    session.callback('onBattlePlayList', out.groups);
  }

  private async onDeadline(battle: Battle): Promise<void> {
    const session = this.scenes.findByCharacter(battle.characterId);
    if (!session || battle.ended || battle.busy) return;
    battle.busy = true;
    try {
      await this.runRound(session, battle, { action: BattleAction.TIMEOUT, targetSlot: -1 });
    } finally {
      battle.busy = false;
    }
  }

  /** Connection closed: finish a running battle as fled (HP/MP persisted) and drop it. */
  private async onSessionClosed(session: Session): Promise<void> {
    if (session.characterId === null) return;
    const battle = this.manager.ofCharacter(session.characterId);
    if (!battle) return;
    if (!battle.ended) await this.settleService.settle(battle, BattleResult.FLED);
    this.manager.remove(battle);
    session.battleId = null;
  }
}

/** battleUpdateCmd sends `[{tid, action, id, level}]`; only the first command matters for a solo player. */
export function parseCommand(raw: unknown): BattleCommand {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === null || typeof first !== 'object') throw RpcException.invalidArgs('cmd');
  const o = first as Record<string, unknown>;
  const num = (v: unknown, d: number): number => (v === undefined || v === null ? d : Number(v));
  const cmd: BattleCommand = { tid: num(o.tid, -1), action: Number(o.action), id: num(o.id, -1), level: num(o.level, -1) };
  if (!Number.isInteger(cmd.action) || !Number.isFinite(cmd.tid) || !Number.isFinite(cmd.id)) throw RpcException.invalidArgs('cmd');
  return cmd;
}
