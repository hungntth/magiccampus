// Relationship RPCs (legacy names): initViewImC (-> onInitViewImC push), addRelationByName (-> onAddRelationship /
// onAddRelationByName(-1, type), friend adds also start the onBeFriendOfOther prompt), delRelationship (-> onDelRelationship),
// refuseToAddFriend (-> onRefusedToAddFriend to the requester), getFriendList, getBlackList, useIntimacyItem (-> bag pushes +
// onSetClose). Logic lives in RelationshipService, FriendRequestService and IntimacyService.

import { Injectable } from '@nestjs/common';
import { RelationType, type RelationEntry, type UseIntimacyItemReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FriendRequestService } from './friend-request.service';
import { IntimacyService } from './intimacy.service';
import { isRelationType, normalizeName } from './relationship-rules';
import { RelationshipService } from './relationship.service';

/** `refuseToAddFriend` takes `{targetId, selfName}` (Flash) or a bare id. */
function refuseTarget(arg: unknown): number {
  const raw = typeof arg === 'object' && arg !== null ? (arg as { targetId?: unknown }).targetId : arg;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('targetId');
  return id;
}

@Injectable()
export class RelationshipRpc {
  constructor(
    private readonly relations: RelationshipService,
    private readonly requests: FriendRequestService,
    private readonly intimacy: IntimacyService,
  ) {}

  @Rpc('initViewImC', { requireCharacter: true })
  async initViewImC(session: Session): Promise<null> {
    await this.relations.sendSnapshot(session);
    return null;
  }

  @Rpc('addRelationByName', { requireCharacter: true })
  async addRelationByName(session: Session, args: unknown[]): Promise<null> {
    const name = normalizeName(args[0]);
    if (!name) throw RpcException.invalidArgs('name');
    const type = Number(args[1]);
    if (!isRelationType(type)) throw RpcException.invalidArgs('type');
    const added = await this.relations.addByName(session, name, type);
    if (added?.type === RelationType.FRIEND) await this.requests.notify(session, added.targetId);
    return null;
  }

  @Rpc('delRelationship', { requireCharacter: true })
  async delRelationship(session: Session, args: unknown[]): Promise<null> {
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('id');
    await this.relations.remove(session, id);
    return null;
  }

  @Rpc('refuseToAddFriend', { requireCharacter: true })
  async refuseToAddFriend(session: Session, args: unknown[]): Promise<null> {
    await this.requests.refuse(session, refuseTarget(args[0]));
    return null;
  }

  @Rpc('getFriendList', { requireCharacter: true })
  getFriendList(session: Session): Promise<RelationEntry[]> {
    return this.relations.list(session.characterId!, [RelationType.FRIEND]);
  }

  @Rpc('getBlackList', { requireCharacter: true })
  getBlackList(session: Session): Promise<RelationEntry[]> {
    return this.relations.list(session.characterId!, [RelationType.BLACK]);
  }

  @Rpc('useIntimacyItem', { requireCharacter: true, forbidInBattle: true })
  async useIntimacyItem(session: Session, args: unknown[]): Promise<UseIntimacyItemReply> {
    const name = normalizeName(args[0]);
    if (!name) throw RpcException.invalidArgs('targetName');
    return this.intimacy.gift(session, name, Number(args[1]), Number(args[2]));
  }
}
