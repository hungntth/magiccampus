// M12 guard / talent RPCs (Flash names verbatim). Guard RPCs reply the new {lvData, petData} and also send the legacy onUpdatePetGuardData;
// talent RPCs reply the Flash shapes (slot delta {sid: tid}, bag delta {a, d}, full bag for arrange) and send the legacy
// onFillOrTakeOffTalentStone / onMoveStoneBagToBag pushes. Flash sends the stone lists as pipe strings ("5|6|7"): arrays are accepted too.
// Refusals show a note (onSystemMidMsgOrNote) and fail the call; calls remain un-quieted.

import { Injectable } from '@nestjs/common';
import type { PetGuardData, PetTalentData, TalentBagDelta, TalentSlotDelta, TalentStonePush } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from '../inventory/pushes';
import { PetGuardService, type GuardOutcome } from './pet-guard.service';
import { PetTalentService, type TalentOutcome } from './pet-talent.service';
import type { TalentBag } from './talent-bag';

const int = (v: unknown, name: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
};
const truthy = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1';
/** "1|2|3" (Flash) or [1, 2, 3]. */
function ints(v: unknown, name: string): number[] {
  const parts: unknown[] | null = typeof v === 'string' ? v.split('|') : Array.isArray(v) ? v : null;
  if (!parts) throw RpcException.invalidArgs(name);
  return parts.map((p) => int(p, name));
}

@Injectable()
export class PetBoostRpc {
  constructor(private readonly guard: PetGuardService, private readonly talent: PetTalentService) {}

  private async guarded(s: Session, run: () => Promise<GuardOutcome>): Promise<PetGuardData> {
    const out = await midNoteOnFail(s, run);
    sendPushes(s, out.pushes);
    return out.state;
  }

  private async talented<T>(s: Session, run: () => Promise<TalentOutcome<T>>): Promise<T> {
    const out = await midNoteOnFail(s, run);
    sendPushes(s, out.pushes);
    return out.reply;
  }

  @Rpc('getPetGuardData', { requireCharacter: true })
  getGuard(s: Session): Promise<PetGuardData> {
    return this.guarded(s, () => this.guard.get(s.characterId!));
  }

  @Rpc('movePetToPetGuardSid', { requireCharacter: true, forbidInBattle: true })
  move(s: Session, a: unknown[]): Promise<PetGuardData> {
    const petId = int(a[0], 'petId');
    const sid = int(a[1], 'sid');
    return this.guarded(s, () => this.guard.move(s.characterId!, petId, sid));
  }

  @Rpc('putDownPet', { requireCharacter: true, forbidInBattle: true })
  putDown(s: Session, a: unknown[]): Promise<PetGuardData> {
    const sid = int(a[0], 'sid');
    return this.guarded(s, () => this.guard.remove(s.characterId!, sid));
  }

  @Rpc('upGuardSid', { requireCharacter: true, forbidInBattle: true })
  upGuard(s: Session, a: unknown[]): Promise<PetGuardData> {
    const sid = int(a[0], 'sid');
    const costType = int(a[1] ?? 2, 'costType');
    return this.guarded(s, () => this.guard.upgrade(s.characterId!, sid, costType));
  }

  @Rpc('initTalentPanelData', { requireCharacter: true })
  panel(s: Session): Promise<PetTalentData> {
    return this.talent.state(s.characterId!);
  }

  @Rpc('upTalentSlotLv', { requireCharacter: true, forbidInBattle: true })
  upSlot(s: Session, a: unknown[]): Promise<TalentSlotDelta> {
    const sid = int(a[0], 'sid');
    return this.talented(s, () => this.talent.upgradeSlot(s.characterId!, sid, truthy(a[1])));
  }

  @Rpc('fillTalentStone', { requireCharacter: true, forbidInBattle: true })
  fill(s: Session, a: unknown[]): Promise<TalentStonePush> {
    const [bagSlot, socketSid, tid] = [int(a[0], 'bagSlot'), int(a[1], 'socketSid'), int(a[2], 'tid')];
    return this.talented(s, () => this.talent.fill(s.characterId!, bagSlot, socketSid, tid));
  }

  @Rpc('takeOffTalentStone', { requireCharacter: true, forbidInBattle: true })
  takeOff(s: Session, a: unknown[]): Promise<TalentStonePush> {
    const [socketSid, bagSlot, tid] = [int(a[0], 'socketSid'), int(a[1], 'bagSlot'), int(a[2], 'tid')];
    return this.talented(s, () => this.talent.takeOff(s.characterId!, socketSid, bagSlot, tid));
  }

  @Rpc('moveStoneBagToBag', { requireCharacter: true, forbidInBattle: true })
  moveStone(s: Session, a: unknown[]): Promise<TalentBagDelta> {
    const [from, to] = [int(a[0], 'from'), int(a[1], 'to')];
    return this.talented(s, () => this.talent.moveStone(s.characterId!, from, to));
  }

  @Rpc('arrangeTalentBag', { requireCharacter: true, forbidInBattle: true })
  arrange(s: Session): Promise<TalentBag> {
    return this.talented(s, () => this.talent.arrange(s.characterId!));
  }

  @Rpc('breakTalentStone', { requireCharacter: true, forbidInBattle: true })
  breakStone(s: Session, a: unknown[]): Promise<TalentBagDelta> {
    const [slot, tid, count] = [int(a[0], 'slot'), int(a[1], 'tid'), int(a[2], 'count')];
    return this.talented(s, () => this.talent.breakStone(s.characterId!, slot, tid, count));
  }

  /** resetTalentSlot(tids "t1|t2", slots "s1|s2"): Flash sends the stone ids first. */
  @Rpc('resetTalentSlot', { requireCharacter: true, forbidInBattle: true })
  reset(s: Session, a: unknown[]): Promise<TalentBagDelta> {
    const [tids, slots] = [ints(a[0], 'tids'), ints(a[1], 'slots')];
    return this.talented(s, () => this.talent.reset(s.characterId!, tids, slots));
  }

  /** upTalentStone(slots "s1|..|s5", tids "t1|..|t5", useDirectionItem): Flash sends the bag slots first. */
  @Rpc('upTalentStone', { requireCharacter: true, forbidInBattle: true })
  fuse(s: Session, a: unknown[]): Promise<TalentBagDelta> {
    const [slots, tids] = [ints(a[0], 'slots'), ints(a[1], 'tids')];
    return this.talented(s, () => this.talent.fuse(s.characterId!, slots, tids, truthy(a[2])));
  }
}
