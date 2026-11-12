// Intimacy sources (Go application/social/intimacy.go): gift items (`useIntimacyItem`, both directions, spend before credit),
// team gains (+6 per player at most once per 55 s) from a won group battle (BattleHooks.onAnyEnd, toward the other members) and
// a 60 s online-party tick. Only existing friend / couple / tutor / brother rows grow; every change reaches the owner through
// onSetClose. The throttle is cleaned on character leave (stale stamps only).

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { BattleResult, TEAM_INTIMACY, type UseIntimacyItemReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { BattleHooks } from '../combat/battle-hooks';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { PartyManager } from '../party/party.manager';
import { TeamThrottle, giftPlan, tickTargets } from './intimacy-rules';
import { RelationshipService, type IntimacyChange } from './relationship.service';

@Injectable()
export class IntimacyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntimacyService.name);
  private readonly throttle = new TeamThrottle();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly relations: RelationshipService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly scenes: SceneManager,
    private readonly parties: PartyManager,
    private readonly hooks: BattleHooks,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    this.hooks.onAnyEnd((e) => this.onBattleEnd(e.battle.pvp === true, e.result, e.members.filter((m) => !m.left).map((m) => m.cid)));
    const left = (s: Session): void => {
      if (s.characterId !== null) this.throttle.forget(s.characterId, Date.now());
    };
    this.gateway.onDisconnect(left);
    this.gateway.onCharacterLeave(left);
    this.timer = setInterval(() => void this.tick(), TEAM_INTIMACY.tickMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** `useIntimacyItem(targetName, qty, templateId)` (Go order: find target, self, friend check, consume, push, add, onSetClose). */
  async gift(session: Session, targetName: string, qty: number, templateId: number): Promise<UseIntimacyItemReply> {
    const plan = giftPlan(templateId, qty);
    if (!plan) throw RpcException.invalidArgs('qty');
    const selfId = session.characterId!;
    const target = await this.characters.findByName(targetName);
    if (!target) throw RpcException.forbidden('Không tìm thấy người chơi này.');
    if (target._id === selfId) throw RpcException.forbidden('Không thể tặng cho chính mình.');
    if (!(await this.relations.hasBond(selfId, target._id))) {
      throw RpcException.forbidden('Chỉ có thể tặng cho người trong danh sách bạn bè.');
    }
    const selfName = (await this.characters.getById(selfId)).name;
    await withCharLock(selfId, async () => {
      const have = (await this.inventory.countByTemplate(selfId, [plan.templateId])).get(plan.templateId) ?? 0;
      if (have < plan.qty) throw RpcException.forbidden('Không đủ vật phẩm.');
      const spent = await this.inventory.removeByTemplate(selfId, plan.templateId, plan.qty);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      const changes = await Promise.all([
        this.relations.addIntimacy(selfId, target._id, plan.total, target.name),
        this.relations.addIntimacy(target._id, selfId, plan.total, selfName),
      ]);
      this.relations.announce(changes.filter((c): c is IntimacyChange => c !== null));
    });
    return { success: true };
  }

  /** Team gain for `characterId` toward `targets` (one throttle claim per player, taken even when no row exists, as Go). */
  async awardTeam(characterId: number, targets: readonly number[]): Promise<void> {
    if (targets.length === 0 || !this.throttle.claim(characterId, Date.now())) return;
    const names = new Map((await this.characters.findByIds([...targets])).map((c) => [c._id, c.name]));
    const changes: IntimacyChange[] = [];
    for (const t of targets) {
      const change = await this.relations.addIntimacy(characterId, t, TEAM_INTIMACY.gain, names.get(t));
      if (change) changes.push(change);
    }
    this.relations.announce(changes);
  }

  private async onBattleEnd(pvp: boolean, result: number, players: number[]): Promise<void> {
    if (pvp || result !== BattleResult.WIN || players.length < 2) return;
    for (const cid of players) await this.awardTeam(cid, players.filter((p) => p !== cid));
  }

  /** 60 s online-party tick: each non-AFK member gains toward the other non-AFK online members. */
  private async tick(): Promise<void> {
    try {
      for (const session of this.scenes.onlineSessions()) {
        const cid = session.characterId;
        if (cid === null) continue;
        const party = this.parties.partyOf(cid);
        if (!party) continue;
        await this.awardTeam(cid, tickTargets(party.members, party.afk, cid, (m) => this.scenes.findByCharacter(m) !== undefined));
      }
    } catch (e) {
      this.logger.warn(`team intimacy tick failed: ${(e as Error).message}`);
    }
  }
}
