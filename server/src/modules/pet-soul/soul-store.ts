// Menh Hon persistence: the character bag (character feature `soul`: open, data, temp prey bag, crystalSid) and each pet's ring
// (pets.soul). Callers hold the character lock (withCharLock is not reentrant), so read-modify-write here is safe.
// Also the plain-gold spend used by openBag and the advanced divination (never goldBind, like Go SpendGold).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_SOUL_BAG_SLOTS, PET_SOUL_FREE_BAG_SLOTS, petSoulOpenNum, soulSlotsWire, type PetSoulLogin, type SoulSlot } from '@mc/shared';
import { Character } from '../character/character.schema';
import { push, type Push } from '../inventory/pushes';
import { FeatureStoreService } from '../progression/feature-store.service';
import { Pet } from '../pet/pet.schema';
import { SOUL_TEXT, SoulRefusal } from './soul-rules';

export const SOUL_FEATURE_KEY = 'soul';

export interface CharSoul {
  open: number;
  data: Record<string, SoulSlot>;
  /** Temp prey bag: slot -> rolled soul id. */
  temp: Record<string, number>;
  /** Lit crystal 2..5, 0 = only crystal 1. */
  crystalSid: number;
}

export interface Ring {
  openNum: number;
  openNum2: number;
  data: Record<string, SoulSlot>;
}

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

function cleanSlots(raw: unknown): Record<string, SoulSlot> {
  const out: Record<string, SoulSlot> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw)) {
    const v = value as Partial<SoulSlot> | null;
    const index = int(key);
    if (!v || index <= 0 || int(v.sid) <= 0) continue;
    out[String(index)] = { sid: int(v.sid), exp: Math.max(0, int(v.exp)), ...(v.lock ? { lock: true } : {}) };
  }
  return out;
}

export function normaliseChar(raw: Record<string, unknown> | undefined): CharSoul {
  const temp: Record<string, number> = {};
  for (const [key, value] of Object.entries((raw?.temp as Record<string, unknown> | undefined) ?? {})) {
    if (int(key) > 0 && int(value) > 0) temp[String(int(key))] = int(value);
  }
  return {
    open: Math.min(PET_SOUL_BAG_SLOTS, Math.max(PET_SOUL_FREE_BAG_SLOTS, int(raw?.open))),
    data: cleanSlots(raw?.data),
    temp,
    crystalSid: Math.max(0, int(raw?.crystalSid)),
  };
}

/** The ring as stored, with openNum raised to the level value (never lowered). */
export function normaliseRing(soul: { openNum?: number; openNum2?: number; data?: object } | null | undefined, level: number): Ring {
  return {
    openNum: Math.max(int(soul?.openNum), petSoulOpenNum(level)),
    openNum2: Math.max(0, int(soul?.openNum2)),
    data: cleanSlots(soul?.data),
  };
}

@Injectable()
export class SoulStore {
  constructor(
    private readonly features: FeatureStoreService,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  async char(characterId: number): Promise<CharSoul> {
    return normaliseChar(await this.features.get(characterId, SOUL_FEATURE_KEY, {}));
  }

  save(characterId: number, state: CharSoul): Promise<void> {
    return this.features.put(characterId, SOUL_FEATURE_KEY, { ...state });
  }

  /** The login blobs: soulBagData, tempSoulData and crystalSid. */
  async loginFields(characterId: number): Promise<PetSoulLogin> {
    const s = await this.char(characterId);
    return { soulBagData: { open: s.open, data: soulSlotsWire(s.data) }, tempSoulData: { ...s.temp }, crystalSid: s.crystalSid };
  }

  async pet(characterId: number, petId: number): Promise<{ row: Pet; ring: Ring }> {
    const row = await this.pets.findOne({ _id: petId, characterId }).lean();
    if (!row) throw new SoulRefusal(SOUL_TEXT.petNotFound);
    return { row, ring: normaliseRing(row.soul, row.level) };
  }

  async saveRing(characterId: number, petId: number, ring: Ring): Promise<void> {
    await this.pets.updateOne({ _id: petId, characterId }, { $set: { soul: ring } });
  }

  /** Atomic plain-gold spend; null when the balance is short. */
  async spendGold(characterId: number, amount: number): Promise<number | null> {
    const doc = await this.chars.findOneAndUpdate(
      { _id: characterId, gold: { $gte: amount } }, { $inc: { gold: -amount } }, { new: true, projection: { gold: 1 } },
    ).lean();
    return doc ? (doc.gold ?? 0) : null;
  }

  async refundGold(characterId: number, amount: number): Promise<void> {
    await this.chars.updateOne({ _id: characterId }, { $inc: { gold: amount } });
  }

  /** The Flash gold notice after a spend (onAddMoney, then the wallet field). */
  goldPushes(characterId: number, amount: number, gold: number): Push[] {
    return [push('onAddMoney', characterId, 'gold', -amount, gold), push('onUPP', { gold })];
  }
}
