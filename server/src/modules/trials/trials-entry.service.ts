// Vùng Đất Rèn Luyện run entry / exit (Go handlers/trials run.go + party.go): trialsStart takes one entry per member (leader plus its
// non-AFK party, every member must pass the checks, a new entry needs 2+ people), moves everyone to the floor map and pushes the entry
// notice / counters / timer; leaving (trialsOut, trials_out) closes the leader's and its followers' runs and sends each to its own return
// point; eject is the sweeper's / timer's move out. The minimap timer follows map changes (onUpdateTrialsLifeAndTime).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { TRIALS, TRIALS_MAPS, TRIALS_NO_RUN, TRIALS_TEXT, trialsFloor, type TrialsLifeTime } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { notice, systemSay } from '../npcscript/menu';
import { PartyManager } from '../party/party.manager';
import { SceneHooks } from '../scene/scene-hooks.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import type { TrialsReturn } from '../towers/towers.schema';
import { isTrialsMapId, timerPayload } from './trials-rules';
import { failText, TrialsService } from './trials.service';

interface Member {
  cid: number;
  session: Session;
  name: string;
}

@Injectable()
export class TrialsEntryService implements OnModuleInit {
  constructor(
    private readonly trials: TrialsService,
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly transport: SceneTransportService,
    private readonly hooks: SceneHooks,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
  ) {}

  onModuleInit(): void {
    // The minimap timer: shown on entering a floor map with a live run, hidden on leaving the floor maps (Flash GameScene hides it).
    this.hooks.onMapChanged('trials-timer', async (session, from, to) => {
      const cid = session.characterId;
      if (!cid) return;
      if (TRIALS_MAPS.includes(to)) {
        const run = await this.trials.activeRun(cid);
        if (run && trialsFloor(run.f)?.map === to) session.callback('onUpdateTrialsLifeAndTime', timerPayload(run, this.trials.now()));
      } else if (TRIALS_MAPS.includes(from)) {
        session.callback('onUpdateTrialsLifeAndTime', TRIALS_NO_RUN);
      }
    });
  }

  /** trialsTimerAward. */
  async timer(cid: number): Promise<TrialsLifeTime> {
    const run = await this.trials.activeRun(cid);
    return run ? timerPayload(run, this.trials.now()) : TRIALS_NO_RUN;
  }

  /** Online, non-AFK party members of a leader (not the leader). */
  private partyOthers(session: Session): number[] {
    const party = this.parties.partyOf(session.characterId!);
    return party && party.leaderId === session.characterId ? party.members.filter((m) => m !== session.characterId && !party.afk.has(m)) : [];
  }

  private async nameOf(cid: number): Promise<string> {
    try {
      return (await this.characters.getById(cid)).name;
    } catch {
      return String(cid);
    }
  }

  /** The place the trainer sends the character back to: its stored position, the map it stands on when that differs. */
  private async returnPoint(session: Session): Promise<TrialsReturn> {
    let ret: TrialsReturn = { m: session.mapId, x: 0, y: 0 };
    try {
      const doc = await this.characters.getById(session.characterId!);
      if (doc.mapId === session.mapId) ret = { m: doc.mapId, x: doc.posX, y: doc.posY };
    } catch {
      /* the session map alone is enough */
    }
    return ret;
  }

  /** Go moveTo: (x, y) <= 0 means the map's safe point; the session gets its own onSceneEnter. */
  async teleport(session: Session, mapId: number, x: number, y: number, follow: boolean): Promise<boolean> {
    const map = this.gameData.getMap(mapId);
    if (!map) return false;
    const px = x > 0 && y > 0 ? x : Number(map.safe_x ?? 0);
    const py = x > 0 && y > 0 ? y : Number(map.safe_y ?? 0);
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, px, py, follow));
    return true;
  }

  /** trialsStart(floor). Every refusal is an onSystemSay (the Flash panel has no error path). */
  async enter(session: Session, floor: number): Promise<void> {
    const def = trialsFloor(floor);
    const cid = session.characterId!;
    if (!def) return systemSay(session, TRIALS_TEXT.LOCKED);
    const why = await this.trials.refusal(cid, floor);
    if (why) return systemSay(session, why);
    const ready = await this.checkParty(session, floor);
    if (!ready) return;
    if (1 + ready.length < TRIALS.MIN_PARTY && (await this.trials.activeRun(cid))?.f !== floor) {
      return systemSay(session, TRIALS_TEXT.PARTY_SIZE(TRIALS.MIN_PARTY));
    }
    const mine = await this.trials.start(cid, floor, await this.returnPoint(session));
    if (!mine.ok) return systemSay(session, failText(mine.why));
    const entered: { m: Member; used: number; run: typeof mine.run; resumed: boolean }[] = [];
    for (const m of ready) {
      const r = await this.trials.start(m.cid, floor, await this.returnPoint(m.session));
      if (!r.ok) {
        systemSay(session, TRIALS_TEXT.MEMBER_BLOCKED(m.name, floor, failText(r.why)));
        systemSay(m.session, TRIALS_TEXT.PARTY_BLOCKED(floor, failText(r.why)));
        continue;
      }
      entered.push({ m, used: r.used, run: r.run, resumed: r.resumed });
    }
    if (!(await this.moveAll(session, def.map, entered.map((e) => e.m)))) {
      for (const e of entered) if (!e.resumed) await this.trials.abort(e.m.cid);
      if (!mine.resumed) await this.trials.abort(cid);
      for (const e of entered) systemSay(e.m.session, TRIALS_TEXT.ENTER_FAILED);
      return systemSay(session, TRIALS_TEXT.ENTER_FAILED);
    }
    const announce = (s: Session, used: number, lives: number, run: typeof mine.run): void => {
      s.callback('onUpdateTrialsCharData', { n: used });
      systemSay(s, TRIALS_TEXT.ENTERED(floor, def.name, def.minutes, lives));
      s.callback('onUpdateTrialsLifeAndTime', timerPayload(run, this.trials.now()));
    };
    announce(session, mine.used, mine.run.lv, mine.run);
    for (const e of entered) announce(e.m.session, e.used, e.run.lv, e.run);
  }

  /** Leader checked first by the caller; every online non-AFK member must pass (one failing blocks all). Null = blocked. */
  private async checkParty(session: Session, floor: number): Promise<Member[] | null> {
    const ready: Member[] = [];
    let blocked = false;
    for (const mid of this.partyOthers(session)) {
      const s = this.scenes.findByCharacter(mid);
      if (!s) continue;
      const name = await this.nameOf(mid);
      if (s.battleId !== null) {
        systemSay(session, TRIALS_TEXT.MEMBER_IN_BATTLE(name));
        continue;
      }
      const why = await this.trials.refusal(mid, floor);
      if (why) {
        systemSay(session, TRIALS_TEXT.MEMBER_BLOCKED(name, floor, why));
        systemSay(s, TRIALS_TEXT.PARTY_BLOCKED(floor, why));
        blocked = true;
        continue;
      }
      ready.push({ cid: mid, session: s, name });
    }
    return blocked ? null : ready;
  }

  /** The leader moves (its same-map followers come along), the others that did not are moved one by one. */
  private async moveAll(leader: Session, mapId: number, members: Member[]): Promise<boolean> {
    try {
      if (!(await this.teleport(leader, mapId, 0, 0, true))) return false;
      for (const m of members) if (m.session.mapId !== mapId && !(await this.teleport(m.session, mapId, 0, 0, false))) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** trialsOut / trials_out: closes the run (and the followers' ones) and goes back to the return point. */
  async leave(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (session.battleId !== null) return systemSay(session, TRIALS_TEXT.IN_BATTLE);
    const followers = this.partyOthers(session)
      .map((m) => this.scenes.findByCharacter(m))
      .filter((s): s is Session => s !== undefined && TRIALS_MAPS.includes(s.mapId) && s.battleId === null);
    const ret = await this.trials.leave(cid);
    const back = await Promise.all(followers.map(async (s) => ({ s, ret: await this.trials.leave(s.characterId!) })));
    if (isTrialsMapId(session.mapId)) await this.teleport(session, ret.m, ret.x, ret.y, false);
    for (const f of back) if (isTrialsMapId(f.s.mapId)) await this.teleport(f.s, f.ret.m, f.ret.x, f.ret.y, false);
  }

  /** Timer / sweeper: closes the run and moves the character out with a notice. */
  async eject(session: Session, expired: boolean): Promise<void> {
    const ret = await this.trials.leave(session.characterId!);
    await this.teleport(session, ret.m, ret.x, ret.y, false);
    notice(session, expired ? TRIALS_TEXT.EJECT_EXPIRED : TRIALS_TEXT.EJECT_NO_RUN);
  }
}
