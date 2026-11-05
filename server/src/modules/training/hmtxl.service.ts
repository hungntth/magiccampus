// Phòng Tu Luyện Ảo Ma public room (Go application/hmtxl service.go): panel payload, enter / end / claim over the training
// document. The claim persists the consumption (session cleared) before the exp and Tinh Hoa Hắc Diệu Thạch are granted. The
// registry of other trainers is in memory like Go (name + icon of the characters that pushed their panel while training).

import { Injectable, Logger } from '@nestjs/common';
import {
  HMTXL, HMTXL_TEXT, hmtCrystalRate, hmtTier, hmtxlExp, type HmtxlData, type HmtxlTrainer,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GrantService, type Grant } from '../rewards/grant.service';
import { awardWaiting, endRoom, enterRoom, takeShares } from './hmtxl-room';
import { refuse } from './training-refusal';
import { TrainingStateService } from './training-state.service';
import { TrainingSupport } from './training-support.service';

export interface HmtxlClaim {
  shares: number;
  exp: number;
  crystal: number;
}

@Injectable()
export class HmtxlService {
  private readonly logger = new Logger(HmtxlService.name);
  private readonly trainers = new Map<number, HmtxlTrainer>();
  /** Percent roll 0..99, replaceable in tests. */
  rand: () => number = () => Math.floor(Math.random() * 100);

  constructor(
    private readonly state: TrainingStateService,
    private readonly support: TrainingSupport,
    private readonly grants: GrantService,
  ) {}

  /** onHMTXLSData payload (also keeps the trainer registry in step with the stored session). */
  async panel(characterId: number): Promise<HmtxlData> {
    const st = await this.state.peek(characterId);
    const now = this.state.now();
    const lev = hmtTier(st.tower.b);
    const data: HmtxlData = { pubdata: { plist: this.others(characterId), plistadv: {}, flagat: 0 }, now };
    if (lev !== undefined) data.lev = lev;
    if (st.hmtxl.st > 0) {
      const me = await this.self(characterId);
      this.trainers.set(characterId, me);
      data.nmldata = { ...me, st: st.hmtxl.st };
    } else this.trainers.delete(characterId);
    if (awardWaiting(st.hmtxl, now)) data.awd = true;
    return data;
  }

  enter(characterId: number): Promise<void> {
    return this.state.locked(characterId, async () => {
      let why: string | null = null;
      const saved = await this.state.mutate(characterId, (st) => {
        why = enterRoom(st.hmtxl, this.state.now());
        return why === null;
      });
      if (why) throw refuse(why);
      if (!saved) throw refuse(HMTXL_TEXT.BUSY);
    });
  }

  end(characterId: number): Promise<number> {
    return this.state.locked(characterId, async () => {
      const box: { out: { shares: number } | string } = { out: HMTXL_TEXT.BUSY };
      const saved = await this.state.mutate(characterId, (st) => {
        box.out = endRoom(st.hmtxl, this.state.now());
        return typeof box.out !== 'string';
      });
      if (typeof box.out === 'string') throw refuse(box.out);
      if (!saved) throw refuse(HMTXL_TEXT.BUSY);
      this.trainers.delete(characterId);
      return box.out.shares;
    });
  }

  claim(session: Session): Promise<HmtxlClaim> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      const level = await this.support.level(cid);
      let shares = 0;
      let best = 0;
      const saved = await this.state.mutate(cid, (st) => {
        shares = takeShares(st.hmtxl, this.state.now());
        best = st.tower.b;
        return true; // Go saves the emptied state even when nothing was owed
      });
      this.trainers.delete(cid);
      if (!saved) throw refuse(HMTXL_TEXT.BUSY);
      if (shares <= 0) throw refuse(HMTXL_TEXT.NO_AWARD);
      const exp = hmtxlExp(level, shares, best);
      const rate = hmtCrystalRate(best);
      let crystal = 0;
      for (let i = 0; i < shares; i++) if (this.rand() < rate) crystal++;
      const grants: Grant[] = [];
      if (exp > 0) grants.push({ kind: 'exp', amount: exp });
      if (crystal > 0) grants.push({ kind: 'currency', key: 'heiyaoshiPoint2', amount: crystal });
      if (grants.length > 0) await this.grants.grant(session, grants);
      this.logger.log(`hmtxl claim ${cid}: shares ${shares}, exp ${exp}, crystal ${crystal}`);
      return { shares, exp, crystal };
    });
  }

  private others(characterId: number): Record<string, HmtxlTrainer> {
    const out: Record<string, HmtxlTrainer> = {};
    let n = 0;
    for (const [id, t] of this.trainers) {
      if (id === characterId || !t.name) continue;
      out[String(++n)] = t;
      if (n >= HMTXL.MAX_LISTED) break;
    }
    return out;
  }

  private async self(characterId: number): Promise<HmtxlTrainer> {
    const cached = this.trainers.get(characterId);
    if (cached) return cached;
    const p = await this.support.profile(characterId);
    return { name: p?.name ?? '', iconCode: p?.iconCode ?? '0' };
  }
}
