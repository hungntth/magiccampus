// Medal service (M13 phase E2): info, move / equip, arrange, level up, dissolve and the grant entry point for future medal sources. State = feature
// `medal`. Every mutation runs under withCharLock: validate (pure plan) -> persist -> pushes (stat refresh for worn slots, pet refresh for pet slots).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MEDAL_RARE_REPLY, MEDAL_TEXT, type MedalBagMap, type MedalCatalog, type MedalEntry, type MedalInfo, type MedalOpPush, type MedalRow } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { addMedal, arrangeBag, isError, planBreak, planMove, planUp, refreshEngrave, type MedalLook, type PlanError } from './medal-rules';
import { MedalPetService } from './medal-pets.service';
import { MEDAL_FEATURE_KEY, bagMap, encodeMedal, medalInfo, parseMedal, type MedalState } from './medal-state';

function must<T>(plan: T | PlanError): T {
  if (isError(plan)) throw RpcException.forbidden(plan.error);
  return plan;
}

@Injectable()
export class MedalService {
  private nextIndex: Map<string, MedalRow> | null = null;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
    private readonly pets: MedalPetService,
  ) {}

  private async look(characterId: number): Promise<MedalLook> {
    if (!this.nextIndex) this.nextIndex = new Map(this.gameData.medals().filter((m) => m.sid !== 1006 && m.sid !== 2006).map((m) => [`${m.basic}:${m.level}`, m]));
    const index = this.nextIndex;
    const level = (await this.chars.findById(characterId, { level: 1 }).lean())?.level ?? 1;
    return {
      row: (id) => this.gameData.medal(id),
      next: (r) => index.get(`${r.basic}:${r.level + 1}`),
      lines: this.gameData.medalLines(),
      level,
    };
  }

  private load(characterId: number): Promise<MedalState> {
    return this.store.get(characterId, MEDAL_FEATURE_KEY, {}).then(parseMedal);
  }

  private save(characterId: number, state: MedalState): Promise<void> {
    return this.store.put(characterId, MEDAL_FEATURE_KEY, encodeMedal(state));
  }

  catalog(): MedalCatalog {
    return { medals: this.gameData.medals() };
  }

  /** getMedalInfo: the stored engrave lines are refreshed when the worn slots no longer match them (Go GetInfo). */
  info(characterId: number): Promise<MedalInfo> {
    return withCharLock(characterId, async () => {
      const state = await this.load(characterId);
      if (refreshEngrave(state, await this.look(characterId))) await this.save(characterId, state);
      return medalInfo(state);
    });
  }

  private async pushStats(session: Session): Promise<void> {
    for (const u of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', u);
  }

  /** moveMedal(fromSid, toSid): bag <-> bag, bag -> worn, worn -> bag. */
  move(session: Session, from: number, to: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planMove(await this.load(cid), from, to, await this.look(cid)));
      await this.save(cid, plan.state);
      session.callback('onMoveMedal', plan.push);
      if (plan.charTouched) await this.pushStats(session);
      if (plan.petTouched) await this.pets.refresh(cid);
      return null;
    });
  }

  arrange(session: Session): Promise<MedalBagMap> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const next = arrangeBag(await this.load(cid));
      await this.save(cid, next);
      return bagMap(next);
    });
  }

  /** upMedal(index): the reply carries the same payload as the onUpMedal push. */
  up(session: Session, index: number): Promise<MedalOpPush> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planUp(await this.load(cid), index, await this.look(cid)));
      await this.save(cid, plan.state);
      session.callback('onUpMedal', plan.push);
      return plan.push;
    });
  }

  /** breakMedal(index, count, breakType): a rare medal answers the literal "ban" (the client shows MEDAL_P[55]). */
  breakMedal(session: Session, index: number, count: number): Promise<MedalOpPush | typeof MEDAL_RARE_REPLY> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planBreak(await this.load(cid), index, count, await this.look(cid)));
      if ('rare' in plan && plan.rare) {
        session.callback('onSystemMidMsgOrNote', MEDAL_TEXT.RARE);
        return MEDAL_RARE_REPLY;
      }
      if (!('state' in plan)) throw RpcException.forbidden(MEDAL_TEXT.BAD_MOVE);
      await this.save(cid, plan.state);
      session.callback('onBreakMedal', plan.push);
      return plan.push;
    });
  }

  /** Grant entry point for future sources (rewards, bosses): adds the stack and pushes updateMedalInBag. The row id must exist and not be an engrave line. */
  grant(session: Session, tid: number, n: number): Promise<MedalEntry> {
    const cid = session.characterId!;
    const row = this.gameData.medal(tid);
    if (!row || row.sid === 1006 || row.sid === 2006) throw RpcException.notFound(`medal ${tid} not found`);
    return withCharLock(cid, async () => {
      const res = must(addMedal(await this.load(cid), tid, n));
      await this.save(cid, res.state);
      const entry: MedalEntry = { i: res.slot, t: tid, n: res.state.bag[res.slot]!.n };
      session.callback('updateMedalInBag', entry);
      return entry;
    });
  }
}
