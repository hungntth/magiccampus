// Tiểu Tinh Linh skins (Hoán đổi, Go application/fairy/skin.go, Flash FairySkinCanvas): getFairyResAndList, setFairyRes(tid, 1 hide | 2 show)
// and setFairyResList(tid) (unlock for 550 unbound gold, charged before the write). A skin is usable when unlocked or when a fairy of that
// template is owned; a skin change while a fairy guards re-sends onFairyOn so the map shows the new art (H5: the look is server-derived).

import { Injectable } from '@nestjs/common';
import { FAIRY_TEXT, type FairySetResReply, type FairySkin } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { AppearanceService } from '../appearance/appearance.service';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { FeatureStoreService } from '../progression/feature-store.service';
import { planSetRes, planUnlockSkin } from './fairy-rules';
import { FAIRY_SKIN_FEATURE_KEY, encodeSkinState, guardFairy, parseSkinState, skinWire, type FairySkinState } from './fairy-state';
import { FairyService } from './fairy.service';

@Injectable()
export class FairySkinService {
  constructor(
    private readonly fairies: FairyService,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly appearance: AppearanceService,
  ) {}

  async load(cid: number): Promise<FairySkinState> {
    return parseSkinState(await this.store.get(cid, FAIRY_SKIN_FEATURE_KEY, {}));
  }

  private save(cid: number, s: FairySkinState): Promise<void> {
    return this.store.put(cid, FAIRY_SKIN_FEATURE_KEY, encodeSkinState(s));
  }

  /** getFairyResAndList. */
  async list(session: Session): Promise<FairySkin> {
    return skinWire(await this.load(session.characterId!));
  }

  /** setFairyRes(tid, type): null when the skin is not owned (the client ignores a null reply). */
  setRes(session: Session, tid: number, type: number): Promise<FairySetResReply | null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const skin = await this.load(cid);
      const roster = await this.fairies.load(cid);
      const plan = planSetRes(skin, roster, tid, type);
      if (!plan) return null;
      await this.save(cid, plan.skin);
      if (plan.skin.actFairy !== skin.actFairy && guardFairy(roster)) await this.appearance.pushFairy(cid);
      return { type: plan.type, tid };
    });
  }

  /** setFairyResList(tid): unlock for 550 gold; a refusal shows its note and answers the unchanged list. */
  unlock(session: Session, tid: number): Promise<FairySkin> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const skin = await this.load(cid);
      const plan = planUnlockSkin(skin, await this.fairies.load(cid), tid, this.gameData.fairyTemplate(tid) !== undefined);
      if ('error' in plan) {
        session.callback('onSystemMidMsgOrNote', plan.error);
        return skinWire(skin);
      }
      const total = await this.characters.spendMoney(cid, 'gold', plan.cost);
      if (total === null) {
        session.callback('onSystemMidMsgOrNote', FAIRY_TEXT.NO_GOLD);
        return skinWire(skin);
      }
      try {
        await this.save(cid, plan.skin);
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', plan.cost);
        throw e;
      }
      session.callback('onUPP', { gold: total });
      session.callback('onAddMoney', cid, 'gold', -plan.cost, total);
      return skinWire(plan.skin);
    });
  }
}
