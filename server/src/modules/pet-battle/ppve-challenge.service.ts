// challengeNextFloor (Go application/pet/ppve_challenge.go): load the state (daily reset in memory), gate on the max floor / free tries /
// configured pets, simulate floor ppvefloor + 1 on the headless runner, keep the replay, and ONLY on a win spend a free try, advance
// and credit carve_award[floor] KP in one state write, then the floor item (bag or mail). Pushes in Go order: changePPLoadingState,
// the item, onSendReplayPPVEPanel(outcome, floor, replayId, rankList, myRank), onUpdatePPVEPanel, the KP note. Denials are one note.

import { Injectable } from '@nestjs/common';
import { PPVE_RESULT } from '@mc/shared';
import { type Rng } from '../combat/battle.types';
import { scaledCreatureFighter } from '../combat/fighters';
import { NpcSkillCatalog } from '../combat/npc-skill-catalog';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetLineupService } from './pet-lineup.service';
import { simulatePetBattle } from './pet-sim';
import { PpveRankService } from './ppve-rank.service';
import { PpveRewardService } from './ppve-reward.service';
import { applyFloorWin, challengeRefusal, configSlots, PPVE_TEXT } from './ppve-rules';
import { ppveFloorEnemies, teamPowerOf } from './ppve-scaling';
import { PpveStateService } from './ppve-state.service';
import { ReplayStore } from './replay.store';

const note = (text: string): Push => push('onSystemMidMsgOrNote', text);
/** Position 1..5 of the saved config -> battle slot 15..19. */
export const ppveSlotOf = (pos: number): number => 14 + pos;

@Injectable()
export class PpveChallengeService {
  /** Swappable for tests / tools. */
  rng: Rng = Math.random;

  constructor(
    private readonly store: PpveStateService,
    private readonly lineups: PetLineupService,
    private readonly replays: ReplayStore,
    private readonly ranks: PpveRankService,
    private readonly rewards: PpveRewardService,
    private readonly data: GameDataService,
    private readonly npcSkills: NpcSkillCatalog,
  ) {}

  challenge(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => [push('changePPLoadingState', characterId), ...(await this.run(characterId))]);
  }

  private async run(characterId: number): Promise<Push[]> {
    const { state } = await this.store.load(characterId);
    const refusal = challengeRefusal(state);
    if (refusal) return [note(refusal)];
    const slots = configSlots(state.ppveConfig);
    if (slots.length === 0) return [note(PPVE_TEXT.noPets)];
    const lineup = await this.lineups.load(characterId, { slots, ctx: 'ppve', side: 'player', slotOf: ppveSlotOf });
    if (lineup.fighters.length === 0) return [note(PPVE_TEXT.noPets)];

    const floor = state.ppvefloor + 1;
    const enemies = ppveFloorEnemies(this.data.ppveEnemyPool(), floor, teamPowerOf(lineup.fighters));
    if (enemies.length === 0) return [note(PPVE_TEXT.noPets)];
    const sim = simulatePetBattle({
      fighters: [...lineup.fighters, ...enemies.map((e) => scaledCreatureFighter(e.slot, e.tpl, e.stats))],
      scripts: lineup.scripts, skill: (id) => this.data.skill(id), rng: this.rng, env: this.npcSkills,
      battleFieldId: `ppve_${characterId}_${floor}`,
    });
    const replay = this.replays.put(characterId, sim);

    const win = sim.outcome === PPVE_RESULT.WIN;
    const award = win ? this.data.carveAward(floor) : undefined;
    const out: Push[] = [];
    if (win) {
      applyFloorWin(state, floor);
      state.kp += Math.max(0, award?.award ?? 0);
      await this.store.save(characterId, state); // the try is spent and the KP credited before the item
      out.push(...await this.rewards.grant(characterId, floor, award?.itemId ?? 0));
    }
    const rank = await this.ranks.rank(characterId);
    out.push(push('onSendReplayPPVEPanel', sim.outcome, floor, replay.id, rank.rankList, rank.myRank), this.store.panelPush(state));
    if (win && (award?.award ?? 0) > 0) out.push(note(PPVE_TEXT.kpGained(award!.award)));
    return out;
  }
}
