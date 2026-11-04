// Loop quest orchestration: NPC loopInfo (canTake per hosted loop), takeLoop / cancelLoop / loopRepaire. Round completion is
// QuestService.finish -> LoopStateService.advance (the round is a normal quest). Gates follow Go CanTakeLoop.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { MAX_QUEST_NUM, LoopId } from '@mc/shared';
import type { ChaQuest, LoopStateDTO, NpcLoopInfo } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { GuildMemberRow } from '../guild/guild.schema';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import { CharacterQuest } from '../quest/quest.schema';
import { QuestService } from '../quest/quest.service';
import { LoopDataService } from './loop-data.service';
import { LoopStateService } from './loop-state.service';
import { buildLoopInfo, pickRound, roundsForLevel, takeBlocker, type LoopInfoEntry } from './loop-rules';

export interface TakeLoopOutcome {
  dto: LoopStateDTO;
  quest: ChaQuest;
  npcIds: number[];
}

@Injectable()
export class LoopService {
  /** Clock, replaceable in tests. */
  now = (): number => Date.now();

  constructor(
    @InjectModel(Character.name) private readonly characters: Model<Character>,
    @InjectModel(GuildMemberRow.name) private readonly members: Model<GuildMemberRow>,
    @InjectModel(CharacterQuest.name) private readonly quests: Model<CharacterQuest>,
    private readonly data: LoopDataService,
    private readonly state: LoopStateService,
    private readonly questService: QuestService,
    private readonly gameData: GameDataService,
  ) {}

  private async level(characterId: number): Promise<number> {
    const doc = await this.characters.findById(characterId, { level: 1 }).lean();
    if (!doc) throw RpcException.notFound('character not found');
    return doc.level;
  }

  private async inGuild(characterId: number, lid: number): Promise<boolean> {
    return lid !== LoopId.GUILD || !!(await this.members.exists({ cid: characterId }));
  }

  /** `npcFuncInit.loopInfo` of an NPC: every loop it hosts with its canTake flag (Go GetLoopInfoForNpc). */
  async infoForNpc(characterId: number, npcId: number): Promise<NpcLoopInfo> {
    const defs = await this.data.defsByNpc(npcId);
    if (defs.length === 0) return { d: null, flag: false };
    const level = await this.level(characterId);
    const now = this.now();
    const entries: LoopInfoEntry[] = [];
    for (const def of defs) {
      const [state, pool, inGuild] = await Promise.all([
        this.state.state(characterId, def.id), this.data.pool(def.id), this.inGuild(characterId, def.id),
      ]);
      entries.push({ def, state, hasRound: roundsForLevel(pool, level).length > 0, inGuild });
    }
    return buildLoopInfo(entries, level, now);
  }

  take(characterId: number, lid: number, npcId: number, mapId: number): Promise<TakeLoopOutcome> {
    return withCharLock(characterId, () => this.takeLocked(characterId, lid, npcId, mapId));
  }

  private async takeLocked(characterId: number, lid: number, npcId: number, mapId: number): Promise<TakeLoopOutcome> {
    const def = await this.data.def(lid);
    if (!def) throw RpcException.notFound('Vòng nhiệm vụ không tồn tại');
    if (npcId !== def.nid || !this.questService.npcOnMap(npcId, mapId)) throw RpcException.forbidden('Không thể nhận nhiệm vụ ở đây');
    const level = await this.level(characterId);
    const [prev, pool, guild, held] = await Promise.all([
      this.state.state(characterId, lid), this.data.pool(lid), this.inGuild(characterId, lid),
      this.quests.countDocuments({ characterId }),
    ]);
    const blocker = takeBlocker(def, level, guild, prev, roundsForLevel(pool, level).length > 0, this.now());
    if (blocker) throw RpcException.forbidden(blocker);
    if (held >= MAX_QUEST_NUM) throw RpcException.forbidden(`Chỉ được nhận tối đa ${MAX_QUEST_NUM} nhiệm vụ`);
    const roundId = pickRound(pool, level, 0, this.state.rng);
    if (roundId === null) throw RpcException.forbidden('Hiện chưa có nhiệm vụ vòng phù hợp');
    const now = this.now();
    const st = await this.state.start(characterId, lid, roundId, now);
    try {
      await this.state.grantRound(characterId, roundId);
    } catch (e) {
      await this.state.restore(characterId, lid, prev);
      throw e;
    }
    const quest = await this.questService.chaQuest(characterId, roundId);
    if (!quest) throw RpcException.forbidden('Không thể nhận nhiệm vụ ở đây');
    return {
      dto: this.state.dto(lid, st), quest, npcIds: [def.nid, quest.data.startNpc, quest.data.finishNpc],
    };
  }

  /** Accept-time item pushes of the granted round (outside the character lock, like takeQuest). */
  startPushes(characterId: number, questId: number): Promise<Push[]> {
    return this.questService.startPushes(characterId, questId);
  }

  cancel(characterId: number, lid: number): Promise<{ qid: number; qn: number; npcIds: number[] }> {
    return withCharLock(characterId, async () => {
      const qid = await this.state.cancel(characterId, lid);
      const tpl = this.gameData.getQuest(qid);
      const def = await this.data.def(lid);
      const qn = await this.quests.countDocuments({ characterId });
      return { qid, qn, npcIds: [def?.nid ?? 0, tpl?.finishNpc ?? 0] };
    });
  }

  /** loopRepaire: the active round's quest again (recreated when it had gone missing). */
  repair(characterId: number, lid: number): Promise<ChaQuest> {
    return withCharLock(characterId, async () => {
      const r = await this.state.repair(characterId, lid);
      if (!r) throw RpcException.forbidden('Vòng nhiệm vụ không hoạt động');
      const quest = await this.questService.chaQuest(characterId, r.questId);
      if (!quest) throw RpcException.forbidden('Vòng nhiệm vụ không hoạt động');
      return quest;
    });
  }
}
