// Offline exp ("Ủy thác offline"): the login `offlineTime` (banked seconds + time since the character left, capped) and the two claims
// getOfflineExp / getPetOfflineExp. The bank lives in character_features key `offline` {bank, leftAt}; claims run under the character
// lock and follow "spend, then bank, then credit" (the cost is charged first, the consumed seconds are persisted, then the exp is paid).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  OfflineCode, PetState, charExpPerHour, charOfflineCost, offlineConsumption, offlineExpGain, offlineSecondsAtLogin, petExpPerHour,
  petOfflineCost, type OfflineCost, type OfflineLogin,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { sendPushes } from '../inventory/pushes';
import { PetBattleService } from '../pet/pet-battle.service';
import { Pet } from '../pet/pet.schema';
import { FeatureStoreService } from '../progression/feature-store.service';
import { charClaimError, petClaimError } from './offline-rules';

const KEY = 'offline';

interface OfflineState {
  bank: number;
  leftAt: number;
  [k: string]: unknown;
}

@Injectable()
export class OfflineService {
  now = (): number => Date.now();

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly features: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly rewards: RewardGrantService,
    private readonly petBattle: PetBattleService,
  ) {}

  private state(characterId: number): Promise<OfflineState> {
    return this.features.get<OfflineState>(characterId, KEY, { bank: 0, leftAt: 0 });
  }

  /** Login: the banked seconds now include the time since the last leave; the character is online again (leftAt 0). */
  async loginFields(characterId: number): Promise<OfflineLogin> {
    const s = await this.state(characterId);
    const avail = offlineSecondsAtLogin(Number(s.bank) || 0, Number(s.leftAt) || 0, this.now());
    await this.features.put(characterId, KEY, { bank: avail, leftAt: 0 });
    return { offlineTime: avail };
  }

  /** Disconnect / back to the character list: the offline clock starts. */
  async markLeft(characterId: number | null): Promise<void> {
    if (characterId !== null) await this.features.patch(characterId, KEY, { leftAt: this.now() });
  }

  /** Charges a cost first; the failure code when the wallet is short, null when paid. */
  private async pay(characterId: number, cost: OfflineCost, session: Session): Promise<number | null> {
    if (cost.currency === 'none' || cost.amount <= 0) return null;
    const prefs = await this.characters.paymentPrefs(characterId);
    const key = cost.currency === 'silver' ? prefs.money : prefs.gold;
    const total = await this.characters.spendMoney(characterId, key, cost.amount);
    if (total === null) return cost.currency === 'silver' ? OfflineCode.SILVER : OfflineCode.GOLD;
    session.callback('onUPP', { [key]: total });
    return null;
  }

  private async level(characterId: number): Promise<number> {
    return (await this.chars.findById(characterId, { level: 1 }).lean())?.level ?? 1;
  }

  claimChar(session: Session, mode: number, hours: number): Promise<number> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const level = await this.level(cid);
      const gate = charClaimError(level);
      if (gate !== null) return gate;
      const state = await this.state(cid);
      const cons = offlineConsumption(Number(state.bank) || 0, hours);
      const perHour = charExpPerHour(level, mode);
      const cost = charOfflineCost(level, mode, cons?.hours ?? 0);
      if (!cons || perHour === null || !cost) return OfflineCode.FAILED;
      const failed = await this.pay(cid, cost, session);
      if (failed !== null) return failed;
      await this.features.patch(cid, KEY, { bank: cons.remaining });
      await this.rewards.grantExpSilver(session, offlineExpGain(perHour, cons.hours), 0);
      return OfflineCode.CHAR_OK;
    });
  }

  claimPet(session: Session, mode: number, hours: number): Promise<number> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const level = await this.level(cid);
      const pet = await this.pets.findOne({ characterId: cid, state: PetState.BATTLE }, { level: 1, binded: 1 }).lean();
      const gate = petClaimError(level, pet ? { level: pet.level, binded: pet.binded } : null);
      if (gate !== null) return gate;
      const state = await this.state(cid);
      const cons = offlineConsumption(Number(state.bank) || 0, hours);
      const perHour = pet ? petExpPerHour(pet.level, mode) : null;
      const cost = cons ? petOfflineCost(mode, cons.hours) : null;
      if (!cons || perHour === null || !cost) return OfflineCode.FAILED;
      const failed = await this.pay(cid, cost, session);
      if (failed !== null) return failed;
      await this.features.patch(cid, KEY, { bank: cons.remaining });
      sendPushes(session, await this.petBattle.grantQuestExp(cid, offlineExpGain(perHour, cons.hours)));
      return OfflineCode.PET_OK;
    });
  }
}
