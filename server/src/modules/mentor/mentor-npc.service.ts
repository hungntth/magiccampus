// Sư đồ NPC glue: NPC 49 Quản Lý Tiến Cử (click -> onList menu with "Tiến cử thành viên nhóm" -> tutorFuncAlert -> confirmTutor, also
// reachable as npcFuncOther(49, 1)) and the quest 692 turn-in that makes a Lv 30+ character rank 1. The menu uses the M10
// NpcHookRegistry (the dungeon entrance pattern, with the "Nhiệm vụ" entry first when the NPC has quests).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MENTOR_QUALIFY_QUEST, MENTOR_TEXT, NPC_TUTOR, type InstanceNpc, type NpcMenuOption, type TutorFuncAlert } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { sendList } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { PartyManager } from '../party/party.manager';
import { QuestGates } from '../quest/quest-gates';
import { QuestService } from '../quest/quest.service';
import { MentorStateService } from './mentor-state.service';
import { REFUSAL } from './mentor-rules';
import { MentorService } from './mentor.service';

const questEntryFunc = (npcId: number): string => `open_npc_interaction_${npcId}`;

@Injectable()
export class MentorNpcService implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly gates: QuestGates,
    private readonly mentor: MentorService,
    private readonly state: MentorStateService,
    private readonly parties: PartyManager,
    private readonly quests: QuestService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly instances: InstanceNpcService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('mentor-npc', (s, npc) => this.click(s, npc.id), 50);
    this.hooks.onScript('mentor-npc', (s, func) => this.script(s, func), 50);
    this.instances.register('mentor-npc', (_s, mapId) => this.hubNpc(mapId));
    this.gates.onFinished('mentor', (s, tpl) => this.onQuest(s, tpl.id));
  }

  /** NPC 49 as a per-viewer NPC on the hub map (its own row stands on the non-existent map 100). */
  private hubNpc(mapId: number): InstanceNpc[] {
    const row = this.gameData.getNpc(NPC_TUTOR.npcId);
    if (!row || mapId !== NPC_TUTOR.hub.mapId) return [];
    return [{ ...this.gameData.toSceneNpc(row), posX: NPC_TUTOR.hub.x, posY: NPC_TUTOR.hub.y, nid: NPC_TUTOR.npcId, map: mapId }];
  }

  /** Quest 692 turn-in: rank 0 -> 1 (onUPP + title 1). */
  private async onQuest(session: Session, questId: number): Promise<void> {
    if (questId !== MENTOR_QUALIFY_QUEST) return;
    const me = await this.characters.getById(session.characterId!);
    await this.state.qualify(me._id, me.level, { announce: true, force: true });
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    if (npcId !== NPC_TUTOR.npcId) return false;
    const npc = this.gameData.getNpc(npcId);
    const options: NpcMenuOption[] = [];
    const q = await this.quests.listForNpc(session.characterId!, npcId);
    if (Object.keys(q.list).length > 0) options.push({ label: 'Nhiệm vụ', func: questEntryFunc(npcId) });
    options.push({ label: NPC_TUTOR.label, func: NPC_TUTOR.scriptFunc });
    sendList(session, npcId, String(npc?.name ?? ''), String(npc?.on_service_text ?? ''), options);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (func !== NPC_TUTOR.scriptFunc) return false;
    await this.ask(session);
    return true;
  }

  /** npcFuncOther(49, 1): the caller (a party member) checks the leader and gets `tutorFuncAlert {i: leaderId}`. */
  async ask(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (!(await this.instances.find(session, NPC_TUTOR.npcId))) throw RpcException.forbidden(REFUSAL.farNpc);
    const leaderId = this.parties.partyOf(cid)?.leaderId ?? 0;
    await this.mentor.checkNpc(cid, leaderId);
    this.mentor.drafts.set(cid, leaderId, this.mentor.now());
    const alert: TutorFuncAlert = { i: leaderId };
    session.callback('tutorFuncAlert', alert);
  }

  /** confirmTutor(): needs the live draft of `ask` naming the current leader; links the pair (a rank-0 leader becomes rank 1). */
  async confirm(session: Session): Promise<void> {
    const cid = session.characterId!;
    const leaderId = this.parties.partyOf(cid)?.leaderId ?? 0;
    if (leaderId <= 0) throw RpcException.forbidden(REFUSAL.noTeam);
    if (!this.mentor.online(leaderId)) throw RpcException.forbidden(REFUSAL.leaderOffline);
    if (!this.mentor.drafts.take(cid, leaderId, this.mentor.now())) throw RpcException.forbidden(MENTOR_TEXT.expired);
    await this.mentor.linkPair(leaderId, cid, true, false);
  }
}
