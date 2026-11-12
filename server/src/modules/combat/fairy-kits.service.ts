// Guarding fairy kits for battle (M13 G2, Go combatService.SetFairySkillProvider + applyCharacterFairySkills): the rotation of the
// guarding fairy is read from the saved config at every battle start (no relog). Battle starts are synchronous, so the rotation is
// loaded with the battle pets (CombatService.loadPets, which every PvE / PvP start awaits first) and taken when the character fighter
// is built (CombatService.startGroup, PvpService.start). A fresh FairyKit per battle (procs keep per-battle state).

import { Injectable, Logger } from '@nestjs/common';
import { FairySkillService } from '../fairy/fairy-skill.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { buildFairyKit, type FairyKit, type FairyLookups } from './mechanics/fairy-battle-rules';

/** A preloaded rotation older than this is ignored (the start it was loaded for never happened). */
const PRELOAD_TTL_MS = 15_000;

@Injectable()
export class FairyBattleKits {
  private readonly log = new Logger(FairyBattleKits.name);
  private readonly pending = new Map<number, { rotation: number[] | null; at: number }>();
  private readonly lookups: FairyLookups;

  constructor(
    private readonly fairySkills: FairySkillService,
    gameData: GameDataService,
  ) {
    this.lookups = {
      skill: (id) => gameData.skill(id),
      buffRow: (id) => gameData.getBuff(id),
      family: (code) => gameData.skillIndex().byCode.get(code) ?? [],
    };
  }

  /** Reads the guarding fairy's rotation of each character; a failure only means no fairy casts in that battle. */
  async preload(characterIds: readonly number[]): Promise<void> {
    for (const cid of characterIds) {
      let rotation: number[] | null = null;
      try {
        rotation = (await this.fairySkills.battleSkills(cid))?.rotation ?? null;
      } catch (e) {
        this.log.warn(`fairy kit of ${cid}: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.pending.set(cid, { rotation, at: Date.now() });
    }
  }

  /** The kit preloaded for this character (consumed), or undefined when its fairy casts nothing. */
  take(cid: number): FairyKit | undefined {
    const p = this.pending.get(cid);
    this.pending.delete(cid);
    if (!p?.rotation || Date.now() - p.at > PRELOAD_TTL_MS) return undefined;
    return buildFairyKit(p.rotation, this.lookups) ?? undefined;
  }
}
