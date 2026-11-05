// Hộ Vệ + Thiên Phú flows (legacy PetGuardPanel / PetTalentPanel): owns both windows, every RPC of them (getPetGuardData is not
// needed: login carries petGuardData) -- movePetToPetGuardSid, putDownPet, upGuardSid, initTalentPanelData, upTalentSlotLv,
// fillTalentStone, takeOffTalentStone, moveStoneBagToBag, arrangeTalentBag, breakTalentStone, resetTalentSlot, upTalentStone -- and
// the pushes onUpdatePetGuardData / onFillOrTakeOffTalentStone / onMoveStoneBagToBag. Replies are merged into PlayerData.

import {
  ItemKind, SlotType, TALENT_DIRECTION_ITEM,
  type PetGuardData, type PetTalentData, type PetView, type PlayerData, type TalentBagDelta, type TalentBagEntry, type TalentSlotDelta,
  type TalentStonePush,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import type { GuardActions, GuardHost, TalentActions, TalentHost } from '../ui/petboost/boostTypes';
import { GuardWindow } from '../ui/petboost/guardWindow';
import { TalentWindow } from '../ui/petboost/talentWindow';
import { applyBagDelta, applyStonePush } from '../ui/petboost/talentRules';
import { emptyGuardData } from '../ui/petboost/guardRules';
import type { BagController } from './BagController';

export interface PetBoostControllerHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
  pets(): PetView[];
}

const emptyTalent = (): PetTalentData => ({ tal: {}, inTal: {}, b: {} });
/** "5|6|7" pipe string the Flash client sends for stone lists. */
const pipe = (list: readonly number[]): string => list.join('|');

export class PetBoostController {
  private readonly guardWin: GuardWindow;
  private readonly talentWin: TalentWindow;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: PetBoostControllerHost) {
    const guardHost: GuardHost = {
      actions: this.guardActions(), pets: () => host.pets(), data: () => host.player.petGuardData ?? emptyGuardData(), player: () => host.player,
    };
    const talentHost: TalentHost = {
      actions: this.talentActions(), data: () => host.player.petTalentInfo ?? emptyTalent(), player: () => host.player,
      directionCount: () => host.bag.list()
        .filter((i) => i.itemType === ItemKind.ITEM && i.slotType === SlotType.BAG && i.tid === TALENT_DIRECTION_ITEM)
        .reduce((n, i) => n + i.stackNum, 0),
    };
    this.guardWin = new GuardWindow(guardHost, () => this.guardWin.close());
    this.talentWin = new TalentWindow(talentHost, () => this.talentWin.close());
    const c = host.client;
    this.offs.push(
      host.bag.subscribe(() => this.refresh()),
      c.on('onUpdatePetGuardData', (d) => this.setGuard(d as PetGuardData)),
      c.on('onFillOrTakeOffTalentStone', (d) => this.setTalent((t) => applyStonePush(t, d as TalentStonePush))),
      c.on('onMoveStoneBagToBag', (d) => this.setTalent((t) => ({ ...t, b: applyBagDelta(t.b, d as TalentBagDelta) }))),
    );
  }

  openGuard(): void {
    this.guardWin.show();
  }

  openTalent(): void {
    this.talentWin.show();
  }

  /** Pets, bag or wallet changed: redraw whatever is open. */
  refresh(): void {
    if (this.guardWin.isOpen) this.guardWin.refresh();
    if (this.talentWin.isOpen) this.talentWin.refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.guardWin.close();
    this.talentWin.close();
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T | null> {
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch {
      return null; // the refusal note was pushed by the server
    }
  }

  private setGuard(state: PetGuardData): PetGuardData {
    this.host.player.petGuardData = state;
    this.refresh();
    return state;
  }

  /** Applies `fn` to the talent state (the push and the reply of one call carry the same absolute delta, so applying twice is safe). */
  private setTalent(fn: (t: PetTalentData) => PetTalentData): void {
    this.host.player.petTalentInfo = fn(this.host.player.petTalentInfo ?? emptyTalent());
    this.refresh();
  }

  private async delta<T>(reply: Promise<T | null>, merge: (t: PetTalentData, r: T) => PetTalentData): Promise<T | null> {
    const r = await reply;
    if (r) this.setTalent((t) => merge(t, r));
    return r;
  }

  private async guarded(reply: Promise<PetGuardData | null>): Promise<PetGuardData | null> {
    const r = await reply;
    return r ? this.setGuard(r) : null;
  }

  private guardActions(): GuardActions {
    return {
      place: (petId, sid) => this.guarded(this.call<PetGuardData>('movePetToPetGuardSid', petId, sid)),
      putDown: (sid) => this.guarded(this.call<PetGuardData>('putDownPet', sid)),
      upgrade: (sid, costType) => this.guarded(this.call<PetGuardData>('upGuardSid', sid, costType)),
    };
  }

  private talentActions(): TalentActions {
    const bagMerge = (t: PetTalentData, r: TalentBagDelta): PetTalentData => ({ ...t, b: applyBagDelta(t.b, r) });
    return {
      load: async () => {
        const r = await this.call<PetTalentData>('initTalentPanelData');
        if (r) this.setTalent(() => ({ tal: r.tal ?? {}, inTal: r.inTal ?? {}, b: r.b ?? {} }));
        return r;
      },
      upSlot: (sid, useGold) => this.delta(this.call<TalentSlotDelta>('upTalentSlotLv', sid, useGold), (t, r) => ({ ...t, tal: { ...t.tal, ...r } })),
      fill: (bagSlot, socketSid, tid) => this.delta(this.call<TalentStonePush>('fillTalentStone', bagSlot, socketSid, tid), applyStonePush),
      takeOff: (socketSid, bagSlot, tid) => this.delta(this.call<TalentStonePush>('takeOffTalentStone', socketSid, bagSlot, tid), applyStonePush),
      move: (from, to) => this.delta(this.call<TalentBagDelta>('moveStoneBagToBag', from, to), bagMerge),
      arrange: () => this.delta(this.call<Record<string, TalentBagEntry>>('arrangeTalentBag'), (t, b) => ({ ...t, b })),
      breakStone: (slot, tid, count) => this.delta(this.call<TalentBagDelta>('breakTalentStone', slot, tid, count), bagMerge),
      // Flash order: resetTalentSlot(tids, slots), upTalentStone(slots, tids, useDirectionItem), both as pipe strings.
      reset: (slots, tids) => this.delta(this.call<TalentBagDelta>('resetTalentSlot', pipe(tids), pipe(slots)), bagMerge),
      fuse: (slots, tids, direction) => this.delta(this.call<TalentBagDelta>('upTalentStone', pipe(slots), pipe(tids), direction), bagMerge),
    };
  }
}
