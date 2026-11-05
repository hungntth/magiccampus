// Mật Đạo exp maps (Go handlers/item secret_passage_use.go + combat secret_passage_encounter.go): the books 128 / 2137 (a use hook of
// the bag: refusals keep the book, else one is consumed first and the player lands solo on the Mật Đạo 1 safe point) and the
// random-encounter tuner of maps 140104-140106 (mobs rebuilt at the player's level, exp base x map exp_multi x 2, elite life x 0.5).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { SceneManager } from '../../gateway/scene.manager';
import { push } from '../inventory/pushes';
import { UseItemService } from '../inventory/use-item.service';
import { EncounterService } from '../combat/encounter.service';
import type { Fighter } from '../combat/battle.types';
import { creatureFighter } from '../combat/fighters';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import { SceneTransportService } from '../scene/scene-transport.service';
import {
  bookRefusal, eliteLife, isSecretPassageBook, isSecretPassageMap, passageExpBase, SECRET_PASSAGE, SECRET_PASSAGE_TEXT,
} from './secret-passage-rules';

@Injectable()
export class SecretPassageService implements OnModuleInit {
  constructor(
    private readonly useItem: UseItemService,
    private readonly encounters: EncounterService,
    private readonly gameData: GameDataService,
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly transport: SceneTransportService,
  ) {}

  onModuleInit(): void {
    this.useItem.addUseHook(async (ctx) => {
      if (!isSecretPassageBook(ctx.templateId)) return null;
      const session = this.scenes.findByCharacter(ctx.characterId);
      if (!session) return null;
      const why = bookRefusal({
        level: ctx.level, reqLevel: ctx.reqLevel, inBattle: session.battleId !== null,
        inGroup: this.parties.partyOf(ctx.characterId) !== undefined, mapId: session.mapId,
      });
      if (why) return [push('onSystemMidMsgOrNote', why)];
      const map = this.gameData.getMap(SECRET_PASSAGE.ENTRY_MAP);
      if (!map) return [push('onSystemMidMsgOrNote', SECRET_PASSAGE_TEXT.FAILED)];
      const pushes = await ctx.consume(); // spend first, then move
      session.callback('onSceneEnter', await this.transport.moveToMap(session, SECRET_PASSAGE.ENTRY_MAP, Number(map.safe_x ?? 0), Number(map.safe_y ?? 0), false));
      return pushes;
    });
    this.encounters.addTuner((mapId, enemies, playerLevel) => this.tune(mapId, enemies, playerLevel));
  }

  /** Go SecretPassageEncounterLevel / ExpMulti / EliteLife: every mob takes the player's level, exp is multiplied, elites lose half their life. */
  private tune(mapId: number, enemies: Fighter[], playerLevel: number): void {
    if (!isSecretPassageMap(mapId) || playerLevel <= 0) return;
    const mapExp = Number(this.gameData.getMap(mapId)?.exp_multi ?? 1);
    enemies.forEach((old, i) => {
      const tpl = this.gameData.creature(old.refId);
      if (!tpl) return;
      const f = creatureFighter(old.slot, tpl, playerLevel, old.bossFlag, passageExpBase(old.expBase, playerLevel, mapExp));
      if (old.bossFlag === SECRET_PASSAGE.ELITE_BOSS_FLAG) {
        f.hpMax = eliteLife(f.hpMax);
        f.hp = f.hpMax;
      }
      enemies[i] = f;
    });
  }
}
