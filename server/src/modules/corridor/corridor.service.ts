// Hành Lang Vô Tận service (Go application/corridor service.go): progress read, entering a floor, advancing, attack validation,
// victory crediting and the daily Điểm Dũng Khí claim over the corridor sub-object of character_towers (rev CAS, per-character lock).
// Spend before credit: the claim day is persisted first, then the courage points are credited (a lost write pays nothing).

import { Injectable } from '@nestjs/common';
import { corridorMap, dayKey } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CurrencyService } from '../progression/currency.service';
import { TowersStateService } from '../towers/towers-state.service';
import {
  advanceVerdict, claimVerdict, floorRefusal, openCorridorState, recordVictory, type OpenState, type VictoryOutcome,
} from './corridor-rules';
import { CORRIDOR_TEXT } from './corridor-text';

export type FloorMove = { ok: true; floor: number; map: number } | { ok: false; text: string };

@Injectable()
export class CorridorService {
  /** Clock, replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly towers: TowersStateService,
    private readonly currencies: CurrencyService,
  ) {}

  async state(cid: number): Promise<OpenState> {
    return openCorridorState((await this.towers.open(cid)).corridor);
  }

  /** Why `cid` cannot enter / fight `floor` (1..cleared + 1), or null. */
  async floorRefusal(cid: number, floor: number): Promise<string | null> {
    return floorRefusal(await this.state(cid), floor);
  }

  /** Go Enter: saves the current floor. */
  enter(cid: number, floor: number): Promise<FloorMove> {
    return this.towers.locked(cid, async () => {
      const s = await this.state(cid);
      const why = floorRefusal(s, floor);
      if (why) return { ok: false, text: why };
      const saved = await this.towers.mutate(cid, (doc) => {
        const cur = openCorridorState(doc.corridor);
        if (floorRefusal(cur, floor)) return false;
        cur.curFloor = floor;
        doc.corridor = cur;
        return true;
      });
      return saved ? { ok: true, floor, map: corridorMap(floor) } : { ok: false, text: CORRIDOR_TEXT.ERROR };
    });
  }

  /** Go Advance from the floor on `mapId`: only a cleared floor below the top moves on. */
  advance(cid: number, mapId: number, notClearedText?: string): Promise<FloorMove> {
    return this.towers.locked(cid, async () => {
      const v = advanceVerdict(await this.state(cid), mapId, notClearedText);
      if (!v.ok) return v;
      const saved = await this.towers.mutate(cid, (doc) => {
        const cur = openCorridorState(doc.corridor);
        cur.curFloor = v.floor;
        doc.corridor = cur;
        return true;
      });
      return saved ? { ok: true, floor: v.floor, map: corridorMap(v.floor) } : { ok: false, text: CORRIDOR_TEXT.ERROR };
    });
  }

  /** Go RecordVictory under the character lock; `credited` is false when the write was skipped or lost. */
  record(cid: number, floor: number): Promise<VictoryOutcome> {
    return this.towers.locked(cid, async () => {
      let out: VictoryOutcome = { credited: false, firstKill: false };
      const saved = await this.towers.mutate(cid, (doc) => {
        const s = openCorridorState(doc.corridor);
        out = recordVictory(s, floor);
        if (!out.credited) return false;
        doc.corridor = s;
        return true;
      });
      return saved ? out : { credited: false, firstKill: false };
    });
  }

  /** "Nhận thưởng hằng ngày": the NPC text (refusal or success); credits couragePoint after the claim day is saved. */
  claimDaily(session: Session): Promise<string> {
    const cid = session.characterId!;
    return this.towers.locked(cid, async () => {
      const today = dayKey(this.now());
      const v = claimVerdict(await this.state(cid), today);
      if (!v.ok) return v.text;
      const claim: { floor: number; points: number }[] = [];
      const saved = await this.towers.mutate(cid, (doc) => {
        const s = openCorridorState(doc.corridor);
        const again = claimVerdict(s, today);
        if (!again.ok) return false;
        claim.push({ floor: again.floor, points: again.points });
        s.claimedCycle = today;
        doc.corridor = s;
        return true;
      });
      if (!saved || claim.length === 0) return CORRIDOR_TEXT.CLAIMED;
      const { floor, points } = claim[claim.length - 1];
      const total = await this.currencies.credit(cid, 'couragePoint', points);
      session.callback('onAddMoney', cid, 'couragePoint', points, total);
      await this.currencies.push(session);
      return CORRIDOR_TEXT.CLAIM_OK(floor, points);
    });
  }
}
