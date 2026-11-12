// Pet side of Chân Hồn Thần Thú (Go statfeature/prs_stats.go + pet/prs_bonus.go + prs/look.go): PetStatProvider 'prs' (soul tree + activated
// forms, panel units, on the BATTLE pet only, like the handbook provider: panel / battle; every PPVE line-up pet), the look hook of
// PetFollowService (equipped form art on the battle pet) and the onRefreshPetProp pushes after a stat change.

import { Injectable } from '@nestjs/common';
import { PetState, prsFormActive, prsTotals } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses, type PropEntry } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { TALENT_PROPS } from '../pet-boost/talent-rules';
import { PetBonusService } from '../pet/pet-bonus.service';
import type { PetLook } from '../pet/pet-follow.service';
import type { PetStatContext, PetStatProvider } from '../pet/pet-stat-provider';
import type { Pet } from '../pet/pet.schema';
import { FeatureStoreService } from '../progression/feature-store.service';
import { PRS_FEATURE_KEY, parsePrs, type PrsState } from './prs-state';

/** Pet sheet targets of the PRS props: the pet talent dictionary + 14 XPN and 34 Miễn Tử (Go applyPetPRSProp). */
export const PRS_PET_PROPS: Readonly<Record<number, PropEntry>> = { ...TALENT_PROPS, 14: BUFF_PROP[14]!, 34: BUFF_PROP[34]! };

const CONTEXTS: readonly PetStatContext[] = ['panel', 'battle', 'ppve'];
const eligible = (pet: Pet, ctx: PetStatContext): boolean => ctx === 'ppve' || pet.state === PetState.BATTLE;

@Injectable()
export class PrsPetService implements PetStatProvider {
  readonly key = 'prs';
  readonly contexts = CONTEXTS;
  /** Injectable clock (tests / smoke). */
  now: () => number = () => Date.now();

  constructor(
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly bonus: PetBonusService,
  ) {}

  async load(characterId: number): Promise<PrsState> {
    return parsePrs(await this.store.get(characterId, PRS_FEATURE_KEY, {}));
  }

  /** Flat / rate bonuses of a state (panel units; flats stay fractional until the pet sheet truncates once). */
  bonusesOf(state: PrsState): Bonuses {
    const b = emptyBonuses();
    const totals = prsTotals(state, this.gameData.prsTrees(), (id) => this.gameData.prsTree(id), (id) => this.gameData.prsShow(id), this.now());
    for (const [prop, value] of totals) addProp(b, PRS_PET_PROPS, prop, value, false);
    return b;
  }

  async bonuses(ownerId: number, pets: readonly Pet[], ctx: PetStatContext): Promise<Map<number, Bonuses>> {
    const hit = pets.filter((p) => eligible(p, ctx));
    if (hit.length === 0) return new Map();
    const b = this.bonusesOf(await this.load(ownerId));
    return new Map(hit.map((p) => [p._id, b]));
  }

  /** Look hook of PetFollowService: the equipped, still active form and its art. */
  async lookOf(characterId: number): Promise<PetLook | null> {
    const s = await this.load(characterId);
    if (s.useSid <= 0 || !prsFormActive(s, s.useSid, this.now())) return null;
    const show = this.gameData.prsShow(s.useSid);
    return show && show.resCode !== '0' ? { useId: s.useSid, resCode: show.resCode } : null;
  }

  /** onRefreshPetProp for the battle pet(s) after the tree or a form changed. */
  async refresh(session: Session): Promise<void> {
    for (const p of await this.bonus.battlePetPushes(session.characterId!)) session.callback(p.m, ...p.a);
  }
}
