// Kết bái team facts (Go handlers/brotherhood teamOnMap + application swear.go buildSwear): who stands in the leader's party and
// on the leader's map, then the swear / join plan from fresh character, group and relationship data. Read-only; the ceremony
// start, the begin re-check and the final step all call it, so every stage judges the same rules.

import { Injectable } from '@nestjs/common';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import { PartyManager } from '../party/party.manager';
import { RelationshipService } from '../social/relationship.service';
import { checkTeamOnMap, planSwear, type PairRow, type Planned, type Presence, type SwearPlan, type TeamMember } from './brother-rules';
import { BrotherhoodStore } from './brotherhood.store';

@Injectable()
export class BrotherTeam {
  constructor(
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
    private readonly relations: RelationshipService,
    private readonly store: BrotherhoodStore,
  ) {}

  /** The caller leads a party whose members are all online on the caller's map: the member ids (leader first). */
  async teamOnMap(callerId: number): Promise<Planned<{ ids: number[] }>> {
    const party = this.parties.partyOf(callerId);
    const members = party?.members ?? [];
    const docs = new Map((await this.characters.findByIds([...members])).map((c) => [c._id, c]));
    const presence: Presence[] = members.map((id) => ({
      id, name: docs.get(id)?.name ?? String(id), mapId: this.scenes.findByCharacter(id)?.mapId ?? null,
    }));
    return checkTeamOnMap(callerId, party ? party.leaderId : null, presence, this.scenes.findByCharacter(callerId)?.mapId ?? 0);
  }

  /** Swear / join plan of the leader's current party (team presence, levels, groups, pair rows, fee against the leader's silver). */
  async swearPlan(leaderId: number): Promise<Planned<{ plan: SwearPlan; leaderName: string }>> {
    const team = await this.teamOnMap(leaderId);
    if (!team.ok) return team;
    const [docs, groupIds] = await Promise.all([this.characters.findByIds(team.ids), this.store.groupIds(team.ids)]);
    const byId = new Map(docs.map((c) => [c._id, c]));
    const members: TeamMember[] = team.ids.map((id) => ({
      id, name: byId.get(id)?.name ?? String(id), level: byId.get(id)?.level ?? 0, groupId: groupIds.get(id) ?? null,
    }));
    const groups = new Map<number, number[]>();
    for (const gid of new Set(groupIds.values())) groups.set(gid, (await this.store.view(gid))?.members.map((m) => m.id) ?? []);
    const leader = byId.get(leaderId);
    const plan = planSwear({
      leaderId, team: members, groups, rows: await this.pairRows(team.ids),
      leaderSilver: (leader?.moneyBind ?? 0) + (leader?.money ?? 0),
    });
    return plan.ok ? { ok: true, plan, leaderName: leader?.name ?? String(leaderId) } : plan;
  }

  /** Every relationship row between the given characters, both directions. */
  private async pairRows(ids: readonly number[]): Promise<PairRow[]> {
    const rows: PairRow[] = [];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const row = await this.relations.get(a, b);
        if (row) rows.push({ a, b, type: row.type });
      }
    }
    return rows;
  }
}
