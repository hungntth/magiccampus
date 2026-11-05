// Kiếp Nạn Vô Ưu service (Go application/nineboss service.go): the panel, floor attack refusals, victory crediting and the daily claim
// over the nineboss sub-object of character_towers (rev CAS, per-character lock). Spend before credit: the direct claim takes its 20
// real gold first and refunds it when the state write is lost; the claim day is persisted before the items are granted.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { NINE_BOSS, NINE_BOSS_TEXT, nineDailyReward, type NineFloorPanel } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { DiaryEvents } from '../activity/diary-events.service';
import { Character } from '../character/character.schema';
import { systemSay } from '../npcscript/menu';
import { GrantService, type Grant } from '../rewards/grant.service';
import { TowersStateService } from '../towers/towers-state.service';
import { attackRefusal, claimVerdict, nineCycle, ninePanel, openNineState, recordVictory, type VictoryOutcome } from './nineboss-rules';

const ITEM_TABLE = 29;

/** Items of a floor reward (always bound). */
export function nineGrants(r: { linhVu: number; longVu: number }): Grant[] {
  return [
    { kind: 'item', table: ITEM_TABLE, templateId: NINE_BOSS.ITEM_WING_EVOLVE, qty: r.linhVu, bound: true },
    { kind: 'item', table: ITEM_TABLE, templateId: NINE_BOSS.ITEM_WING_DYE, qty: r.longVu, bound: true },
  ];
}

@Injectable()
export class NineBossService {
  /** Clock, replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly towers: TowersStateService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly grants: GrantService,
    private readonly diary: DiaryEvents,
  ) {}

  /** initNineFloorPanel / the refreshed panel after a claim. */
  async panel(cid: number): Promise<NineFloorPanel> {
    const today = nineCycle(this.now());
    return ninePanel(openNineState((await this.towers.open(cid)).nineboss, today), today);
  }

  /** Why `cid` cannot fight `floor` now (level 130, floor <= max + 1), or null. */
  async attackRefusal(cid: number, floor: number): Promise<string | null> {
    const level = (await this.chars.findById(cid, { level: 1 }).lean())?.level ?? 0;
    const doc = await this.towers.open(cid);
    return attackRefusal(level, doc.nineboss.maxFloor ?? 0, floor);
  }

  /** Go RecordVictory under the character lock; `credited` is false when the write was skipped or lost. */
  record(cid: number, floor: number): Promise<VictoryOutcome> {
    return this.towers.locked(cid, async () => {
      const today = nineCycle(this.now());
      let out: VictoryOutcome = { credited: false, firstKill: false };
      const saved = await this.towers.mutate(cid, (doc) => {
        const s = openNineState(doc.nineboss, today);
        out = recordVictory(s, floor);
        if (!out.credited) return false;
        doc.nineboss = s;
        return true;
      });
      return saved ? out : { credited: false, firstKill: false };
    });
  }

  /** getNineBossAward(floorId, type): `(10, 1)` = direct (20 gold, max floor), anything else = free (highest floor today). Always returns the panel. */
  async claim(session: Session, floorId: number, type: number): Promise<NineFloorPanel> {
    const cid = session.characterId!;
    const direct = floorId === NINE_BOSS.DIRECT_FLOOR_ID || type === NINE_BOSS.DIRECT_TYPE;
    const text = await this.towers.locked(cid, () => this.doClaim(session, direct));
    if (text) systemSay(session, text);
    return this.panel(cid);
  }

  private async doClaim(session: Session, direct: boolean): Promise<string | null> {
    const cid = session.characterId!;
    const today = nineCycle(this.now());
    const verdict = claimVerdict(openNineState((await this.towers.open(cid)).nineboss, today), today, direct);
    if (!verdict.ok) return verdict.text;
    const items = nineGrants(nineDailyReward(verdict.floor));
    if (!(await this.grants.fits(cid, items))) return NINE_BOSS_TEXT.BAG_FULL;
    if (direct && !(await this.spendGold(session, NINE_BOSS.DIRECT_CLAIM_GOLD))) return NINE_BOSS_TEXT.NO_GOLD;
    let floor = verdict.floor;
    const saved = await this.towers.mutate(cid, (doc) => {
      const s = openNineState(doc.nineboss, today);
      const v = claimVerdict(s, today, direct);
      if (!v.ok) return false;
      floor = v.floor;
      s.claimedCycle = today;
      doc.nineboss = s;
      return true;
    });
    if (!saved) {
      if (direct) await this.refundGold(session, NINE_BOSS.DIRECT_CLAIM_GOLD);
      return NINE_BOSS_TEXT.CLAIMED;
    }
    await this.grants.grant(session, nineGrants(nineDailyReward(floor)));
    this.diary.record(cid, NINE_BOSS.DIARY_TASK);
    return null;
  }

  /** Real gold only (Go SpendGold): guarded $inc, then onUPP {gold}. */
  private async spendGold(session: Session, cost: number): Promise<boolean> {
    const doc = await this.chars.findOneAndUpdate(
      { _id: session.characterId!, gold: { $gte: cost } }, { $inc: { gold: -cost } }, { new: true, projection: { gold: 1 } },
    ).lean();
    if (!doc) return false;
    session.callback('onUPP', { gold: doc.gold });
    return true;
  }

  private async refundGold(session: Session, amount: number): Promise<void> {
    const doc = await this.chars.findByIdAndUpdate(session.characterId!, { $inc: { gold: amount } }, { new: true, projection: { gold: 1 } }).lean();
    if (doc) session.callback('onUPP', { gold: doc.gold });
  }
}
