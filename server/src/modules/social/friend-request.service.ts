// Friend request prompt (Go handlers/social/friend_request.go): after A adds B as a friend, an online B gets onBeFriendOfOther
// (alreadyFriend = B holds a friend / couple / tutor / brother row toward A); B answering NO calls refuseToAddFriend and A gets
// onRefusedToAddFriend. A's row stays. Offline targets get nothing; a target who blacklisted A is not bothered.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RelationType, type BeFriendOfOther, type RefusedToAddFriend } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { Relationship } from './relationship.schema';
import { RelationshipService } from './relationship.service';

@Injectable()
export class FriendRequestService {
  constructor(
    @InjectModel(Relationship.name) private readonly rels: Model<Relationship>,
    private readonly relations: RelationshipService,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  /** Pushes onBeFriendOfOther to `targetId` (when online) on behalf of the session character. */
  async notify(session: Session, targetId: number): Promise<void> {
    const requesterId = session.characterId!;
    const target = this.scenes.findByCharacter(targetId);
    if (!target) return;
    const blocked = await this.rels.exists({ characterId: targetId, targetId: requesterId, type: RelationType.BLACK });
    if (blocked) return;
    const requester = await this.characters.getById(requesterId);
    const payload: BeFriendOfOther = {
      id: requesterId,
      otherId: requesterId,
      name: requester.name,
      alreadyFriend: await this.relations.hasBond(targetId, requesterId),
    };
    target.callback('onBeFriendOfOther', payload);
  }

  /** `refuseToAddFriend({targetId, selfName})`: relays only when the requester really holds a friend row toward the refuser. */
  async refuse(session: Session, requesterId: number): Promise<void> {
    const refuserId = session.characterId!;
    if (requesterId === refuserId) return;
    const pending = await this.rels.exists({ characterId: requesterId, targetId: refuserId, type: RelationType.FRIEND });
    if (!pending) return;
    const requester = this.scenes.findByCharacter(requesterId);
    if (!requester) return;
    const refuser = await this.characters.getById(refuserId);
    const payload: RefusedToAddFriend = { id: refuserId, name: refuser.name };
    requester.callback('onRefusedToAddFriend', payload);
  }
}
