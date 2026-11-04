// Quest-battle NPCs (clickNpc on type 10 / 19 / 20): starts a battle against the creatures of the character's active kill
// objectives, through the same start path as random encounters. Returns false when the NPC should open its normal dialog.

import { Injectable } from '@nestjs/common';
import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { QuestService } from '../quest/quest.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import type { Fighter } from './battle.types';
import { CombatService } from './combat.service';
import { creatureFighter } from './fighters';
import { QUEST_BATTLE_NPC_TYPES, questBattleLevel, questBattleTargets } from './quest-battle';

@Injectable()
export class QuestBattleService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly quests: QuestService,
    private readonly stats: CharacterStatsService,
    private readonly combat: CombatService,
  ) {}

  async tryStart(session: Session, npc: Row): Promise<boolean> {
    if (!QUEST_BATTLE_NPC_TYPES.has(Number(npc.type))) return false;
    const ctx = await this.quests.loadCtx(session.characterId!);
    const pick = questBattleTargets(String(npc.sub_type ?? ''), [...ctx.active.values()]);
    if (!pick) return false;
    const minLevel = this.gameData.getQuest(pick.questId)?.minLevel ?? 0;
    const map = this.gameData.getMap(session.mapId);
    const mapLevel = Number(map?.level) > 0 ? Number(map?.level) : Number(map?.lv ?? 0);
    const enemies: Fighter[] = [];
    for (const creatureId of pick.creatureIds) {
      const tpl = this.gameData.creature(creatureId);
      const slot = BATTLE_ENEMY_SLOTS[enemies.length];
      if (tpl && slot !== undefined) enemies.push(creatureFighter(slot, tpl, questBattleLevel(minLevel, tpl.useLevel, mapLevel)));
    }
    if (enemies.length === 0) return false;
    const st = await this.stats.compute(session.characterId!);
    if (st.doc.currentHp <= 0) throw RpcException.forbidden('Bạn đã kiệt sức, hãy hồi sinh trước');
    this.combat.start(session, st, enemies, Number(npc.id));
    return true;
  }
}
