// Mê Huyễn Nhím Xanh curse (Go handlers/npc dungeon_mehuyen_curse.go): 4 s after a win over Vong Hồn Lởn Vởn every credited
// run holder turns into Nhím Xanh until the run deadline (the VIP right-13 transform slot, which every scene payload already
// honours; the replaced transform is kept in the run morph) and gets buff 91619 (−10 % attack, cannot be clicked off). The cure
// (5242 turned in, or the run closed) restores / clears the look, removes the buff and refreshes stats.
// Pushes: onSetRes {id, res} (self + map), upLongBuff / delBuff, onUPP, onSystemSay.

import { Injectable, Logger } from '@nestjs/common';
import type { DungeonDef } from '@mc/shared';
import { SceneManager } from '../../../gateway/scene.manager';
import { BuffService } from '../../buff/buff.service';
import { CharacterService } from '../../character/character.service';
import { CharacterStatsService } from '../../stats/character-stats.service';
import { PmStateService } from '../../vip/pm-state.service';
import { runDeadline, runOf } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import type { DungeonMorph } from '../dungeon.schema';
import { MH } from './mehuyen-layout';

const TEXT = {
  CURSED: 'Vong hồn đã nguyền rủa ngươi biến thành Nhím Xanh! Hãy cùng đội thu thập 20 Hoa Linh Hồn giao cho Mê Huyễn Thủ Hộ Viên để giải trừ.',
  CURED: 'Bùa chú Nhím Xanh đã được giải trừ.',
} as const;

@Injectable()
export class MeHuyenCurseService {
  private readonly logger = new Logger(MeHuyenCurseService.name);

  constructor(
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly vip: PmStateService,
    private readonly buffs: BuffService,
    private readonly stats: CharacterStatsService,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  async curse(characterId: number, d: DungeonDef): Promise<void> {
    const run = await this.state.run(characterId, d);
    const now = this.state.now();
    if (!run || run.closed || run.morph || !run.beaten.includes(MH.WRAITH)) return;
    const until = runDeadline(run, d.rules);
    if (until <= now) return;
    const vipDoc = await this.vip.load(characterId);
    const prev = vipDoc.transform && vipDoc.transform.expiresAt > now ? vipDoc.transform : null;
    const morph: DungeonMorph = { res: MH.CURSE_RES, until, prev };
    const set = await this.state.mutate(characterId, (st) => {
      const r = runOf(st.runs, d.key, this.state.today());
      if (!r || r.closed || r.morph) return false;
      r.morph = morph;
      return true;
    });
    if (!set) return;
    await this.setTransform(characterId, { resCode: MH.CURSE_RES, expiresAt: until });
    this.pushRes(characterId, MH.CURSE_RES);
    const s = this.support.session(characterId);
    const buff = await this.buffs.grant(characterId, MH.CURSE_BUFF, Math.ceil((until - now) / 1000));
    if (s) {
      s.callback('upLongBuff', buff);
      await this.stats.refreshPush(s);
      s.callback('onSystemSay', TEXT.CURSED);
    }
  }

  /** Lifts the curse; `morph` given by a closing run, else taken from today's run. */
  async cure(characterId: number, d: DungeonDef, morph?: DungeonMorph | null): Promise<void> {
    const box: { m: DungeonMorph | null } = { m: morph ?? null };
    if (!box.m) {
      await this.state.mutate(characterId, (st) => {
        const r = runOf(st.runs, d.key, this.state.today());
        if (!r?.morph) return false;
        box.m = r.morph;
        r.morph = null;
        return true;
      });
    }
    const taken = box.m;
    if (!taken) return;
    const restore = taken.prev && taken.prev.expiresAt > this.state.now() ? taken.prev : null;
    await this.setTransform(characterId, restore);
    const s = this.support.session(characterId);
    for (const row of await this.buffs.listActive(characterId)) {
      if (row.buffId !== MH.CURSE_BUFF) continue;
      await this.buffs.remove(characterId, row._id);
      s?.callback('delBuff', row._id);
    }
    try {
      const doc = await this.characters.getById(characterId);
      this.pushRes(characterId, restore?.resCode ?? this.characters.toSceneCharacter(doc).resCode);
    } catch (e) {
      this.logger.warn(`mê huyễn cure ${characterId}: ${(e as Error).message}`);
    }
    if (s) {
      await this.stats.refreshPush(s);
      s.callback('onSystemSay', TEXT.CURED);
    }
  }

  private async setTransform(characterId: number, transform: { resCode: string; expiresAt: number } | null): Promise<void> {
    for (let i = 0; i < 5; i++) {
      const doc = await this.vip.load(characterId);
      if (await this.vip.update(characterId, doc.rev, { transform })) return;
    }
    this.logger.warn(`mê huyễn: transform write for ${characterId} lost its races`);
  }

  private pushRes(characterId: number, res: string): void {
    const s = this.support.session(characterId);
    if (!s) return;
    const payload = { id: characterId, res };
    s.callback('onSetRes', payload);
    if (s.mapId) this.scenes.broadcast(s.mapId, 'onSetRes', [payload], s);
  }
}
