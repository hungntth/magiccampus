// Titles: owned list (gtl), grant, setTitle / setActTitle with stat refresh, long-buff row 0 and the map broadcast. Active ids
// live on the Character document; ownership in character_titles. Mutations are serialised per character.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { LongBuff, PlayerData, SetActTitleResult, SetTitleResult, TitleAdded, TitleList, TitleView } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterStatsService } from '../stats/character-stats.service';
import { nextTitleExpiry } from './title-medal';
import { isOwnedNow, isSpecialTitle, titleListStrings, titleLists, titleLongBuff, titleView } from './title-rules';
import { CharacterTitle } from './title.schema';

@Injectable()
export class TitleService {
  constructor(
    @InjectModel(CharacterTitle.name) private readonly titles: Model<CharacterTitle>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly stats: CharacterStatsService,
    private readonly achievements: AchievementEvents,
  ) {}

  private readonly tpl = (id: number) => this.gameData.getTitle(id);

  /** Owned rows, newest first. */
  private async owned(characterId: number): Promise<CharacterTitle[]> {
    return this.titles.find({ characterId }).sort({ obtainedAt: -1 }).lean();
  }

  private viewOf(id: number, expiresAt?: Date | null): TitleView | undefined {
    const t = id > 0 ? this.tpl(id) : undefined;
    return t ? titleView(t, this.gameData.getBuff(Number(t.b ?? 0)), expiresAt) : undefined;
  }

  /** gtl reply: `ct` / `cts` plus the H5 `titles` display data for every owned title. */
  async list(characterId: number): Promise<TitleList> {
    const rows = await this.owned(characterId);
    const lists = titleLists(rows, this.tpl, Date.now());
    const byId = new Map(rows.map((r) => [r.titleId, r]));
    const titles = [...new Set([...lists.ct, ...lists.cts])].flatMap((id) => this.viewOf(id, byId.get(id)?.expiresAt) ?? []);
    return { ...titleListStrings(lists), titles };
  }

  /** Login payload fields: lists, active ids (an expired / lost active title is cleared) and their views. */
  async loginFields(characterId: number): Promise<Partial<PlayerData>> {
    const doc = await this.chars.findById(characterId, { titleId: 1, actTitleId: 1 }).lean();
    const rows = await this.owned(characterId);
    const now = Date.now();
    const live = new Map(rows.filter((r) => isOwnedNow(r, now)).map((r) => [r.titleId, r]));
    let t = doc?.titleId ?? 0;
    let actT = doc?.actTitleId ?? 0;
    const clear: Record<string, number> = {};
    if (t > 0 && !live.has(t)) { clear.titleId = 0; t = 0; }
    if (actT > 0 && !live.has(actT)) { clear.actTitleId = 0; actT = 0; }
    if (Object.keys(clear).length > 0) await this.chars.updateOne({ _id: characterId }, { $set: clear });
    const tv = this.viewOf(t, live.get(t)?.expiresAt);
    const atv = this.viewOf(actT, live.get(actT)?.expiresAt);
    return { ...titleListStrings(titleLists(rows, this.tpl, now)), t, actT, ...(tv ? { tv } : {}), ...(atv ? { atv } : {}) };
  }

  /** Long-buff row 0 for the active normal title (sceneLogin adds it to initLongBuff), or null. */
  async initBuff(characterId: number): Promise<LongBuff | null> {
    const doc = await this.chars.findById(characterId, { titleId: 1 }).lean();
    return doc && doc.titleId > 0 && (await this.isOwned(characterId, doc.titleId)) ? this.buffOf(doc.titleId) : null;
  }

  private buffOf(titleId: number): LongBuff | null {
    const t = this.tpl(titleId);
    const buff = t ? this.gameData.getBuff(Number(t.b ?? 0)) : undefined;
    return t && buff ? titleLongBuff(t, buff) : null;
  }

  private async isOwned(characterId: number, titleId: number): Promise<boolean> {
    const row = await this.titles.findOne({ characterId, titleId }).lean();
    return !!row && isOwnedNow(row, Date.now());
  }

  /** Grants (or refreshes) a title; `seconds` 0 = permanent. Pushes onAddTitle (+ onAddActTitle for special titles) if online. */
  async grant(characterId: number, titleId: number, seconds = 0): Promise<TitleAdded> {
    return (await this.grantFor(characterId, titleId, seconds)).added;
  }

  /** False when a grant of `seconds` would leave the owned row as is (the title is already permanent). */
  async wouldChange(characterId: number, titleId: number, seconds: number): Promise<boolean> {
    const row = await this.titles.findOne({ characterId, titleId }, { expiresAt: 1 }).lean();
    return nextTitleExpiry(row ? (row.expiresAt ?? null) : undefined, seconds, Date.now()) !== 'unchanged';
  }

  /**
   * grant() plus what changed (legacy GrantTitleFor): a re-grant adds `seconds` to the time left, an expired row restarts,
   * a permanent grant makes a timed title permanent and an owned permanent title is left as is (`changed` false, no push).
   */
  async grantFor(
    characterId: number, titleId: number, seconds = 0,
  ): Promise<{ added: TitleAdded; changed: boolean; first: boolean }> {
    if (!this.tpl(titleId)) throw RpcException.notFound(`title ${titleId} not found`);
    const now = Date.now();
    const row = await this.titles.findOne({ characterId, titleId }, { expiresAt: 1 }).lean();
    const next = nextTitleExpiry(row ? (row.expiresAt ?? null) : undefined, seconds, now);
    if (next === 'unchanged') {
      const lists = titleListStrings(titleLists(await this.owned(characterId), this.tpl, now));
      return { added: { f: 1, t: titleId, ct: lists.ct, view: this.viewOf(titleId, null) }, changed: false, first: false };
    }
    const expiresAt = next.expiresAt;
    const restart = !row || (!!row.expiresAt && row.expiresAt.getTime() <= now); // an extension keeps obtainedAt
    await this.titles.updateOne(
      { characterId, titleId },
      { $set: { expiresAt, ...(restart ? { obtainedAt: new Date(now) } : {}) } },
      { upsert: true },
    );
    const rows = await this.owned(characterId);
    this.achievements.record(characterId, 'titlesOwned', { value: rows.filter((r) => isOwnedNow(r, Date.now())).length });
    const lists = titleListStrings(titleLists(rows, this.tpl, Date.now()));
    const added: TitleAdded = { f: 1, t: titleId, ct: lists.ct, view: this.viewOf(titleId, expiresAt) };
    const online = this.scenes.findByCharacter(characterId);
    online?.callback('onAddTitle', added);
    if (isSpecialTitle(this.tpl(titleId))) online?.callback('onAddActTitle', lists.cts);
    return { added, changed: true, first: next.first };
  }

  /**
   * Takes an owned title away (M14 brotherhood leave / disband). An active title is cleared first (online owner: buff row off,
   * stat refresh, map `onTitleUpdate` tid 0); an online owner then gets `onAddTitle {f: 5, t, ct}` (list refresh, no toast).
   * Returns false when the character did not own it. Do not call inside the character's own lock.
   */
  revoke(characterId: number, titleId: number): Promise<boolean> {
    return withCharLock(characterId, async () => {
      const removed = await this.titles.findOneAndDelete({ characterId, titleId }).lean();
      if (!removed) return false;
      const doc = await this.chars.findById(characterId, { titleId: 1, actTitleId: 1 }).lean();
      const wasActive = doc?.titleId === titleId;
      const wasAct = doc?.actTitleId === titleId;
      if (wasActive || wasAct) {
        await this.chars.updateOne({ _id: characterId }, { $set: { ...(wasActive ? { titleId: 0 } : {}), ...(wasAct ? { actTitleId: 0 } : {}) } });
      }
      const online = this.scenes.findByCharacter(characterId);
      if (online) {
        if (wasActive) online.callback('delBuff', 0);
        if (wasActive || wasAct) await this.pushStats(online);
        if (wasActive) this.broadcast(online, 'onTitleUpdate', 0);
        if (wasAct) this.broadcast(online, 'onActTitleUpdate', 0);
        const lists = titleListStrings(titleLists(await this.owned(characterId), this.tpl, Date.now()));
        const push: TitleAdded = { f: 5, t: titleId, ct: lists.ct };
        online.callback('onAddTitle', push);
        if (wasAct || isSpecialTitle(this.tpl(titleId))) online.callback('onAddActTitle', lists.cts);
      }
      return true;
    });
  }

  /** setTitle(id | -1): own the title (or clear), persist, push the buff row + stats, broadcast onTitleUpdate. */
  setTitle(session: Session, id: number): Promise<SetTitleResult> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      if (id > 0 && !(await this.isOwned(cid, id)) ) return { f: false, t: 0 };
      const next = id > 0 ? id : 0;
      await this.chars.updateOne({ _id: cid }, { $set: { titleId: next } });
      const bd = next > 0 ? this.buffOf(next) : null;
      if (bd) session.callback('upLongBuff', bd);
      else session.callback('delBuff', 0);
      await this.pushStats(session);
      this.broadcast(session, 'onTitleUpdate', next);
      return { f: true, t: next > 0 ? next : -1, ...(bd ? { bd } : {}) };
    });
  }

  /** setActTitle(id | -1): only special titles (s in 1, 2). */
  setActTitle(session: Session, id: number): Promise<SetActTitleResult> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      if (id > 0 && !(isSpecialTitle(this.tpl(id)) && (await this.isOwned(cid, id)))) return { f: false };
      const next = id > 0 ? id : 0;
      await this.chars.updateOne({ _id: cid }, { $set: { actTitleId: next } });
      await this.pushStats(session);
      this.broadcast(session, 'onActTitleUpdate', next);
      return { f: true, t: next > 0 ? next : -1 };
    });
  }

  /** Stat refresh after a title change; the clamp update comes first when the max HP/MP dropped. */
  private async pushStats(session: Session): Promise<void> {
    for (const u of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', u);
  }

  private broadcast(session: Session, method: 'onTitleUpdate' | 'onActTitleUpdate', tid: number): void {
    if (!session.mapId) return;
    const view = this.viewOf(tid);
    this.scenes.broadcast(session.mapId, method, [{ cid: session.characterId!, tid, ...(view ? { view } : {}) }]);
  }
}
