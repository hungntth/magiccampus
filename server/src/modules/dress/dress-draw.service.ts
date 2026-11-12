// Tủ Đồ draws (Rút Bộ), chip merging and Chuyển Bộ transform. Order of every paid action: validate (pure plan) -> spend (conditional
// gold / Điểm Thời Thượng) -> save -> refund on a failed write -> pushes -> rare-set announcement. Weights live in dress-draw.ts.

import { Injectable } from '@nestjs/common';
import {
  DRESS_GOLD_COST, DRESS_LARGE_SSD_COST, DRESS_SERVER_TEXT as T, DRESS_SSD_COST, DRESS_TEN_COST,
  type DressDrawResult, type DressInfo, type DressTenResult, type DressTransformAllResult,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import type { Rng } from '../forge/craft-rules';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { buildPools, type Pools } from './dress-draw';
import { DRAWS, groupDrops, mergeChips, planDraw, planTransform, type DrawSpec } from './dress-rules';
import { publicInfo, type DressState } from './dress-state';
import { DressStateService } from './dress-state.service';

const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

type Funding = { kind: 'free' } | { kind: 'gold'; cost: number } | { kind: 'ssd'; cost: number };

@Injectable()
export class DressDrawService {
  /** Replaceable in tests. */
  rng: Rng = Math.random;

  constructor(
    private readonly state: DressStateService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly scenes: SceneManager,
  ) {}

  private pools(): Pools {
    return buildPools(this.gameData.dressRows(), this.gameData.recipeRows());
  }

  /** Spends the funding (null = short) and returns the refund closure. */
  private async spend(session: Session, f: Funding): Promise<{ refund: () => Promise<void>; push: () => Promise<void> } | null> {
    const cid = session.characterId!;
    if (f.kind === 'free') return { refund: async () => undefined, push: async () => undefined };
    if (f.kind === 'gold') {
      const left = await this.characters.spendMoney(cid, 'gold', f.cost);
      if (left === null) return null;
      return { refund: async () => void (await this.characters.addMoney(cid, 'gold', f.cost)), push: async () => session.callback('onUPP', { gold: left }) };
    }
    if ((await this.currencies.spend(cid, 'shishangdian', f.cost)) === null) return null;
    return {
      refund: async () => void (await this.currencies.credit(cid, 'shishangdian', f.cost)),
      push: async () => {
        await this.currencies.push(session);
        session.callback('onSystemMidMsgOrNote', T.SPENT_SSD(f.cost));
      },
    };
  }

  /** Shared draw pipeline; returns the rolled recipe ids and the saved state. */
  private draw(session: Session, spec: DrawSpec, funding: Funding): Promise<{ rolls: number[]; state: DressState }> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = planDraw(await this.state.load(cid), this.pools(), spec, this.rng);
      if (!plan.ok) return refuse(plan.note);
      const paid = await this.spend(session, funding);
      if (!paid) return refuse(funding.kind === 'ssd' ? T.NO_SSD : T.NO_GOLD);
      try {
        await this.state.save(cid, plan.state);
      } catch (e) {
        await paid.refund();
        throw e;
      }
      await paid.push();
      void this.announce(cid, spec.withSet ? [plan.rolls[plan.rolls.length - 1]] : []);
      return { rolls: plan.rolls, state: plan.state };
    });
  }

  private async single(session: Session, spec: DrawSpec, funding: Funding): Promise<DressDrawResult> {
    const r = await this.draw(session, spec, funding);
    return { dressInfo: publicInfo(r.state), recipeId: r.rolls[0], recipeNum: 1 };
  }

  private async ten(session: Session, spec: DrawSpec, funding: Funding): Promise<DressTenResult> {
    const r = await this.draw(session, spec, funding);
    return { dressInfo: publicInfo(r.state), planArr: r.rolls.map((recipeId) => ({ recipeId, num: 1 })) };
  }

  freeExtract(session: Session): Promise<DressDrawResult> {
    return this.single(session, DRAWS.free, { kind: 'free' });
  }

  goldExtract(session: Session): Promise<DressDrawResult> {
    return this.single(session, DRAWS.gold, { kind: 'gold', cost: DRESS_GOLD_COST });
  }

  ssdExtract(session: Session): Promise<DressDrawResult> {
    return this.single(session, DRAWS.ssd, { kind: 'ssd', cost: DRESS_SSD_COST });
  }

  tenExtract(session: Session): Promise<DressTenResult> {
    return this.ten(session, DRAWS.ten, { kind: 'gold', cost: DRESS_TEN_COST });
  }

  largeSsdExtract(session: Session): Promise<DressTenResult> {
    return this.ten(session, DRAWS.largeSsd, { kind: 'ssd', cost: DRESS_LARGE_SSD_COST });
  }

  /** makeAllChips: every full stack of chips becomes its set; "Ghép thành công" when at least one merged. */
  makeAllChips(session: Session): Promise<DressInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const r = mergeChips(await this.state.load(cid), (id) => this.gameData.recipeRow(id));
      if (r.merged > 0) {
        await this.state.save(cid, r.state);
        session.callback('onMidNote', T.MERGED);
      }
      return publicInfo(r.state);
    });
  }

  private transform(session: Session, ids: readonly number[], all: boolean, picked?: readonly number[]): Promise<{ produced: number[]; state: DressState }> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = planTransform(await this.state.load(cid), ids, (id) => this.gameData.recipeRow(id), this.pools(), this.rng, { all, picked });
      if (!plan.ok) return refuse(plan.note);
      await this.state.save(cid, plan.state);
      void this.announce(cid, plan.produced);
      return { produced: plan.produced, state: plan.state };
    });
  }

  async transformOne(session: Session, ids: readonly number[]): Promise<DressDrawResult> {
    const r = await this.transform(session, ids, false);
    return { dressInfo: publicInfo(r.state), recipeId: r.produced[0], recipeNum: 1 };
  }

  async transformAll(session: Session, ids: readonly number[], picked: readonly number[]): Promise<DressTransformAllResult> {
    const r = await this.transform(session, ids, true, picked);
    return { dressInfo: publicInfo(r.state), produceArr: groupDrops(r.produced) };
  }

  /** Rare sets (announced) among `recipeIds` -> one system line each for everybody online. Chips never announce. */
  private async announce(characterId: number, recipeIds: readonly number[]): Promise<void> {
    try {
      const pools = this.pools();
      const rare = recipeIds.filter((id) => pools.rareSets.has(id));
      if (rare.length === 0) return;
      const name = (await this.characters.getById(characterId)).name;
      for (const id of rare) this.scenes.broadcastAll('onSystemSay', [T.RARE_SET(name, this.gameData.recipeRow(id)?.name ?? `#${id}`)]);
    } catch {
      // an announcement never fails the draw
    }
  }
}
