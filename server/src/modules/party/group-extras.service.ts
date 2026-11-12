// Group leftovers (M14 phase F): groupListOfMap, getGroupMemberPosistion (sic), getCharLeaderClient. reqAddGroup forwards to the
// groupRequest flow of PartyService (a leader still approves); groupReqSuccNotice is a stub in the RPC file.

import { Injectable } from '@nestjs/common';
import type { GroupListReply, GroupListRow, GroupMemberPos } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { PartyManager } from './party.manager';

const MAX_GROUP_ROWS = 50;

@Injectable()
export class GroupExtrasService {
  constructor(
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
  ) {}

  /** Parties whose leader is on `mapId` (Go always answered `[]`). */
  async groupsOfMap(mapId: number): Promise<GroupListReply> {
    const here = this.parties.allParties().filter((p) => this.scenes.findByCharacter(p.leaderId)?.mapId === mapId).slice(0, MAX_GROUP_ROWS);
    const docs = new Map((await this.characters.findByIds(here.map((p) => p.leaderId))).map((d) => [d._id, d]));
    const groups = here.flatMap((p): GroupListRow[] => {
      const d = docs.get(p.leaderId);
      return d ? [{ groupId: p.id, cid: d._id, name: d.name, level: d.level, classId: d.classId, memberNum: p.members.length }] : [];
    });
    return { success: true, groups };
  }

  /** Where a member of the caller's own party stands: the live map and the saved position (legacy pixels; the client shows x/10, y/10). */
  async memberPosition(session: Session, cid: number): Promise<GroupMemberPos> {
    const party = this.parties.partyOf(session.characterId!);
    if (!party || !party.members.includes(cid)) throw RpcException.forbidden('Người này không ở trong nhóm của bạn');
    const doc = await this.characters.getById(cid);
    const map = this.scenes.findByCharacter(cid)?.mapId ?? doc.mapId;
    return { success: true, map, x: Math.round(doc.posX), y: Math.round(doc.posY) };
  }

  /** True when `cid` leads a party (Flash `leaderLoaded(Boolean)`). */
  isLeader(cid: number): boolean {
    return this.parties.isLeader(cid);
  }
}
