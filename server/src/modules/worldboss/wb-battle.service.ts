// World boss battles (Go application/worldboss battle.go): each player fights a private Hydra whose Life is the shared pool (capped at
// 2e9 for the Flash bar). Kit: skill pool 6023 / 5938 / 5937 at roll x3, control + debuff immunity, Ngày Diệt Vong at round 6 (E2.10).
// The end hook books damage = lost Life clamped to the pool, credits the battle's exp / bound silver / Chiến tích (persisted at once,
// pushed after battlePlayEnd), restores full HP / MP, refreshes HP + rank for the map and finishes the run on the killing blow.
// The battlePlayEnd reply hook schedules the follow-up: deferred result window, relive timer (dead or auto off) or the next battle.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SceneManager } from '../../gateway/scene.manager';
import { BattleHooks, type BattleEndEvent } from '../combat/battle-hooks';
import { CombatService } from '../combat/combat.service';
import { creatureFighter } from '../combat/fighters';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { WB } from './wb-config';
import { WbFinishService } from './wb-finish.service';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { attackMultiplier, battleBossHp, bookedDamage, bossLevel } from './wb-rules';
import { WbState } from './wb-state.service';

export const WB_SOURCE = 'worldboss';
/** battlePlayEnd runs inside BattleEndService.end: the follow-up waits until that call has finished its own pushes */
const AFTER_END_MS = 400;

@Injectable()
export class WbBattleService implements OnModuleInit {
  private readonly logger = new Logger(WbBattleService.name);
  /** swappable in tests / tools */
  after: (ms: number, fn: () => void) => void = (ms, fn) => void setTimeout(fn, ms).unref();

  constructor(
    private readonly state: WbState,
    private readonly push: WbPush,
    private readonly payout: WbPayoutService,
    private readonly finisher: WbFinishService,
    private readonly combat: CombatService,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly hooks: BattleHooks,
  ) {}

  onModuleInit(): void {
    this.hooks.onEnd(WB_SOURCE, (e) => this.onEnd(e));
    this.hooks.onReply(WB_SOURCE, (_battle, cid) => {
      this.after(AFTER_END_MS, () => void this.afterPlay(cid).catch((e: Error) => this.logger.error(`world boss follow-up of ${cid} failed: ${e.message}`)));
      return null;
    });
  }

  scheduleStart(cid: number, ms: number): void {
    this.after(ms, () => void this.start(cid).catch((e: Error) => this.logger.error(`world boss battle start of ${cid} failed: ${e.message}`)));
  }

  /** Starts the player's fight against the Hydra when the run is on and the player is on the map and idle. */
  async start(cid: number): Promise<void> {
    const ev = this.state.event;
    const p = ev.participants.get(cid);
    const session = this.scenes.findByCharacter(cid);
    if (!this.state.running || !p || !p.inMap || p.inBattle || ev.hp <= 0 || !session || session.battleId !== null) return;
    p.inBattle = true;
    p.dead = false;
    try {
      let st = await this.stats.compute(cid);
      if (st.doc.currentHp <= 0) {
        await this.payout.restoreVitals(cid); // no death penalty: a fallen player is revived to fight again
        st = await this.stats.compute(cid);
      }
      const tpl = this.gameData.creature(WB.BOSS_NID);
      if (!tpl) throw new Error(`creature ${WB.BOSS_NID} missing`);
      const boss = creatureFighter(0, tpl, bossLevel(st.doc.level), 1);
      boss.hp = boss.hpMax = battleBossHp(ev.hp);
      boss.resCode = WB.BATTLE_RES;
      boss.npc = { ...boss.npc, pool: [...WB.SKILL_POOL], chanceScale: WB.CHANCE_SCALE, controlImmune: true, debuffImmune: true };
      boss.doomsday = { round: WB.DOOMSDAY_ROUND, skillId: WB.DOOMSDAY_SKILL };
      const pets = await this.combat.loadPets([cid]);
      const battle = this.combat.startGroup([session], [st], [boss], WB.BOSS_NID, pets, {
        source: WB_SOURCE, bossNid: WB.BOSS_NID, roundCap: WB.ROUND_CAP, noRewards: true, atkMul: attackMultiplier(p.cheer),
      });
      if (!battle) throw new Error('battle did not start');
      p.battleId = battle.id;
    } catch (e) {
      p.inBattle = false;
      this.logger.warn(`world boss battle start of ${cid} failed: ${(e as Error).message}`);
      this.push.send(cid, 'onShowWbTimer');
    }
  }

  /** Settled battle (also a disconnect / flee): book the damage, pay the battle, restore vitals, push HP + rank, finish on the kill. */
  private async onEnd(e: BattleEndEvent): Promise<void> {
    const battle = e.battle;
    const cid = battle.characterId;
    const ev = this.state.event;
    const p = ev.participants.get(cid);
    if (!p || (p.battleId !== '' && p.battleId !== battle.id)) return;
    const boss = [...battle.fighters.values()].find((f) => f.side === 'enemy' && f.refId === WB.BOSS_NID);
    const me = battle.fighters.get(battle.members.get(cid)?.slot ?? -1);
    p.inBattle = false;
    p.battleId = '';
    p.dead = !me || me.hp <= 0;
    p.playPending = p.inMap;
    let dmg = 0;
    let killed = false;
    if (this.state.running && boss) {
      dmg = bookedDamage(boss.hpMax, boss.hp, ev.hp);
      ev.hp -= dmg;
      p.damage += dmg;
      if (ev.hp <= 0 && dmg > 0) {
        ev.hp = 0;
        ev.lastHitter = p.name;
        ev.lastHitterId = cid;
        killed = true;
      }
    }
    try {
      await this.payout.restoreVitals(cid);
      if (this.state.running) {
        const gain = await this.payout.creditBattle(cid, p.level, dmg);
        p.exp += gain.exp;
        p.money += gain.money;
        p.honor += gain.honor;
        if (gain.level > 0) p.level = gain.level;
        p.leveled = p.leveled || gain.leveled;
      }
    } catch (err) {
      this.logger.warn(`world boss battle payout of ${cid} failed: ${(err as Error).message}`);
    }
    if (dmg > 0) this.push.pushRank();
    this.logger.log(`world boss battle of ${cid} ended: damage ${dmg}, dead ${p.dead}, killed ${killed}`);
    if (killed) setImmediate(() => void this.finisher.finish('killed').catch((err: Error) => this.logger.error(`finish failed: ${err.message}`)));
  }

  /** The client reported battlePlayEnd: stats push, deferred result window, else the relive timer or the next auto battle. */
  private async afterPlay(cid: number): Promise<void> {
    const p = this.state.event.participants.get(cid);
    const session = this.scenes.findByCharacter(cid);
    if (!p || !session) return;
    p.playPending = false;
    if (!p.inMap || p.inBattle) return;
    const leveled = p.leveled;
    p.leveled = false;
    await this.payout.pushGain(session, leveled);
    if (p.resultPending) {
      p.resultPending = false;
      return void (await this.push.sendResult(p));
    }
    if (!this.state.running) return;
    if (p.dead || !p.auto) this.push.send(cid, 'onShowWbTimer');
    else this.scheduleStart(cid, WB.NEXT_BATTLE_MS);
  }

}
