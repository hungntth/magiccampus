// PvP battles on the shared BattleManager. Duel (M6 phase C, PVPStartClient): attacker at slot 10 (pet 15), target at slot 0 (pet 5, side
// 'enemy'). System PvP (M14 phase H, startSystem): up to 5 characters + pets per side (attackers 10..14, targets 0 2 1 4 3), tagged with a
// BattleContext so its end hook scores it. Each client gets its own onBattleStart (`guest: true` for the target side so it sees itself at
// the bottom). Rounds, commands and settle reuse the PvE pipeline (round.ts, BattleSettleService.settlePvp); this service builds the battle
// and handles a duel disconnect (the leaver loses). Pushes: onUpdatePet, onSetCharState 5, onBattleStart; on a duel leave onUPP + end marker.

import { Injectable } from '@nestjs/common';
import {
  BattleBehavior, BattleResult, BATTLE_PET_SLOT_OFFSET, CharState, PK_ROUND_MS, type BattlePlayList, type BattleStart,
} from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import type { BattlePet } from '../pet/pet-battle.service';
import type { CharStats } from '../stats/character-stats.service';
import { TradeService } from '../trade/trade.service';
import { BattleManager } from './battle.manager';
import { SpectateService } from './spectate.service';
import { pushCharState } from './battle-end.service';
import { BattleSettleService } from './battle-settle.service';
import type { Battle, BattleContext, BattleMember, Fighter } from './battle.types';
import { FairyBattleKits } from './fairy-kits.service';
import { ENCOUNTER_COOLDOWN_MS } from './encounter';
import { petFighter, playerFighter, toParticipant } from './fighters';
import { endStepFor, leaveResult, SYSTEM_SLOTS, systemBoard, type SideEntry } from './pvp-rules';
import { WeaponLookService } from '../inventory/weapon-look.service';

/** One duelist as the PK service hands it over. */
export interface Duelist {
  session: Session;
  st: CharStats;
  pet?: BattlePet;
}

const emptyResult = (): BattleMember['result'] => ({
  report: { exp: 0, money: 0, items: [] }, levelUp: false, moneyTotal: 0, quest: null, loot: null, petPushes: [], catchPushes: [],
});

@Injectable()
export class PvpService {
  constructor(
    private readonly manager: BattleManager,
    private readonly settleService: BattleSettleService,
    private readonly scenes: SceneManager,
    private readonly trades: TradeService,
    private readonly characters: CharacterService,
    private readonly spectate: SpectateService,
    private readonly weapons: WeaponLookService,
    private readonly fairyKits: FairyBattleKits,
  ) {}

  /** Registers the duel and sends both clients their start pushes. Sync; null when either side started another battle meanwhile. */
  start(attacker: Duelist, target: Duelist): Battle | null {
    return this.begin([attacker], [target]);
  }

  /**
   * M14 H: a system PvP battle between two sides of up to 5 duelists (leader first). `ctx.source` tags it for the end hook. Duelists
   * that started another battle meanwhile are dropped; null when either side ends up empty.
   */
  startSystem(sideA: Duelist[], sideB: Duelist[], ctx: BattleContext): Battle | null {
    return this.begin(sideA, sideB, ctx);
  }

  private begin(attackers: Duelist[], targets: Duelist[], ctx?: BattleContext): Battle | null {
    const free = (list: Duelist[]): Duelist[] => list.filter((d) => d.session.battleId === null).slice(0, SYSTEM_SLOTS.attacker.length);
    const sideA = free(attackers);
    const sideB = free(targets);
    if (sideA.length === 0 || sideB.length === 0) return null;
    const entryOf = (d: Duelist): SideEntry => {
      const f = playerFighter(0, d.st, this.characters.resCode(d.st.doc.classId, d.st.doc.gender), this.weapons.cached(d.st.doc._id));
      const fairy = this.fairyKits.take(d.st.doc._id); // M13 G2: preloaded by CombatService.loadPets
      if (fairy) f.fairy = fairy;
      return { character: f, pet: d.pet && petFighter(0, d.pet) };
    };
    const board = systemBoard(sideA.map(entryOf), sideB.map(entryOf));
    const now = Date.now();
    const members = new Map<number, BattleMember>();
    const slotOf = new Map<number, number>();
    sideA.forEach((d, i) => slotOf.set(d.session.characterId!, SYSTEM_SLOTS.attacker[i]));
    sideB.forEach((d, i) => slotOf.set(d.session.characterId!, SYSTEM_SLOTS.target[i]));
    for (const d of [...sideA, ...sideB]) {
      const cid = d.session.characterId!;
      members.set(cid, { cid, slot: slotOf.get(cid)!, left: false, acked: false, result: emptyResult() });
    }
    const leaderId = sideA[0].session.characterId!;
    const battle: Battle = {
      id: `${now}_${leaderId}`, characterId: leaderId, members, commands: new Map(), mapId: sideA[0].session.mapId, nid: 0, fighters: board,
      round: 1, ended: false, result: BattleResult.LOSE, busy: false, deadline: now + PK_ROUND_MS, pvp: true, ...(ctx ? { ctx } : {}),
    };
    this.manager.add(battle);
    const cList: BattleStart['cList'] = {};
    for (const f of board.values()) cList[String(f.slot)] = toParticipant(f);
    for (const [list, guest] of [[sideA, false], [sideB, true]] as const) {
      for (const d of list) {
        const s = d.session;
        this.spectate.release(s.characterId!);
        s.battleId = battle.id;
        this.trades.stopFor(s.characterId!, true);
        s.encounterUntil = now + ENCOUNTER_COOLDOWN_MS;
        const pet = board.get(members.get(s.characterId!)!.slot + BATTLE_PET_SLOT_OFFSET);
        if (pet?.kind === 'pet') {
          s.callback('onUpdatePet', pet.refId, 'currentHp', pet.hpMax);
          s.callback('onUpdatePet', pet.refId, 'currentMp', pet.mpMax);
        }
        pushCharState(this.scenes, s, CharState.BATTLE);
        const start: BattleStart = { battleFieldId: battle.id, nid: 0, cList, bossFlag: 0, sneakFlag: 0, guest, airBattle: false };
        if (!guest && !battle.start) battle.start = start; // spectators see the attacker's view
        s.callback('onBattleStart', start);
      }
    }
    return battle;
  }

  /**
   * A duelist's connection closed mid-battle: it loses (Go let the target win by quirk). Its vitals are saved (at least 1 HP),
   * the battle is settled without rewards and the other player is sent the end marker so its client can finish normally.
   */
  async onLeave(battle: Battle, member: BattleMember): Promise<void> {
    const own = battle.fighters.get(member.slot)!;
    member.left = true;
    own.hp = Math.max(1, own.hp);
    await this.settleService.saveVitals(member.cid, own);
    await this.settleService.settle(battle, leaveResult(own.side));
    this.manager.detach(battle, member.cid);
    for (const other of battle.members.values()) {
      if (other.cid === member.cid || other.left) continue;
      const s = this.scenes.findByCharacter(other.cid);
      if (!s) {
        this.manager.detach(battle, other.cid);
        continue;
      }
      const f = battle.fighters.get(other.slot)!;
      const marker = { sid: -1, tid: -1, bid: BattleBehavior.STAND, end: true, result: battle.result };
      const list: BattlePlayList = [[endStepFor(true, f.side, marker, other.result.report)]];
      s.callback('onUPP', { currentHp: f.hp, currentMp: f.mp });
      s.callback('onBattlePlayList', list);
    }
    this.spectate.finish(battle);
  }
}
