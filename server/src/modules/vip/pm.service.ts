// VIP / PM service: initPmData, buyPm (spend gold first, then write the membership), the lazy daily login exp + findback audit and
// doPmOperation (claim progress is marked with a compare-and-set on `rev` BEFORE the reward is applied; plan decision 4).

import { Injectable } from '@nestjs/common';
import {
  DAY_MS, PM_PACKAGES, PmRight, dayKey, nextDayStartMs, pmLevelOf,
  type BuyPmReply, type FlushProcessFlagPush, type InitPmDataReply, type PmData, type PmPackageType, type PmProcessFlag,
  type VipLogin,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { PmRewardService } from './pm-reward.service';
import {
  MSG_ALREADY, MSG_EXPIRED, MSG_UNSUPPORTED, auditRollover, auditableRights, buyPackage, claimError, claimedNow, dailyLoginExp,
  nextProgress, rewardOf, type PmReward,
} from './pm-rules';
import { PmStateService, type VipDoc } from './pm-state.service';

const RETRIES = 4;
const BUSY = 'Hệ thống bận, vui lòng thử lại';

export const pmDataOf = (d: VipDoc): PmData => ({
  pmExp: d.pmExp,
  activeType: d.vipType,
  keepDay: d.startedAt > 0 ? Math.max(0, (d.expiresAt - d.startedAt) / DAY_MS) : 0,
  activeTime: d.startedAt,
});

@Injectable()
export class PmService {
  constructor(
    private readonly state: PmStateService,
    private readonly characters: CharacterService,
    private readonly rewards: PmRewardService,
    private readonly scenes: SceneManager,
  ) {}

  /** The document with today's findback audit applied (once per day). */
  private async fresh(characterId: number, now: number): Promise<VipDoc> {
    const rights = await this.state.rights();
    let doc = await this.state.load(characterId);
    for (let i = 0; i < RETRIES; i++) {
      const patch = auditRollover(doc, now, auditableRights(rights, pmLevelOf(doc, now)));
      if (!patch) return doc;
      const next = await this.state.update(characterId, doc.rev, patch);
      if (next) return next;
      doc = await this.state.load(characterId);
    }
    return doc;
  }

  /** Login payload fields; today's first login of an active member also pays the daily PM exp. */
  async loginFields(characterId: number): Promise<VipLogin> {
    const now = Date.now();
    if (!(await this.state.peek(characterId))) return { pmLevel: 0, vipInfo: { pmExp: 0, activeType: 0, keepDay: 0, activeTime: 0 } };
    let doc = await this.fresh(characterId, now);
    for (let i = 0; i < RETRIES; i++) {
      const due = dailyLoginExp(doc, now);
      if (!due) break;
      const next = await this.state.update(characterId, doc.rev, { pmExp: doc.pmExp + due.amount, dailyExpDay: due.day });
      if (next) {
        doc = next;
        break;
      }
      doc = await this.state.load(characterId);
    }
    return { pmLevel: pmLevelOf(doc, now), vipInfo: pmDataOf(doc) };
  }

  async initData(characterId: number): Promise<InitPmDataReply> {
    const now = Date.now();
    const doc = await this.fresh(characterId, now);
    const level = pmLevelOf(doc, now);
    await this.state.rights();
    const processFlag: Record<string, PmProcessFlag> = {};
    for (const [id, p] of Object.entries(doc.process)) {
      if (claimedNow(p, this.state.configOf(Number(id)), now) > 0) processFlag[id] = p; // earlier cycles are not shown as claimed
    }
    return { flag: level, date: now, findback: level > 0 && doc.findback, processFlag, data: pmDataOf(doc) };
  }

  /** buyPm(type): the gold is spent first (conditional $inc), then the membership is written; a failed write refunds. */
  async buy(session: Session, type: PmPackageType): Promise<BuyPmReply> {
    const cid = session.characterId!;
    const now = Date.now();
    let doc = await this.state.load(cid);
    const first = buyPackage(doc, type, now);
    if ('error' in first) throw RpcException.forbidden(first.error);
    const total = await this.characters.spendMoney(cid, 'gold', first.cost);
    if (total === null) throw RpcException.invalidArgs('Không đủ vàng');
    let saved: VipDoc | null = null;
    try {
      for (let i = 0; i < RETRIES && !saved; i++) {
        const plan = buyPackage(doc, type, now);
        if ('error' in plan) throw RpcException.forbidden(plan.error);
        saved = await this.state.update(cid, doc.rev, plan.patch);
        if (!saved) doc = await this.state.load(cid);
      }
      if (!saved) throw RpcException.invalidArgs(BUSY);
    } catch (e) {
      await this.characters.addMoney(cid, 'gold', first.cost);
      throw e;
    }
    const level = pmLevelOf(saved, now);
    session.callback('onUPP', { gold: total, pmLevel: level });
    session.callback('onBlueMsg', `Mua ${PM_PACKAGES[type].name} thành công! Mất ${first.cost} Vàng.`);
    this.scenes.broadcast(session.mapId, 'updateScenePmLevel', [{ cid, pmLevel: level }]);
    return { level, data: pmDataOf(saved) };
  }

  /** doPmOperation(rightId): validates, marks the claim (CAS), then pays. Progress is returned by the flushProcesFlag push. */
  async claim(session: Session, rightId: number): Promise<void> {
    const cid = session.characterId!;
    const rights = await this.state.rights();
    const right = rights.find((r) => r.id === rightId);
    for (let i = 0; i < RETRIES; i++) {
      const now = Date.now();
      const doc = await this.fresh(cid, now);
      const level = pmLevelOf(doc, now);
      const err = claimError(right, level);
      if (err || !right) throw RpcException.forbidden(err ?? MSG_EXPIRED);
      if (right.id === PmRight.FINDBACK) {
        if (await this.claimFindback(session, doc, level, now)) return;
        continue;
      }
      const reward = rewardOf(right, level, {
        charLevel: await this.rewards.levelOf(cid), characterId: cid, now, transformPool: await this.state.transformPool(),
      });
      if (!reward) throw RpcException.forbidden(MSG_UNSUPPORTED);
      await this.rewards.precheck(cid, [reward]);
      const progress = nextProgress(doc.process[String(right.id)], this.state.configOf(right.id), right.type, now);
      if (!progress) throw RpcException.forbidden(MSG_ALREADY);
      const patch: Record<string, unknown> = { [`process.${right.id}`]: progress };
      if (reward.kind === 'transform') patch.transform = { resCode: reward.resCode, expiresAt: nextDayStartMs(now) };
      if (!(await this.state.update(cid, doc.rev, patch))) continue; // moved concurrently: re-read and retry
      await this.rewards.apply(session, reward);
      if (reward.kind === 'transform') this.scenes.broadcast(session.mapId, 'onSetRes', [{ id: cid, res: reward.resCode }], session);
      session.callback('flushProcesFlag', { index: right.id, ...progress } satisfies FlushProcessFlagPush);
      return;
    }
    throw RpcException.invalidArgs(BUSY);
  }

  /** Right 24: pays the rights missed yesterday (the flag is consumed first). False when the document moved (caller retries). */
  private async claimFindback(session: Session, doc: VipDoc, level: number, now: number): Promise<boolean> {
    if (!doc.findback) throw RpcException.forbidden(MSG_EXPIRED);
    const cid = session.characterId!;
    const rights = await this.state.rights();
    const charLevel = await this.rewards.levelOf(cid);
    const pay: PmReward[] = [];
    for (const id of doc.missed) {
      const right = rights.find((r) => r.id === id);
      const reward = right ? rewardOf(right, level, { charLevel, characterId: cid, now, transformPool: [] }) : null;
      if (reward) pay.push(reward);
    }
    await this.rewards.precheck(cid, pay);
    if (!(await this.state.update(cid, doc.rev, { findback: false, missed: [] }))) return false;
    for (const reward of pay) await this.rewards.apply(session, reward);
    const push: FlushProcessFlagPush = { index: PmRight.FINDBACK, day: dayKey(now), type: 4, time: 1 };
    session.callback('flushProcesFlag', push);
    return true;
  }

  /** Active membership check for gates (the VIP shop). */
  async levelOf(characterId: number): Promise<number> {
    return this.state.levelOf(characterId);
  }

}
