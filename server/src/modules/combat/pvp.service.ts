// PvP battles (M6 phase C, PVPStartClient): two player sides on the shared BattleManager. The attacker fights at slot 10 (pet 15),
// the target at slot 0 (pet 5, side 'enemy'); each client gets its own onBattleStart (`guest: true` for the target so it sees itself
// at the bottom). Rounds, commands and settle reuse the PvE pipeline (round.ts, BattleSettleService.settlePvp); this service builds
// the battle and handles a disconnect (the leaver loses). Pushes: onUpdatePet, onSetCharState 5, onBattleStart; on a leave onUPP + end marker.

import { Injectable } from '@nestjs/common';
import {
  BattleBehavior, BattleResult, BATTLE_PET_SLOT_OFFSET, CharState, PK_ROUND_MS, PK_SLOTS, type BattlePlayList, type BattleStart,
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
import type { Battle, BattleMember } from './battle.types';
import { ENCOUNTER_COOLDOWN_MS } from './encounter';
import { petFighter, playerFighter, toParticipant } from './fighters';
import { endStepFor, leaveResult, pvpBoard } from './pvp-rules';
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
  ) {}

  /** Registers the duel and sends both clients their start pushes. Sync; null when either side started another battle meanwhile. */
  start(attacker: Duelist, target: Duelist): Battle | null {
    if (attacker.session.battleId !== null || target.session.battleId !== null) return null;
    const fighterOf = (d: Duelist, slot: number) =>
      playerFighter(slot, d.st, this.characters.resCode(d.st.doc.classId, d.st.doc.gender), this.weapons.cached(d.st.doc._id));
    const a = fighterOf(attacker, 0);
    const t = fighterOf(target, 0);
    const board = pvpBoard(a, attacker.pet && petFighter(a.slot, attacker.pet), t, target.pet && petFighter(t.slot, target.pet));
    const now = Date.now();
    const aCid = attacker.session.characterId!;
    const tCid = target.session.characterId!;
    const members = new Map<number, BattleMember>();
    members.set(aCid, { cid: aCid, slot: PK_SLOTS.attacker, left: false, acked: false, result: emptyResult() });
    members.set(tCid, { cid: tCid, slot: PK_SLOTS.target, left: false, acked: false, result: emptyResult() });
    const battle: Battle = {
      id: `${now}_${aCid}`, characterId: aCid, members, commands: new Map(), mapId: attacker.session.mapId, nid: 0, fighters: board,
      round: 1, ended: false, result: BattleResult.LOSE, busy: false, deadline: now + PK_ROUND_MS, pvp: true,
    };
    this.manager.add(battle);
    const cList: BattleStart['cList'] = {};
    for (const f of board.values()) cList[String(f.slot)] = toParticipant(f);
    for (const [d, guest] of [[attacker, false], [target, true]] as const) {
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
      if (!guest) battle.start = start; // spectators see the attacker's view
      s.callback('onBattleStart', start);
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
