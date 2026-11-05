// Vùng Đất Rèn Luyện trainer + battles (Go handlers/trials run.go): the Huấn Luyện Viên menu (time left, HP, "Khiêu chiến <boss>",
// "Rời khỏi" = trials_fight_<floor> / trials_out), the trainer fight (the leader's eligible party members whose run is on that floor and
// stage join; source 'trials', round cap 150, the floor's death rule) and the result applied to every member's own run (win -> kt + best
// score, floor 3 stage clear, loss -> one life, timeout / no lives end the run).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BattleResult, TRIALS, TRIALS_FLOORS, TRIALS_TEXT, trialsFloor, type TrialsFloorDef } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { BattleHooks } from '../combat/battle-hooks';
import type { BattleMember } from '../combat/battle.types';
import { CombatService } from '../combat/combat.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { sendList, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { stageBossName, trialsCfg } from './trials-config';
import { battleHint, floorDeathRule, stageEnemies } from './trials-lineup';
import type { TrialsRun } from '../towers/towers.schema';
import { formatLeft, timerPayload, type TrialsOutcome } from './trials-rules';
import { TrialsEntryService } from './trials-entry.service';
import { TrialsService } from './trials.service';

export const TRIALS_SOURCE = 'trials';
const FIGHT = /^trials_fight_(\d+)$/;
const OUT = 'trials_out';

const trainerFloor = (npcId: number): TrialsFloorDef | undefined => TRIALS_FLOORS.find((f) => f.trainer === npcId);

@Injectable()
export class TrialsFightService implements OnModuleInit {
  private readonly logger = new Logger(TrialsFightService.name);

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly battleHooks: BattleHooks,
    private readonly combat: CombatService,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly trials: TrialsService,
    private readonly entry: TrialsEntryService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('trials', (s, npc) => this.click(s, npc.id), 60);
    this.hooks.onScript('trials', (s, func) => this.script(s, func), 60);
    this.battleHooks.onEnd(TRIALS_SOURCE, (e) => this.onEnd(e.result, e.members));
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const def = trainerFloor(npcId);
    if (!def) return false;
    const run = await this.trials.activeRun(session.characterId!);
    const cfg = trialsCfg(def.floor)!;
    const options = [];
    let info: string = TRIALS_TEXT.MENU_NO_RUN;
    if (run && run.f === def.floor) {
      info = TRIALS_TEXT.MENU_RUN(def.floor, def.name, formatLeft(run.dl - this.trials.now()), run.lv);
      options.push({ label: TRIALS_TEXT.LABEL_FIGHT(stageBossName(cfg, run.sg ?? 0, def.name)), func: `trials_fight_${def.floor}` });
    }
    options.push({ label: TRIALS_TEXT.LABEL_OUT, func: OUT });
    sendList(session, npcId, String(this.gameData.getNpc(npcId)?.name ?? '') || def.name, info, options);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (func === OUT) {
      await this.entry.leave(session);
      return true;
    }
    const m = FIGHT.exec(func);
    if (!m) return false;
    await this.fight(session, Number(m[1]));
    return true;
  }

  /** trials_fight_<floor>: the leader's battle against the stage's line-up. */
  async fight(session: Session, floor: number): Promise<void> {
    const def = trialsFloor(floor);
    const cfg = trialsCfg(floor);
    if (!def || !cfg) return;
    const cid = session.characterId!;
    if (session.battleId !== null) return systemSay(session, TRIALS_TEXT.IN_BATTLE);
    const run = await this.trials.beginBattle(cid, floor);
    if (!run) return systemSay(session, TRIALS_TEXT.MENU_NO_RUN);
    const stage = run.sg ?? 0;
    const taken = [cid];
    const fail = async (text: string): Promise<void> => {
      for (const id of taken) await this.trials.cancelBattle(id);
      systemSay(session, text);
    };
    const roster = await this.combat.roster(session);
    if (roster.sessions[0] !== session || roster.sts[0].doc.currentHp <= 0) return fail(TRIALS_TEXT.BATTLE_FAILED);
    const sessions = [session];
    const sts = [roster.sts[0]];
    for (let i = 1; i < roster.sessions.length; i++) {
      const s = roster.sessions[i];
      const mid = s.characterId!;
      const r = await this.trials.beginBattle(mid, floor);
      if (!r) {
        systemSay(s, TRIALS_TEXT.MEMBER_NO_RUN);
      } else if ((r.sg ?? 0) !== stage) {
        await this.trials.cancelBattle(mid);
        systemSay(s, TRIALS_TEXT.MEMBER_STAGE);
      } else {
        taken.push(mid);
        sessions.push(s);
        sts.push(roster.sts[i]);
      }
    }
    const enemies = stageEnemies(def, cfg, stage, (id) => this.gameData.creature(id));
    if (enemies.length === 0) {
      this.logger.warn(`floor ${floor} stage ${stage}: no enemy templates`);
      return fail(TRIALS_TEXT.BATTLE_FAILED);
    }
    const pets = await this.combat.loadPets(taken);
    const battle = this.combat.startGroup(sessions, sts, enemies, 0, pets, { source: TRIALS_SOURCE, floor, key: String(stage), roundCap: TRIALS.ROUND_CAP });
    if (!battle) return fail(TRIALS_TEXT.BATTLE_FAILED);
    battle.deathRule = floorDeathRule(cfg, stage, TRIALS.TWIN_ROUNDS);
    const hint = battleHint(cfg, stage, {
      guard: TRIALS_TEXT.HINT_GUARD_WAVE, deeven: TRIALS_TEXT.HINT_DEEVEN, twins: TRIALS_TEXT.HINT_TWINS(TRIALS.TWIN_ROUNDS), khakass: TRIALS_TEXT.HINT_KHAKASS,
    });
    if (hint) for (const s of sessions) systemSay(s, hint);
    this.logger.log(`trials floor ${floor} stage ${stage} started by ${cid} with ${sessions.length} fighters`);
  }

  /** Applies the result to each member's own run; a member that left the battle only drops the in-battle mark. */
  private async onEnd(result: number, members: BattleMember[]): Promise<void> {
    const won = result === BattleResult.WIN;
    for (const m of members) {
      if (m.left) {
        await this.trials.cancelBattle(m.cid);
        continue;
      }
      const r = await this.trials.finish(m.cid, won);
      const s = this.scenes.findByCharacter(m.cid);
      if (!r) continue;
      this.logger.log(`trials result ${m.cid} floor ${r.out.floor}: won ${won} score ${r.out.score} lives ${r.out.livesLeft} ended ${r.out.ended}`);
      if (s) this.push(s, r.out, r.run);
    }
  }

  private push(s: Session, out: TrialsOutcome, run: TrialsRun | undefined): void {
    const def = trialsFloor(out.floor)!;
    const key = String(out.floor);
    if (out.timedOut) return systemSay(s, TRIALS_TEXT.TIME_OUT);
    if (out.stageClear) {
      const cfg = trialsCfg(out.floor)!;
      systemSay(s, TRIALS_TEXT.STAGE_CLEAR(stageBossName(cfg, out.stage - 1, def.name), stageBossName(cfg, out.stage, def.name), out.livesLeft));
    } else if (out.won) {
      s.callback('onUpdateTrialsCharData', { nf: out.floor, kt: { [key]: out.stamp }, sc: { [key]: out.best } });
      systemSay(s, TRIALS_TEXT.WIN(out.floor, def.name, out.score, out.best));
      if (out.firstClear) systemSay(s, TRIALS_TEXT.FIRST_CLEAR(out.floor));
    } else if (out.ended) {
      return systemSay(s, TRIALS_TEXT.RUN_OVER);
    } else {
      systemSay(s, TRIALS_TEXT.LOST(out.livesLeft));
    }
    if (run) s.callback('onUpdateTrialsLifeAndTime', timerPayload(run, this.trials.now()));
  }
}
