// Flying state (M13 phase A, Go movement.go + flight_group.go): beginFlying / stopFlying / fixFlyState. The in-air flag is persisted
// (Character.appearance.flying); the 5 s toggle cooldown is in memory. A party leader's toggle sets every non-AFK member on the map
// (no gates, no cooldown); a follower aligns with the leader through fixFlyState. Pushes: onBeginFlying / onStopFlying {id} to the
// map (self included), onMidNote / onRedMsg for refusals.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FLIGHT_TEXT, type FlyingPush } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { withCharLock } from '../inventory/char-lock';
import { PartyManager } from '../party/party.manager';
import { AppearanceService } from './appearance.service';
import { cooldownRefusal, takeoffRefusal, type FlightRefusal } from './flight-rules';

@Injectable()
export class FlightService {
  private readonly lastToggle = new Map<number, number>();
  now = (): number => Date.now();

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly appearance: AppearanceService,
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
  ) {}

  /** Followers (non-leader members) must not toggle on their own: the leader drives the group. */
  private followerDenied(session: Session): boolean {
    const cid = session.characterId!;
    if (this.parties.canWalk(cid)) return false;
    session.callback('onMidNote', FLIGHT_TEXT.FOLLOW_LEADER);
    return true;
  }

  private refuse(session: Session, r: FlightRefusal): void {
    session.callback(r.kind === 'mid' ? 'onMidNote' : 'onRedMsg', r.text);
  }

  private announce(mapId: number, characterId: number, flying: boolean): void {
    const push: FlyingPush = { id: characterId };
    this.scenes.broadcast(mapId, flying ? 'onBeginFlying' : 'onStopFlying', [push]);
  }

  /** Non-AFK members (leader excluded) of the caller's party standing on its map. */
  private membersOn(session: Session): Session[] {
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    if (!party || party.leaderId !== cid) return [];
    return party.members
      .filter((m) => m !== cid && !party.afk.has(m))
      .map((m) => this.scenes.findByCharacter(m))
      .filter((s): s is Session => s !== undefined && s.mapId === session.mapId);
  }

  private async memberWithoutFlyer(session: Session): Promise<string | null> {
    for (const m of this.membersOn(session)) {
      if (!(await this.appearance.wornFlyer(m.characterId!))) return m.characterName ?? String(m.characterId);
    }
    return null;
  }

  /** Sets the flag of the caller and, for a leader, of its followers on the map; one push per character. */
  private async apply(session: Session, flying: boolean): Promise<void> {
    await this.appearance.setFlying(session.characterId!, flying);
    this.announce(session.mapId, session.characterId!, flying);
    for (const m of this.membersOn(session)) {
      await this.appearance.setFlying(m.characterId!, flying);
      this.announce(m.mapId, m.characterId!, flying);
    }
  }

  begin(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      if (this.followerDenied(session) || (await this.appearance.isFlying(session))) return null;
      const char = await this.chars.findById(cid, { level: 1 }).lean();
      const refusal = takeoffRefusal({
        level: char?.level ?? 1,
        flyerWorn: (await this.appearance.wornFlyer(cid)) !== null,
        mapFlyable: this.appearance.mapFlyable(session.mapId),
        memberWithoutFlyer: await this.memberWithoutFlyer(session),
        now: this.now(),
        lastToggleAt: this.lastToggle.get(cid) ?? 0,
      });
      if (refusal) {
        this.refuse(session, refusal);
        return null;
      }
      this.lastToggle.set(cid, this.now());
      await this.apply(session, true);
      return null;
    });
  }

  stop(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      if (this.followerDenied(session)) return null;
      const char = await this.chars.findById(cid, { appearance: 1 }).lean();
      if (char?.appearance?.flying !== true) return null;
      const refusal = cooldownRefusal(this.now(), this.lastToggle.get(cid) ?? 0);
      if (refusal) {
        this.refuse(session, refusal);
        return null;
      }
      this.lastToggle.set(cid, this.now());
      await this.apply(session, false);
      return null;
    });
  }

  /** fixFlyState: a party follower takes the leader's flying state (no gates). Reply null. */
  fix(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const party = this.parties.partyOf(cid);
      if (!party || party.leaderId === cid) return null;
      const leader = this.scenes.findByCharacter(party.leaderId);
      if (!leader || leader.mapId !== session.mapId) return null;
      const [mine, theirs] = await Promise.all([this.chars.findById(cid, { appearance: 1 }).lean(), this.chars.findById(party.leaderId, { appearance: 1 }).lean()]);
      const target = theirs?.appearance?.flying === true && this.appearance.mapFlyable(session.mapId);
      if ((mine?.appearance?.flying === true) === target) return null;
      await this.appearance.setFlying(cid, target);
      this.announce(session.mapId, cid, target);
      return null;
    });
  }
}
