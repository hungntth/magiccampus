// M12 Luyện pet RPC surface: petStar, petStarClear, petJoin, seniorPetJoin, petXsd, petPzXsd, petXd, petEat, ensurePetEat, elementPet.
// seniorPetJoin refusals answer null + onSystemMidMsgOrNote and petEat / ensurePetEat refusals answer {msg} (Go handlers); the other
// RPCs show the note and throw.

import { Injectable } from '@nestjs/common';
import { ErrorCodes, PET_JOIN_MATERIALS, SENIOR_JOIN_MAX_SUBS, type PetGrowthReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from '../inventory/pushes';
import { PetGrowthService } from './pet-growth.service';
import { EAT_MSG } from './pet-illusion-rules';
import { PetIllusionService } from './pet-illusion.service';
import { PetJoinService } from './pet-join.service';

function id(value: unknown, field: string): number {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class PetGrowthRpc {
  constructor(
    private readonly growth: PetGrowthService,
    private readonly joining: PetJoinService,
    private readonly illusion: PetIllusionService,
  ) {}

  @Rpc('petStar', { requireCharacter: true, forbidInBattle: true })
  petStar(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    return this.run(session, () => this.growth.star(session.characterId!, id(args[0], 'petId'), id(args[1], 'starItemId'), args[2] == null ? undefined : id(args[2], 'safeItemId')));
  }

  @Rpc('petStarClear', { requireCharacter: true, forbidInBattle: true })
  petStarClear(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    return this.run(session, () => this.growth.clearStars(session.characterId!, id(args[0], 'petId'), id(args[1], 'itemId')));
  }

  @Rpc('petJoin', { requireCharacter: true, forbidInBattle: true })
  petJoin(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    if (args.length < 1 + PET_JOIN_MATERIALS) throw RpcException.invalidArgs('subs');
    const subs = args.slice(1, 1 + PET_JOIN_MATERIALS).map((v, i) => id(v, `sub${i + 1}`));
    return this.run(session, () => this.joining.join(session.characterId!, id(args[0], 'mainId'), subs));
  }

  /** Args: [main, sub1, ...], [[main, sub1, ...]] (the Flash array) or (main, [subs]). Refusals answer null + a note. */
  @Rpc('seniorPetJoin', { requireCharacter: true, forbidInBattle: true })
  async seniorPetJoin(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    const list: unknown[] = Array.isArray(args[0]) ? args[0] : [args[0], ...(Array.isArray(args[1]) ? args[1] : args.slice(1))];
    if (list.length - 1 > Math.max(...Object.values(SENIOR_JOIN_MAX_SUBS))) throw RpcException.invalidArgs('subs');
    const main = id(list[0], 'mainId');
    const subs = list.slice(1).map((v, i) => id(v, `sub${i + 1}`));
    try {
      const result = await this.joining.join(session.characterId!, main, subs, true);
      sendPushes(session, result.pushes);
      return result.reply;
    } catch (e) {
      if (!(e instanceof RpcException)) throw e;
      session.callback('onSystemMidMsgOrNote', e.message);
      return null;
    }
  }

  @Rpc('petXsd', { requireCharacter: true, forbidInBattle: true })
  petXsd(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    return this.run(session, () => this.growth.refine(session.characterId!, id(args[0], 'petId'), id(args[1], 'itemId')));
  }

  @Rpc('petPzXsd', { requireCharacter: true, forbidInBattle: true })
  petPzXsd(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    return this.run(session, () => this.growth.rebirth(session.characterId!, id(args[0], 'petId'), id(args[1], 'itemId')));
  }

  /** petEat(main, sub, luckItemId|null, luckNum, aptType, md5): the md5 is ignored. A refusal replies {msg} (both pet seats stay filled). */
  @Rpc('petEat', { requireCharacter: true, forbidInBattle: true })
  petEat(session: Session, args: unknown[]): Promise<PetGrowthReply> {
    return this.eatReply(session, () => {
      const luck = args[2] === null || args[2] === undefined ? null : Number(args[2]);
      return this.illusion.eat(
        session.characterId!, id(args[0], 'petId'), id(args[1], 'costPetId'), luck !== null && Number.isInteger(luck) && luck > 0 ? luck : null,
        Math.max(0, Math.trunc(Number(args[3])) || 0), Number(args[4]),
      );
    });
  }

  @Rpc('ensurePetEat', { requireCharacter: true, forbidInBattle: true })
  ensurePetEat(session: Session, args: unknown[]): Promise<PetGrowthReply> {
    return this.eatReply(session, () => this.illusion.ensureEat(session.characterId!, id(args[0], 'petId')));
  }

  @Rpc('petXd', { requireCharacter: true, forbidInBattle: true })
  petXd(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    return this.run(session, () => this.growth.resetPoints(session.characterId!, id(args[0], 'petId'), id(args[1], 'itemId')));
  }

  @Rpc('elementPet', { requireCharacter: true, forbidInBattle: true })
  elementPet(session: Session, args: unknown[]): Promise<PetGrowthReply | null> {
    return this.run(session, () => this.growth.element(session.characterId!, id(args[0], 'petId'), Number(args[1])));
  }

  private async eatReply(session: Session, call: () => Promise<{ reply: PetGrowthReply; pushes: Parameters<typeof sendPushes>[1] }>): Promise<PetGrowthReply> {
    try {
      const result = await call();
      sendPushes(session, result.pushes);
      return result.reply;
    } catch (e) {
      if (!(e instanceof RpcException)) throw e;
      return { msg: e.code === ErrorCodes.INVALID_ARGS ? EAT_MSG.default : e.message };
    }
  }

  private async run(session: Session, call: () => ReturnType<PetGrowthService['star']>): Promise<PetGrowthReply | null> {
    return midNoteOnFail(session, async () => {
      const result = await call();
      sendPushes(session, result.pushes);
      return result.reply;
    });
  }
}
