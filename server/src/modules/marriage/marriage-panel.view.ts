// Builds the two panel payloads (Go panel_dto.go): the seek board (`onInitMarriageSekList`) and the caller's own list
// (`onInitCharMarriageList`: own ad + every proposal sent to or by the caller), and pushes them to an online character.

import { Injectable } from '@nestjs/common';
import type { CharMarriageRow, MarriageReqRow, MarriageSekRow } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import { sortCharList, sortSeek } from './marriage-rules';
import { MarriageStore } from './marriage.store';

@Injectable()
export class MarriagePanelView {
  constructor(
    private readonly store: MarriageStore,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  private online(id: number): boolean {
    return this.scenes.findByCharacter(id) !== undefined;
  }

  async seekList(): Promise<MarriageSekRow[]> {
    const ads = await this.store.listSeeking();
    const docs = new Map((await this.characters.findByIds(ads.map((a) => a.characterId))).map((c) => [c._id, c]));
    const rows = ads.flatMap((a): MarriageSekRow[] => {
      const c = docs.get(a.characterId);
      if (!c) return [];
      return [{
        cid: c._id, name: c.name, classId: c.classId, gender: c.gender, exp: c.exp ?? 0, online: this.online(c._id),
        flag: a.flag, content: a.content, addDate: a.addDate, pop: 0,
      }];
    });
    return sortSeek(rows);
  }

  async charList(characterId: number): Promise<CharMarriageRow[]> {
    const [ad, reqs] = await Promise.all([this.store.getSeeking(characterId), this.store.involving(characterId)]);
    const ids = [...new Set(reqs.flatMap((r) => [r.fromId, r.toId]))];
    const docs = new Map((await this.characters.findByIds(ids)).map((c) => [c._id, c]));
    const rows: CharMarriageRow[] = [];
    if (ad) rows.push({ type: 0, cid: ad.characterId, content: ad.content, flag: ad.flag, addDate: ad.addDate });
    for (const r of reqs) {
      const from = docs.get(r.fromId);
      const to = docs.get(r.toId);
      if (!from || !to) continue;
      const row: MarriageReqRow = {
        id: r._id, type: 1, cid: r.fromId, targetId: r.toId, name: `${from.name}|${to.name}`, classId: from.classId,
        gender: from.gender, exp: from.exp ?? 0, online: this.online(from._id), content: r.content, addDate: r.addDateMs, flag: r.flag,
      };
      rows.push(row);
    }
    return sortCharList(rows);
  }

  /** Both lists to one online character (no-op offline). */
  async push(characterId: number): Promise<void> {
    const s = this.scenes.findByCharacter(characterId);
    if (!s) return;
    const [seek, own] = await Promise.all([this.seekList(), this.charList(characterId)]);
    s.callback('onInitMarriageSekList', seek);
    s.callback('onInitCharMarriageList', own);
  }
}
