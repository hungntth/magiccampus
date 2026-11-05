// Ảo Ma Tháp NPCs and floor fights (Go handlers/hmtxl tower.go): 1135 Thủ Vệ (map 38: Khiêu chiến, Tái thiết lập tiến độ ->
// resetHMTAlert(999), guide), 1136 Dịch Chuyển (map 515: fight the floor guardian, next floor, info, "Lưu và thoát tháp") and the
// guardian NPCs 1137-1142. Funcs hmtw_<enter|enterok|reset|fight|next|info|exit>_<npc>, hmt_guide_<npc>, hmt_cancel_<npc>. The fight is
// solo PvE tagged {source 'hmt', floor}; the end hook records a win for the floor being challenged (refusals use onNpcMsg).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { BattleResult, HMT_TOWER, hmtGuardianNpc, type NpcMenuOption } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { BattleHooks } from '../combat/battle-hooks';
import { CombatService } from '../combat/combat.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { npcMsg, sendList, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { SceneTransportService } from '../scene/scene-transport.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { towerEnemies } from './tower-lineup';
import { TOWER_TEXT, towerCleared } from './tower-rules';
import { TowerService } from './tower.service';
import { TrainingRefusal } from './training-refusal';

const SOURCE = 'hmt';
const FUNC = /^hmtw_(enterok|enter|reset|fight|next|info|exit)_(\d+)$/;
const isGuardianNpc = (id: number): boolean => id >= HMT_TOWER.GUARDIAN_NPC_BASE && id < HMT_TOWER.GUARDIAN_NPC_BASE + HMT_TOWER.GUARDIAN_COUNT;
const opt = (label: string, verb: string, npc: number): NpcMenuOption => ({ label, func: `hmtw_${verb}_${npc}` });
const cancel = (npc: number): NpcMenuOption => ({ label: 'Hủy', func: `hmt_cancel_${npc}` });

@Injectable()
export class TowerHooks implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly battleHooks: BattleHooks,
    private readonly tower: TowerService,
    private readonly combat: CombatService,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
    private readonly transport: SceneTransportService,
    private readonly scenes: SceneManager,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('hmt-tower', (s, npc) => this.click(s, npc.id), 40);
    this.hooks.onScript('hmt-tower', (s, func) => this.script(s, func), 40);
    this.battleHooks.onEnd(SOURCE, (e) => this.onEnd(e.battle.ctx?.floor ?? 0, e.result, e.members.filter((m) => !m.left).map((m) => m.cid)));
  }

  private name(npc: number): string {
    return String(this.gameData.getNpc(npc)?.name ?? '') || 'NPC';
  }

  private guardianName(floor: number): string {
    return String(this.gameData.getNpc(hmtGuardianNpc(floor))?.name ?? '') || 'Ma Ảnh';
  }

  private async click(session: Session, npc: number): Promise<boolean> {
    if (npc === HMT_TOWER.KEEPER_NPC) {
      sendList(session, npc, this.name(npc), TOWER_TEXT.KEEPER, [
        opt('Khiêu chiến Ảo Ma Tháp', 'enter', npc), opt('Tái thiết lập tiến độ Ảo Ma Tháp', 'reset', npc), { label: 'Ảo Ma Tháp', func: `hmt_guide_${npc}` },
      ]);
    } else if (npc === HMT_TOWER.PORTER_NPC) await this.porterMenu(session, npc);
    else if (isGuardianNpc(npc)) {
      sendList(session, npc, this.name(npc), TOWER_TEXT.GUARDIAN, [opt('Xin chỉ giáo', 'fight', npc), { label: 'Ta cần chuẩn bị đã', func: `hmt_cancel_${npc}` }]);
    } else return false;
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    const g = /^hmt_(guide|cancel)_(\d+)$/.exec(func);
    if (g) {
      if (g[1] === 'guide') npcMsg(session, Number(g[2]), TOWER_TEXT.GUIDE);
      return true;
    }
    const m = FUNC.exec(func);
    if (!m) return false;
    const verb = m[1];
    const npc = Number(m[2]);
    try {
      if (verb === 'enter') {
        sendList(session, npc, 'Khiêu chiến Ảo Ma Tháp', 'Bạn có muốn vào Ảo Ma Tháp không?', [opt('Ok', 'enterok', npc), cancel(npc)]);
      } else if (verb === 'enterok') await this.enter(session, npc);
      else if (verb === 'reset') {
        if (session.mapId === HMT_TOWER.EXIT_MAP) session.callback('resetHMTAlert', HMT_TOWER.RESET_GOLD);
      } else if (verb === 'fight') await this.fight(session, npc);
      else if (verb === 'next') await this.next(session, npc);
      else if (verb === 'info') {
        const t = await this.tower.peek(session.characterId!);
        npcMsg(session, npc, TOWER_TEXT.INFO(t.b, t.f));
      } else await this.exit(session);
    } catch (e) {
      if (!(e instanceof TrainingRefusal)) throw e;
      npcMsg(session, npc, e.message);
    }
    return true;
  }

  private async porterMenu(session: Session, npc: number): Promise<void> {
    const cid = session.characterId!;
    try {
      let t = await this.tower.peek(cid);
      if (t.f <= 0) t = await this.tower.enter(cid);
      const options: NpcMenuOption[] = [];
      if (!towerCleared(t)) options.push({ label: `Khiêu chiến ${this.guardianName(t.f)} (tầng ${t.f})`, func: `hmtw_fight_${npc}` });
      if (t.f < HMT_TOWER.FLOORS) options.push(opt(`Vào Ảo Ma Tháp tầng ${t.f + 1}`, 'next', npc));
      options.push(opt('Xem thông tin vượt tháp', 'info', npc), opt('Lưu và thoát tháp', 'exit', npc));
      sendList(session, npc, this.name(npc), TOWER_TEXT.PORTER(t.f), options);
    } catch (e) {
      if (!(e instanceof TrainingRefusal)) throw e;
      npcMsg(session, npc, e.message);
    }
  }

  private async moveTo(session: Session, mapId: number, x?: number, y?: number): Promise<void> {
    const map = this.gameData.getMap(mapId);
    if (!map) return;
    const px = x ?? Number(map.safe_x ?? 0);
    const py = y ?? Number(map.safe_y ?? 0);
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, px, py, false));
  }

  private async enter(session: Session, npc: number): Promise<void> {
    if (session.mapId !== HMT_TOWER.EXIT_MAP) return;
    if (session.battleId !== null) return npcMsg(session, npc, TOWER_TEXT.IN_BATTLE);
    const t = await this.tower.enter(session.characterId!);
    await this.moveTo(session, HMT_TOWER.MAP);
    systemSay(session, TOWER_TEXT.ENTERED(t.f, this.guardianName(t.f)));
  }

  private async next(session: Session, npc: number): Promise<void> {
    if (session.mapId !== HMT_TOWER.MAP) return npcMsg(session, npc, TOWER_TEXT.NOT_IN_TOWER);
    const t = await this.tower.advance(session.characterId!);
    await this.moveTo(session, HMT_TOWER.MAP);
    systemSay(session, TOWER_TEXT.UP(t.f, this.guardianName(t.f)));
  }

  private async exit(session: Session): Promise<void> {
    if (session.battleId !== null) return systemSay(session, TOWER_TEXT.IN_BATTLE);
    await this.tower.leave(session.characterId!);
    const keeper = this.gameData.getNpc(HMT_TOWER.KEEPER_NPC);
    await this.moveTo(session, HMT_TOWER.EXIT_MAP, keeper ? Number(keeper.pos_x) : undefined, keeper ? Number(keeper.pos_y) : undefined);
  }

  private async fight(session: Session, npc: number): Promise<void> {
    if (session.battleId !== null) return systemSay(session, TOWER_TEXT.IN_BATTLE);
    if (session.mapId !== HMT_TOWER.MAP) return npcMsg(session, npc, TOWER_TEXT.NOT_IN_TOWER);
    const cid = session.characterId!;
    const floor = await this.tower.beginFight(cid);
    const enemies = towerEnemies(floor, (id) => this.gameData.creature(id), shuffle);
    const st = await this.stats.compute(cid);
    if (enemies.length === 0 || st.doc.currentHp <= 0) return systemSay(session, TOWER_TEXT.FIGHT_FAILED);
    const pets = await this.combat.loadPets([cid]);
    const battle = this.combat.startGroup([session], [st], enemies, hmtGuardianNpc(floor), pets, { source: SOURCE, floor, key: SOURCE });
    if (!battle) systemSay(session, TOWER_TEXT.FIGHT_FAILED);
  }

  private async onEnd(floor: number, result: number, players: number[]): Promise<void> {
    if (result !== BattleResult.WIN || floor <= 0) return;
    for (const cid of players) {
      const { best, newBest } = await this.tower.recordWin(cid, floor);
      if (!newBest) continue;
      let text = TOWER_TEXT.FLOOR_WIN(this.guardianName(floor), floor, best);
      if (best >= HMT_TOWER.FLOORS) text += ` ${TOWER_TEXT.TOP}`;
      this.scenes.findByCharacter(cid)?.callback('onSystemSay', text);
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
