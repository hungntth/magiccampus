// Star instance (Tinh Giới Thập Nhị Cung; Go application/starinstance + handlers/starinstance): getWarMap, addWarMapTime (extra attempts
// for gold), clickWarMap (gate every roster member, each spends an attempt, start the palace battle, refund on a failed start) and the
// battle end: the end hook scores every member's win (best score kept, starPnt) and the battlePlayEnd reply carries the report card.
// Spend before credit: attempts / gold are persisted before the win is recorded and starPnt is granted.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BattleResult, ClickWarMapCode, STAR_BATTLE_SOURCE, starPntForLevel, starWinScore, type ClickWarMapReply, type StarBattleEndReply, type WarMapReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { BattleHooks, type BattleEndEvent } from '../combat/battle-hooks';
import type { Battle } from '../combat/battle.types';
import { CombatService } from '../combat/combat.service';
import { NPC_BATTLE_TEXT } from '../combat/npc-battle.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import { CurrencyService } from '../progression/currency.service';
import { StarCultivation } from './star-cultivation.service';
import { enemyLevelFallback, palaceEnemies } from './star-lineup';
import { attemptsLeft, clickGate, planAddTime, recordScore, warMapGrid } from './star-rules';
import { StarStateService } from './star-state.service';

const OUTCOME_TTL_MS = 10 * 60_000;
/** The boss creature row of palace `sid` (453-464); only a label for the battle context. */
const bossRow = (sid: number): number => 452 + sid;

interface Outcome {
  reply: StarBattleEndReply;
  total?: number; // starPnt balance after a win (setStarPoint)
  at: number;
}

@Injectable()
export class StarInstanceService implements OnModuleInit {
  private readonly logger = new Logger(StarInstanceService.name);
  private readonly started = new Map<string, number>(); // battle id -> start ms
  private readonly outcomes = new Map<string, Outcome>(); // `${battle id}:${cid}` -> the member's reply

  constructor(
    private readonly states: StarStateService,
    private readonly cultivation: StarCultivation,
    private readonly characters: CharacterService,
    private readonly currency: CurrencyService,
    private readonly combat: CombatService,
    private readonly gameData: GameDataService,
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly battleHooks: BattleHooks,
  ) {}

  onModuleInit(): void {
    this.battleHooks.onEnd(STAR_BATTLE_SOURCE, (e) => this.onEnd(e));
    this.battleHooks.onReply(STAR_BATTLE_SOURCE, (battle, cid) => this.takeReply(battle, cid));
  }

  /** getWarMap: the 12 x 12 best scores, today's attempts, the finished palace levels and the starPnt balance. */
  getWarMap(cid: number): Promise<WarMapReply> {
    return this.states.locked(cid, async () => {
      const { st, dirty } = await this.states.open(cid);
      if (dirty) await this.states.save(cid, st); // a lost race only delays the day roll
      return {
        d: warMapGrid(st), s: { smax: st.dailyMax, snum: st.dailyUsed }, p: await this.cultivation.levels(cid), pnt: await this.currency.balance(cid, 'starPnt'),
      };
    });
  }

  /** addWarMapTime(currentMax): one more attempt for (max - 4) x 10 gold; the new max, 0 on any refusal (Go). */
  addTime(session: Session, currentMax: number): Promise<number> {
    const cid = session.characterId!;
    return this.states.locked(cid, async () => {
      const plan = planAddTime((await this.states.open(cid)).st, currentMax);
      if (!plan.ok) return 0;
      const gold = await this.characters.spendMoney(cid, 'gold', plan.cost);
      if (gold === null) return 0;
      let max = 0;
      const saved = await this.states.mutate(cid, (st) => {
        const again = planAddTime(st, currentMax);
        if (!again.ok || again.cost !== plan.cost) return false;
        st.dailyMax += 1;
        max = st.dailyMax;
        return true;
      });
      if (!saved) {
        await this.characters.addMoney(cid, 'gold', plan.cost);
        session.callback('onUPP', { gold: gold + plan.cost });
        return 0;
      }
      session.callback('onAddMoney', cid, 'gold', -plan.cost, gold);
      session.callback('onUPP', { gold });
      session.callback('updateWarMapStatus', { smax: max });
      return max;
    });
  }

  /** clickWarMap(sid, level): leader (or solo) with the eligible members; refusal codes name the first failing member. */
  async click(session: Session, sid: number, level: number): Promise<ClickWarMapReply> {
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    if (party && party.leaderId !== cid && !party.afk.has(cid)) throw RpcException.forbidden(NPC_BATTLE_TEXT.NOT_LEADER);
    const { sessions, sts } = await this.combat.roster(session);
    if (!sts[0] || sessions[0] !== session || sts[0].doc.currentHp <= 0) throw RpcException.forbidden(NPC_BATTLE_TEXT.DEAD);
    const ids = sessions.map((s) => s.characterId!);
    for (let i = 0; i < ids.length; i++) {
      const { st } = await this.states.open(ids[i]);
      const code = clickGate(st, await this.cultivation.of(ids[i], sid), sid, level);
      if (code !== ClickWarMapCode.OK) return { c: code, d: { id: ids[i], name: sts[i].doc.name } };
    }
    const used = new Map<number, number>();
    for (const id of ids) {
      const n = await this.spend(id);
      if (n === null) {
        await this.refund([...used.keys()]);
        const name = sts[ids.indexOf(id)].doc.name;
        return { c: ClickWarMapCode.NO_ATTEMPTS, d: { id, name } };
      }
      used.set(id, n);
    }
    const enemyLevel = this.gameData.starTemplateAt(sid, level)?.reqLevel || enemyLevelFallback(level);
    const enemies = palaceEnemies(sid, enemyLevel, (id) => this.gameData.creature(id));
    const battle = enemies.length === 0 ? null : this.combat.startGroup(
      sessions, sts, enemies, 0, await this.combat.loadPets(ids), { source: STAR_BATTLE_SOURCE, bossNid: bossRow(sid), floor: level, key: String(sid) },
    );
    if (!battle) {
      await this.refund(ids);
      this.logger.warn(`palace ${sid} level ${level}: battle did not start for ${ids.join(',')}`);
      return { c: ClickWarMapCode.FAIL };
    }
    this.started.set(battle.id, Date.now());
    await this.refund(ids.filter((id) => !battle.members.has(id))); // a member that started another fight meanwhile
    for (const s of sessions) {
      const n = used.get(s.characterId!);
      if (n !== undefined && battle.members.has(s.characterId!)) s.callback('updateWarMapStatus', { snum: n });
    }
    this.logger.log(`palace ${sid} level ${level} started by ${cid} with ${[...battle.members.keys()].join(',')} (enemy level ${enemyLevel})`);
    return { c: ClickWarMapCode.OK };
  }

  /** One attempt spent (CAS); the new used count, null when none are left. */
  private spend(cid: number): Promise<number | null> {
    return this.states.locked(cid, async () => {
      let used: number | null = null;
      await this.states.mutate(cid, (st) => {
        if (attemptsLeft(st) <= 0) return false;
        st.dailyUsed += 1;
        used = st.dailyUsed;
        return true;
      });
      return used;
    });
  }

  /** Gives back one attempt each (a battle that did not start). */
  private async refund(cids: readonly number[]): Promise<void> {
    for (const cid of cids) {
      await this.states.locked(cid, () => this.states.mutate(cid, (st) => {
        if (st.dailyUsed <= 0) return false;
        st.dailyUsed -= 1;
        return true;
      }));
    }
  }

  /** Battle settled: score each member who stayed (win = best score + starPnt, loss = `{r:0}`); the reply is taken at battlePlayEnd. */
  private async onEnd(e: BattleEndEvent): Promise<void> {
    const { battle, result } = e;
    const sid = Number(battle.ctx?.key);
    const level = battle.ctx?.floor ?? 0;
    const startedAt = this.started.get(battle.id) ?? Date.now();
    this.started.delete(battle.id);
    const now = Date.now();
    for (const [k, o] of this.outcomes) if (now - o.at > OUTCOME_TTL_MS) this.outcomes.delete(k);
    const elapsedSec = Math.max(Math.floor((now - startedAt) / 1000), 0);
    const deaths = [...battle.fighters.values()].filter((f) => f.side === 'player' && (!f.alive || f.hp <= 0)).length;
    for (const m of e.members) {
      if (m.left) continue;
      const key = `${battle.id}:${m.cid}`;
      if (result !== BattleResult.WIN) {
        this.outcomes.set(key, { reply: { r: 0 }, at: now });
        continue;
      }
      const score = starWinScore(deaths, elapsedSec);
      await this.states.locked(m.cid, () => this.states.mutate(m.cid, (st) => recordScore(st, sid, level, score)));
      let total: number | undefined;
      try {
        total = await this.currency.credit(m.cid, 'starPnt', starPntForLevel(level));
      } catch (err) {
        this.logger.error(`palace ${sid} level ${level}: starPnt credit for ${m.cid} failed: ${(err as Error).message}`);
      }
      this.outcomes.set(key, { reply: { r: 1, s: { id: sid, level, score, time: elapsedSec * 1000, die: deaths } }, total, at: now });
    }
  }

  /** battlePlayEnd reply of one member (setStarPoint goes out first, as Go); null when nothing was recorded for it. */
  private takeReply(battle: Battle, cid: number): StarBattleEndReply | null {
    const key = `${battle.id}:${cid}`;
    const o = this.outcomes.get(key);
    if (!o) return null;
    this.outcomes.delete(key);
    if (o.total !== undefined) this.scenes.findByCharacter(cid)?.callback('setStarPoint', o.total);
    return o.reply;
  }
}
