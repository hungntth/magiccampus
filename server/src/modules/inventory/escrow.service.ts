// Escrow by row move (plan M11 decision 4): goods attached to a mail or listed on the auction keep their row (id, equipment
// rolls, star, durability) and are parked at characterId 0 / slotType ESCROW / slotIndex = itemId with an `escrowRef`
// ('mail:<id>' | 'auction:<id>'); a pet parks at characterId 0 with the same ref. Every step is ONE conditional updateOne /
// findOneAndUpdate, so nothing is ever cloned and a crash leaves goods visible in escrow (see selfCheck), never duplicated.
// Callers hold the owner's withCharLock; results are unions so each feature words its own refusals.
// API: escrowItem / releaseItem / restoreItem / destroyItem, escrowPet / releasePet / restorePet / destroyPet, destroyRef,
// refsOf, registerOwner (liveness check for the startup self-check log).

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlotType, sidOf as sidAt, type BagItem } from '@mc/shared';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { Pet } from '../pet/pet.schema';
import { CharacterFeature } from '../progression/feature.schema';
import { petTransferBlock, type PetTransferBlock } from '../pet/pet-transfer';
import { templateTable } from './bag-mapping';
import { firstFreeSlot, maxStack } from './bag-rules';
import { CharacterItem } from './character-item.schema';
import { InventoryService } from './inventory.service';

/** 'mail:<id>' or 'auction:<id>'. */
export type EscrowRef = string;

/** Bag tabs whose rows may be attached / listed: main bag, quest bag, pet item bag (legacy IsBagTab). */
const BAG_TABS: number[] = [SlotType.BAG, SlotType.QUEST_BAG, SlotType.PET_BAG];

export interface EscrowedItem {
  id: number;
  templateId: number;
  itemType: number; // ItemKind
  stackCount: number;
  isBound: boolean;
  colorCode: number;
  /** Where the row came from (for restoreItem and the sender's onDelCharactorSlot). */
  from: { slotType: number; slotIndex: number; sid: number };
}

export type EscrowItemResult = { ok: true; item: EscrowedItem } | { ok: false; reason: 'missing' | 'bound' | 'busy' };
export type ReleaseItemResult = { ok: true; changed: BagItem[]; merged: boolean } | { ok: false; reason: 'bag-full' | 'missing' };
export type EscrowPetResult = { ok: true; pet: Pet } | { ok: false; reason: 'missing' | 'busy' | PetTransferBlock };
export type ReleasePetResult = { ok: true; pet: Pet } | { ok: false; reason: 'pet-full' | 'missing' };

/** Which of the given numeric ids (the part after 'prefix:') still exist on the owning side. */
export type LiveIds = (ids: number[]) => Promise<Set<number>>;

@Injectable()
export class EscrowService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EscrowService.name);
  private readonly owners = new Map<string, LiveIds>();

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterFeature.name) private readonly features: Model<CharacterFeature>,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
  ) {}

  /** A feature that owns escrow refs ('mail', 'auction') registers how to tell which of its ids are still open. */
  registerOwner(prefix: string, live: LiveIds): void {
    this.owners.set(prefix, live);
  }

  // --- items ---

  /** Moves a whole unbound stack of a bag tab (owner `cid`) into escrow. */
  async escrowItem(cid: number, itemId: number, ref: EscrowRef): Promise<EscrowItemResult> {
    const row = await this.items.findOne({ _id: itemId, characterId: cid, slotType: { $in: BAG_TABS } }).lean();
    if (!row) return { ok: false, reason: 'missing' };
    if (row.isBound) return { ok: false, reason: 'bound' };
    const r = await this.items.updateOne(
      { _id: itemId, characterId: cid, slotType: row.slotType, slotIndex: row.slotIndex, isBound: false },
      { $set: { characterId: 0, slotType: SlotType.ESCROW, slotIndex: itemId, escrowRef: ref } },
    );
    if (r.modifiedCount !== 1) return { ok: false, reason: 'busy' };
    return {
      ok: true,
      item: {
        id: row._id, templateId: row.templateId, itemType: row.itemType, stackCount: row.stackCount, isBound: row.isBound,
        colorCode: row.colorCode, from: { slotType: row.slotType, slotIndex: row.slotIndex, sid: sidAt(row.slotType, row.slotIndex) },
      },
    };
  }

  /** The escrowed row as a wire item (tooltips); null when it is not (or no longer) in escrow under `ref`. */
  async peekItem(itemId: number, ref: EscrowRef): Promise<BagItem | null> {
    const doc = await this.items.findOne({ _id: itemId, characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref }).lean();
    if (!doc) return null;
    return (await this.inventory.mapRows([doc]))[0] ?? null;
  }

  /**
   * Delivers an escrowed row to `toCid`'s main bag: merged into a matching stack when the whole count fits, else moved to the
   * lowest free slot (equipment never stacks). `changed` are the receiver's bag slots to push.
   */
  async releaseItem(itemId: number, ref: EscrowRef, toCid: number): Promise<ReleaseItemResult> {
    const row = await this.items.findOne({ _id: itemId, characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref }).lean();
    if (!row) return { ok: false, reason: 'missing' };
    const bag = await this.items.find({ characterId: toCid, slotType: SlotType.BAG }).lean();
    const capacity = await this.inventory.capacity(toCid);
    const tpl = await this.gameData.template(templateTable(row.itemType), row.templateId);
    const limit = row.itemType === 1 ? maxStack(tpl) : 1;
    if (limit > 1) {
      const target = bag.find(
        (s) => s.templateId === row.templateId && s.itemType === row.itemType && s.isBound === row.isBound
          && s.colorCode === row.colorCode && s.stackCount + row.stackCount <= limit,
      );
      if (target && (await this.mergeInto(row, target._id, toCid, limit))) {
        return { ok: true, changed: await this.inventory.byIds(toCid, [target._id]), merged: true };
      }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const used = (attempt === 0 ? bag : await this.items.find({ characterId: toCid, slotType: SlotType.BAG }).lean()).map((s) => s.slotIndex);
      const free = firstFreeSlot(used, capacity);
      if (free < 0) return { ok: false, reason: 'bag-full' };
      try {
        const r = await this.items.updateOne(
          { _id: itemId, characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref },
          { $set: { characterId: toCid, slotType: SlotType.BAG, slotIndex: free }, $unset: { escrowRef: '' } },
        );
        if (r.modifiedCount !== 1) return { ok: false, reason: 'missing' };
        return { ok: true, changed: await this.inventory.byIds(toCid, [itemId]), merged: false };
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e; // someone took the slot: look again
      }
    }
    return { ok: false, reason: 'bag-full' };
  }

  /** Delete the escrow row first (no duplicate on a crash), then raise the target; a guard miss re-creates the row. */
  private async mergeInto(row: CharacterItem, targetId: number, toCid: number, limit: number): Promise<boolean> {
    const gone = await this.items.findOneAndDelete({ _id: row._id, characterId: 0, slotType: SlotType.ESCROW, escrowRef: row.escrowRef });
    if (!gone) return false;
    const r = await this.items.updateOne(
      { _id: targetId, characterId: toCid, slotType: SlotType.BAG, stackCount: { $lte: limit - row.stackCount } },
      { $inc: { stackCount: row.stackCount } },
    );
    if (r.modifiedCount === 1) return true;
    await this.items.create(gone.toObject());
    return false;
  }

  /** Undo of escrowItem: back to the original slot (the sender's client was not told yet); relocated when it is taken. */
  async restoreItem(item: EscrowedItem, ref: EscrowRef, cid: number): Promise<{ relocated: boolean; items: BagItem[] }> {
    try {
      const r = await this.items.updateOne(
        { _id: item.id, characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref },
        { $set: { characterId: cid, slotType: item.from.slotType, slotIndex: item.from.slotIndex }, $unset: { escrowRef: '' } },
      );
      if (r.modifiedCount === 1) return { relocated: false, items: await this.inventory.byIds(cid, [item.id]) };
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    const rel = await this.releaseItem(item.id, ref, cid);
    if (!rel.ok) this.logger.error(`restore of ${ref} item ${item.id} to ${cid} failed (${rel.reason}); the row stays in escrow`);
    return { relocated: true, items: rel.ok ? rel.changed : [] };
  }

  /** Deletes an escrowed row (system mail expiry, destroyed goods). True when a row was removed. */
  async destroyItem(itemId: number, ref: EscrowRef): Promise<boolean> {
    const r = await this.items.deleteOne({ _id: itemId, characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref });
    return r.deletedCount === 1;
  }

  /** Moves an escrowed row from one ref to another (an auction sale becoming a delivery mail). */
  async retagItem(itemId: number, from: EscrowRef, to: EscrowRef): Promise<boolean> {
    const r = await this.items.updateOne(
      { _id: itemId, characterId: 0, slotType: SlotType.ESCROW, escrowRef: from }, { $set: { escrowRef: to } },
    );
    return r.modifiedCount === 1;
  }

  // --- pets ---

  /** Parks a transferable pet (see pet-transfer.ts) of `cid` in escrow. */
  async escrowPet(cid: number, petId: number, ref: EscrowRef): Promise<EscrowPetResult> {
    const row = await this.pets.findOne({ _id: petId, characterId: cid }).lean();
    if (!row) return { ok: false, reason: 'missing' };
    // Pets in a Chien Thu Ho Ve slot stay (the caller holds the owner's lock, which the guard mutations take too).
    const guard = await this.features.findOne({ characterId: cid, featureKey: 'pet_guard' }, { state: 1 }).lean();
    const guarded = Object.values((guard?.state?.petData ?? {}) as Record<string, unknown>).some((id) => Number(id) === petId);
    const block = petTransferBlock({ binded: row.binded, state: row.state, following: row.following, equ: row.equ ?? [], guarded });
    if (block) return { ok: false, reason: block };
    const r = await this.pets.updateOne(
      { _id: petId, characterId: cid, binded: 0, state: row.state, following: false, equ: row.equ },
      { $set: { characterId: 0, escrowRef: ref } },
    );
    if (r.modifiedCount !== 1) return { ok: false, reason: 'busy' };
    return { ok: true, pet: row };
  }

  async peekPet(petId: number, ref: EscrowRef): Promise<Pet | null> {
    return this.pets.findOne({ _id: petId, characterId: 0, escrowRef: ref }).lean();
  }

  /** Gives an escrowed pet to `toCid` when it has room (petMaxNum). */
  async releasePet(petId: number, ref: EscrowRef, toCid: number): Promise<ReleasePetResult> {
    const doc = await this.chars.findById(toCid, { petMaxNum: 1 }).lean();
    const count = await this.pets.countDocuments({ characterId: toCid });
    if (count + 1 > (doc?.petMaxNum ?? 0)) return { ok: false, reason: 'pet-full' };
    const row = await this.pets.findOneAndUpdate(
      { _id: petId, characterId: 0, escrowRef: ref },
      { $set: { characterId: toCid, state: 3, following: false }, $unset: { escrowRef: '' } },
      { new: true },
    ).lean();
    return row ? { ok: true, pet: row } : { ok: false, reason: 'missing' };
  }

  /** Undo of escrowPet (the pet slot always exists: it was just vacated). */
  async restorePet(petId: number, ref: EscrowRef, cid: number): Promise<boolean> {
    const r = await this.pets.updateOne(
      { _id: petId, characterId: 0, escrowRef: ref }, { $set: { characterId: cid }, $unset: { escrowRef: '' } },
    );
    return r.modifiedCount === 1;
  }

  async destroyPet(petId: number, ref: EscrowRef): Promise<boolean> {
    const r = await this.pets.deleteOne({ _id: petId, characterId: 0, escrowRef: ref });
    return r.deletedCount === 1;
  }

  async retagPet(petId: number, from: EscrowRef, to: EscrowRef): Promise<boolean> {
    const r = await this.pets.updateOne({ _id: petId, characterId: 0, escrowRef: from }, { $set: { escrowRef: to } });
    return r.modifiedCount === 1;
  }

  // --- by ref ---

  /** Deletes everything parked under a ref; returns how many items and pets went. */
  async destroyRef(ref: EscrowRef): Promise<{ items: number; pets: number }> {
    const [i, p] = await Promise.all([
      this.items.deleteMany({ characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref }),
      this.pets.deleteMany({ characterId: 0, escrowRef: ref }),
    ]);
    return { items: i.deletedCount, pets: p.deletedCount };
  }

  /** What is parked under a ref (item ids and pet ids). */
  async refsOf(ref: EscrowRef): Promise<{ itemIds: number[]; petIds: number[] }> {
    const [i, p] = await Promise.all([
      this.items.find({ characterId: 0, slotType: SlotType.ESCROW, escrowRef: ref }, { _id: 1 }).lean(),
      this.pets.find({ characterId: 0, escrowRef: ref }, { _id: 1 }).lean(),
    ]);
    return { itemIds: i.map((x) => x._id), petIds: p.map((x) => x._id) };
  }

  // --- startup self-check (plan Q5): log escrow rows whose owning mail / listing no longer exists ---

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.selfCheck();
    } catch (e) {
      this.logger.warn(`escrow self-check failed: ${(e as Error).message}`);
    }
  }

  async selfCheck(): Promise<{ total: number; orphans: string[] }> {
    const refs = new Set<string>();
    for (const d of await this.items.find({ characterId: 0, slotType: SlotType.ESCROW }, { escrowRef: 1 }).lean()) {
      refs.add(d.escrowRef ?? '');
    }
    for (const d of await this.pets.find({ characterId: 0, escrowRef: { $exists: true } }, { escrowRef: 1 }).lean()) {
      refs.add(d.escrowRef ?? '');
    }
    const byPrefix = new Map<string, number[]>();
    const orphans: string[] = [];
    for (const ref of refs) {
      const m = /^([a-z]+):(\d+)$/.exec(ref);
      if (!m || !this.owners.has(m[1])) {
        orphans.push(ref);
        continue;
      }
      byPrefix.set(m[1], [...(byPrefix.get(m[1]) ?? []), Number(m[2])]);
    }
    for (const [prefix, ids] of byPrefix) {
      const live = await this.owners.get(prefix)!(ids);
      for (const id of ids) if (!live.has(id)) orphans.push(`${prefix}:${id}`);
    }
    if (orphans.length > 0) this.logger.warn(`escrow self-check: ${orphans.length} orphan ref(s) of ${refs.size}: ${orphans.slice(0, 20).join(', ')}`);
    else this.logger.log(`escrow self-check: ${refs.size} open ref(s), no orphans`);
    return { total: refs.size, orphans };
  }
}
