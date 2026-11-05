// M12 Tu Linh Bao Thach RPCs: initPetStonePanel, composePetStone, absorbPetStone, resolvePetStone, getPetStoneByEid,
// petStoneSet, removePetStone, changePetStoneEnergy (Flash names and arg order). A refusal (PetStoneRefusal) is shown as
// onSystemMidMsgOrNote and answered with the unchanged state (bag / hole / -1 / null), like the Go handler.
// Push: updatePetStoneBagData(bag) from PetStoneService.grant.

import { Injectable } from '@nestjs/common';
import type { PetStoneBag, PetStoneEnergyReply, PetStoneHoleWire, PetStoneSetReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { PetStoneInlayService } from './pet-stone-inlay.service';
import { PetStoneRefusal } from './pet-stone-rules';
import { PetStoneService } from './pet-stone.service';

function integer(value: unknown, field: string, min = 0): number {
  const n = Number(value);
  if (value === null || value === '' || !Number.isInteger(n) || n < min) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class PetStoneRpc {
  constructor(private readonly stones: PetStoneService, private readonly inlay: PetStoneInlayService) {}

  @Rpc('initPetStonePanel', { requireCharacter: true })
  init(session: Session): Promise<PetStoneBag> { return this.stones.open(session); }

  @Rpc('composePetStone', { requireCharacter: true, forbidInBattle: true })
  compose(session: Session, args: unknown[]): Promise<PetStoneBag> {
    const sid = integer(args[0], 'sid');
    const qty = integer(args[1], 'qty', 1);
    return this.guard(session, () => this.stones.compose(session, sid, qty), () => this.stones.bag(session.characterId!));
  }

  @Rpc('absorbPetStone', { requireCharacter: true, forbidInBattle: true })
  absorb(session: Session, args: unknown[]): Promise<PetStoneBag> {
    if (!Array.isArray(args[0])) throw RpcException.invalidArgs('sids');
    const sids = args[0].map((v) => integer(v, 'sids'));
    return this.guard(session, () => this.stones.absorb(session.characterId!, sids), () => this.stones.bag(session.characterId!));
  }

  @Rpc('resolvePetStone', { requireCharacter: true, forbidInBattle: true })
  resolve(session: Session, args: unknown[]): Promise<PetStoneBag> {
    const sid = integer(args[0], 'sid');
    const qty = integer(args[1], 'num', 1);
    return this.guard(session, () => this.stones.resolve(session, sid, qty), () => this.stones.bag(session.characterId!));
  }

  @Rpc('getPetStoneByEid', { requireCharacter: true })
  holes(session: Session, args: unknown[]): Promise<PetStoneHoleWire | -1> {
    const itemId = integer(args[0], 'itemId', 1);
    return this.guard<PetStoneHoleWire | -1>(session, () => this.inlay.holesOf(session.characterId!, itemId), async () => -1);
  }

  @Rpc('petStoneSet', { requireCharacter: true, forbidInBattle: true })
  set(session: Session, args: unknown[]): Promise<PetStoneSetReply> {
    const itemId = integer(args[0], 'itemId', 1);
    const hole = integer(args[1], 'hole');
    const sid = integer(args[2], 'sid');
    return this.guard(session, () => this.inlay.set(session.characterId!, itemId, hole, sid), () => this.inlay.current(session.characterId!, itemId, hole));
  }

  @Rpc('removePetStone', { requireCharacter: true, forbidInBattle: true })
  remove(session: Session, args: unknown[]): Promise<PetStoneSetReply> {
    const itemId = integer(args[0], 'itemId', 1);
    const hole = integer(args[1], 'hole');
    return this.guard(session, () => this.inlay.remove(session.characterId!, itemId, hole), () => this.inlay.current(session.characterId!, itemId, hole));
  }

  /** Flash order (sid, cid, type): the stone slot is args[0], the skill type args[2]. */
  @Rpc('changePetStoneEnergy', { requireCharacter: true, forbidInBattle: true })
  energy(session: Session, args: unknown[]): Promise<PetStoneEnergyReply | null> {
    const sid = integer(args[0], 'sid');
    const type = integer(args[2], 'type');
    return this.guard<PetStoneEnergyReply | null>(session, () => this.inlay.changeEnergy(session, sid, type), async () => null);
  }

  private async guard<T>(session: Session, run: () => Promise<T>, unchanged: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof PetStoneRefusal)) throw e;
      session.callback('onSystemMidMsgOrNote', e.message);
      return unchanged();
    }
  }
}
