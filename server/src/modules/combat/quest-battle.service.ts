// Quest-battle NPCs (clickNpc on type 10 / 19 / 20): starts a battle against the creatures of the character's active kill
// objectives, through the same start path as random encounters. Returns false when the NPC should open its normal dialog.
// Loop bosses (M9, sub_type "all") fall back to their paired round (Go npc/quest_battle.go LoopBossNpcQuest).

import { Injectable } from '@nestjs/common';
import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { lifeDivisor } from '../loop/loop-boss';
import { LoopBossService } from '../loop/loop-boss.service';
import { incompleteKillTargets } from '../quest/quest-progress';
import { QuestService } from '../quest/quest.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import type { Fighter } from './battle.types';
import { CombatService } from './combat.service';
import { creatureFighter } from './fighters';
import { ENEMY_PET_SLOTS } from './mechanics/summon';
import { QUEST_BATTLE_NPC_TYPES, questBattleLevel, questBattleTargets, weakenQuestEnemy } from './quest-battle';

/** Go MaxEnemySlots: the front row, then the back row (quest 645 fights six Khảo Quan). */
const QUEST_ENEMY_SLOTS: readonly number[] = [...BATTLE_ENEMY_SLOTS, ...ENEMY_PET_SLOTS];

interface Pick {
  questId: number;
  creatureIds: number[];
  /** Item-summoned loop bosses fight at the character's level with divided HP; 0 = the quest-battle level. */
  bossLevel: number;
  boss: boolean;
}

@Injectable()
export class QuestBattleService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly quests: QuestService,
    private readonly stats: CharacterStatsService,
    private readonly combat: CombatService,
    private readonly bosses: LoopBossService,
  ) {}

  private async pick(session: Session, npc: Row): Promise<Pick | null> {
    const cid = session.characterId!;
    const ctx = await this.quests.loadCtx(cid);
    const npcId = Number(npc.id);
    const isQuestNpc = (questId: number): boolean => {
      const q = this.gameData.getQuest(questId);
      return !!q && (q.startNpc === npcId || q.finishNpc === npcId);
    };
    const plain = questBattleTargets(String(npc.sub_type ?? ''), [...ctx.active.values()], isQuestNpc);
    if (plain) return { ...plain, bossLevel: 0, boss: false };
    const spec = await this.bosses.present(cid, session.mapId, Number(npc.id));
    const row = spec && ctx.active.get(spec.questId);
    const creatureIds = row ? incompleteKillTargets(row.objectives) : [];
    if (!spec || creatureIds.length === 0) return null;
    const level = spec.itemId > 0 ? ((await this.stats.compute(cid)).doc.level) : 0;
    return { questId: spec.questId, creatureIds, bossLevel: level, boss: true };
  }

  async tryStart(session: Session, npc: Row): Promise<boolean> {
    if (!QUEST_BATTLE_NPC_TYPES.has(Number(npc.type))) return false;
    const pick = await this.pick(session, npc);
    if (!pick) return false;
    const minLevel = this.gameData.getQuest(pick.questId)?.minLevel ?? 0;
    const map = this.gameData.getMap(session.mapId);
    const mapLevel = Number(map?.level) > 0 ? Number(map?.level) : Number(map?.lv ?? 0);
    const enemies: Fighter[] = [];
    for (const creatureId of pick.creatureIds) {
      const tpl = this.gameData.creature(creatureId);
      const slot = QUEST_ENEMY_SLOTS[enemies.length];
      if (!tpl || slot === undefined) continue;
      const f = creatureFighter(slot, tpl, pick.bossLevel || questBattleLevel(minLevel, tpl.useLevel, mapLevel));
      if (pick.boss) f.bossFlag = 1;
      if (pick.bossLevel > 0) f.hp = f.hpMax = Math.max(1, Math.floor(f.hpMax / lifeDivisor(pick.questId)));
      weakenQuestEnemy(f, pick.questId);
      enemies.push(f);
    }
    if (enemies.length === 0) return false;
    const st = await this.stats.compute(session.characterId!);
    if (st.doc.currentHp <= 0) throw RpcException.forbidden('Bạn đã kiệt sức, hãy hồi sinh trước');
    this.combat.start(session, st, enemies, Number(npc.id), await this.combat.loadPets([session.characterId!]));
    return true;
  }
}
