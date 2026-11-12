// Cupid 215 / Nguyệt Lão 852 menu and the NPC marriage (Go npc_menu.go / npc_wedding.go): click -> onList ("Nhiệm vụ" first when the
// NPC has quests, "Kết hôn (đội 2 người nam nữ)", "Hướng dẫn kết hôn"); the leader of a two-member mixed team proposes, the partner
// gets onConfirmAlert(question, "acceptNpcMarriage") and acceptNpcMarriage() marries them (60 s window, in memory).
// Phase E: the menu also offers `marriage_book_1..3` (tier pick -> onWeddingTier + onInitBookList) and `marriage_list` (the list, tier 1).
// Nguyệt Lão 852 is registered as a per-viewer instance NPC on Anh Vũ Cảnh beside Cupid (its own row stands on the empty map 100).

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MARRIAGE_FUNC, MARRIAGE_GUIDE, MARRIAGE_TEXT, NPC_MARRIAGE, WEDDING_TIERS, type InstanceNpc, type NpcMenuOption } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { sendList, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { PartyManager } from '../party/party.manager';
import { QuestService } from '../quest/quest.service';
import { SceneManager } from '../../gateway/scene.manager';
import { MarriagePanelView } from './marriage-panel.view';
import { MarriagePush } from './marriage-push.service';
import { NPC_REFUSAL_TEXT, ProposalBook, checkNpcPair, type Person } from './marriage-rules';
import { MarriageService } from './marriage.service';
import { WeddingService } from './wedding.service';

export const ACCEPT_NPC_MARRIAGE = 'acceptNpcMarriage';

@Injectable()
export class MarriageNpcService implements OnModuleInit {
  private readonly proposals = new ProposalBook();
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
    private readonly quests: QuestService,
    private readonly gameData: GameDataService,
    private readonly marriages: MarriageService,
    private readonly view: MarriagePanelView,
    private readonly push: MarriagePush,
    private readonly wedding: WeddingService,
    private readonly instances: InstanceNpcService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('marriage-npc', (s, npc) => this.click(s, npc.nid), 50);
    this.hooks.onScript('marriage-npc', (s, func) => this.script(s, func), 50);
    this.instances.register('marriage-npc', (_s, mapId) => this.hubNpc(mapId));
  }

  /** Nguyệt Lão as a per-viewer NPC on the hub map (the id stays 852 so clickNpc resolves it through the instance list). */
  private hubNpc(mapId: number): InstanceNpc[] {
    const row = this.gameData.getNpc(852);
    if (!row || mapId !== NPC_MARRIAGE.hub.mapId) return [];
    return [{ ...this.gameData.toSceneNpc(row), posX: NPC_MARRIAGE.hub.x, posY: NPC_MARRIAGE.hub.y, nid: 852, map: mapId }];
  }

  /** Drops the character's pending proposals (disconnect / character leave). */
  forget(characterId: number): void {
    this.proposals.forget(characterId);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    if (!(NPC_MARRIAGE.npcIds as readonly number[]).includes(npcId)) return false;
    const npc = this.gameData.getNpc(npcId);
    const options: NpcMenuOption[] = [];
    const q = await this.quests.listForNpc(session.characterId!, npcId);
    if (Object.keys(q.list).length > 0) options.push({ label: 'Nhiệm vụ', func: NPC_MARRIAGE.questFunc(npcId) });
    options.push(
      { label: 'Kết hôn (đội 2 người nam nữ)', func: MARRIAGE_FUNC.wed },
      { label: 'Hướng dẫn kết hôn', func: MARRIAGE_FUNC.guide },
    );
    for (const t of WEDDING_TIERS) options.push({ label: `Đặt Lễ Cưới ${t.label} (${t.cost / 10_000} vạn bạc)`, func: MARRIAGE_FUNC.book(t.type) });
    options.push({ label: 'Danh sách lễ đường', func: MARRIAGE_FUNC.list });
    sendList(session, npcId, String(npc?.name ?? ''), String(npc?.on_service_text ?? ''), options);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (!func.startsWith(NPC_MARRIAGE.funcPrefix)) return false;
    switch (func) {
      case MARRIAGE_FUNC.wed:
        await this.propose(session);
        return true;
      case MARRIAGE_FUNC.guide:
        for (const line of MARRIAGE_GUIDE) systemSay(session, line); // an NPC bubble would cut the long text
        return true;
      case MARRIAGE_FUNC.list:
        await this.wedding.pickTier(session, null);
        return true;
      default: {
        const tier = func.startsWith(MARRIAGE_FUNC.bookPrefix) ? Number(func.slice(MARRIAGE_FUNC.bookPrefix.length)) : 0;
        if (!WEDDING_TIERS.some((t) => t.type === tier)) return false;
        await this.wedding.pickTier(session, tier);
        return true;
      }
    }
  }

  /** `marriage_wed`: the leader of a two-member team proposes to the teammate standing on the same map. */
  async propose(session: Session): Promise<void> {
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    if (!party || party.members.length !== 2) throw RpcException.forbidden(MARRIAGE_TEXT.npcNeedTeam);
    if (party.leaderId !== cid) throw RpcException.forbidden(MARRIAGE_TEXT.npcNeedLeader);
    const partnerId = party.members.find((m) => m !== cid) ?? 0;
    const partnerSession = this.scenes.findByCharacter(partnerId);
    if (!partnerSession) throw RpcException.forbidden(MARRIAGE_TEXT.npcOffline);
    if (session.mapId <= 0 || session.mapId !== partnerSession.mapId) throw RpcException.forbidden(MARRIAGE_TEXT.npcFar);
    const [from, to] = await this.pair(cid, partnerId);
    const p = this.proposals.set({ fromId: from.id, fromName: from.name, toId: to.id, toName: to.name }, this.now());
    partnerSession.callback('onConfirmAlert', MARRIAGE_TEXT.npcAsk(p.fromName), ACCEPT_NPC_MARRIAGE);
    systemSay(session, MARRIAGE_TEXT.npcSent(p.toName));
  }

  /** `acceptNpcMarriage()`: the target's answer; re-checks everything, marries, announces. */
  async accept(session: Session): Promise<null> {
    const cid = session.characterId!;
    const p = this.proposals.take(cid, this.now());
    if (!p) throw RpcException.forbidden(MARRIAGE_TEXT.proposalGone);
    await this.pair(p.fromId, p.toId);
    const doc = await this.marriages.marry(p.fromId, p.toId);
    await this.marriages.announceMarried(doc, p.fromId, p.toId);
    for (const id of [p.fromId, p.toId]) {
      await this.view.push(id);
      this.push.say(id, MARRIAGE_TEXT.wedded);
    }
    this.push.world(MARRIAGE_TEXT.worldWedded(p.fromName, p.toName));
    return null;
  }

  /** Fresh characters of a proposer / target pair, validated with the NPC gate (throws the refusal). */
  private async pair(fromId: number, toId: number): Promise<[Person, Person]> {
    const docs = await this.characters.findByIds([fromId, toId]);
    const f = docs.find((d) => d._id === fromId);
    const t = docs.find((d) => d._id === toId);
    if (!f || !t) throw RpcException.notFound(MARRIAGE_TEXT.notFound);
    const from: Person = { id: f._id, name: f.name, level: f.level, gender: f.gender };
    const to: Person = { id: t._id, name: t.name, level: t.level, gender: t.gender };
    const refusal = checkNpcPair(from, to, await this.marriages.isMarried(fromId), await this.marriages.isMarried(toId));
    if (refusal) throw RpcException.forbidden(NPC_REFUSAL_TEXT[refusal]);
    return [from, to];
  }
}
