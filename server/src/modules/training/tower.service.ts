// Ảo Ma Tháp progress service (Go application/hmtxl tower.go): enter, floor fight gate, win record, advance, leave and the weekly
// reset (999 real gold, taken first, refunded when the state write fails). The rules are pure (tower-rules.ts); this adds the
// level lookup, the per-character lock and the CAS write. Refusals are thrown as TrainingRefusal with the Go text.

import { Injectable } from '@nestjs/common';
import { HMT_TOWER, weekKey } from '@mc/shared';
import type { Session } from '../../gateway/session';
import type { TowerDoc } from './training-doc';
import { refuse } from './training-refusal';
import { TrainingStateService } from './training-state.service';
import { TrainingSupport } from './training-support.service';
import { advanceFloor, applyReset, beginFloorFight, enterTower, recordFloorWin, resetBlocker, TOWER_TEXT } from './tower-rules';

@Injectable()
export class TowerService {
  constructor(
    private readonly state: TrainingStateService,
    private readonly support: TrainingSupport,
  ) {}

  async peek(characterId: number): Promise<TowerDoc> {
    return (await this.state.peek(characterId)).tower;
  }

  /** The floor becomes best + 1 (level 60 needed). */
  enter(characterId: number): Promise<TowerDoc> {
    return this.state.locked(characterId, async () => {
      const level = await this.support.level(characterId);
      let why: string | null = null;
      const saved = await this.state.mutate(characterId, (st) => {
        why = enterTower(st.tower, level);
        return why === null;
      });
      if (why) throw refuse(why);
      if (!saved) throw refuse(TOWER_TEXT.BUSY);
      return saved.tower;
    });
  }

  /** The floor to fight (nothing is written), or a refusal. */
  async beginFight(characterId: number): Promise<number> {
    const out = beginFloorFight(await this.peek(characterId));
    if (typeof out === 'string') throw refuse(out);
    return out;
  }

  /** A won floor battle: `newBest` when the best rose. */
  recordWin(characterId: number, floor: number): Promise<{ best: number; newBest: boolean }> {
    return this.state.locked(characterId, async () => {
      let newBest = false;
      let best = 0;
      await this.state.mutate(characterId, (st) => {
        newBest = recordFloorWin(st.tower, floor);
        best = st.tower.b;
        return newBest;
      });
      return { best, newBest };
    });
  }

  advance(characterId: number): Promise<TowerDoc> {
    return this.state.locked(characterId, async () => {
      let why: string | null = null;
      const saved = await this.state.mutate(characterId, (st) => {
        why = advanceFloor(st.tower);
        return why === null;
      });
      if (why) throw refuse(why);
      if (!saved) throw refuse(TOWER_TEXT.BUSY);
      return saved.tower;
    });
  }

  /** "Lưu và thoát tháp": the floor goes back to 0 (progress kept). */
  leave(characterId: number): Promise<void> {
    return this.state.locked(characterId, async () => {
      await this.state.mutate(characterId, (st) => {
        if (st.tower.f === 0) return false;
        st.tower.f = 0;
        return true;
      });
    });
  }

  /** onResetHMTProgress: once per week, no running training / waiting reward, 999 gold. Returns the success text. */
  reset(session: Session): Promise<string> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      const week = weekKey(this.state.now());
      const cur = await this.state.peek(cid);
      const why = resetBlocker(cur.tower, cur.hmtxl, week);
      if (why) throw refuse(why);
      if ((await this.support.spendGold(session, HMT_TOWER.RESET_GOLD)) === null) throw refuse(TOWER_TEXT.RESET_GOLD);
      const saved = await this.state.mutate(cid, (st) => {
        if (resetBlocker(st.tower, st.hmtxl, week)) return false;
        applyReset(st.tower, week);
        return true;
      });
      if (!saved) {
        await this.support.refundGold(session, HMT_TOWER.RESET_GOLD);
        throw refuse(TOWER_TEXT.BUSY);
      }
      return TOWER_TEXT.RESET_DONE;
    });
  }
}
