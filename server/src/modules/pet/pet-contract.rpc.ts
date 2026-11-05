// M12 Khe Uoc RPCs: contractPet(type, autoBuy), contractPetTen(type, autoBuy), ensureBuyContractPet(type). Replies {type, newLvl,
// newExp} (Flash Responders onContractPet / onContractPetTen). Short of stones with autoBuy, contractPet pushes
// onEnsureBuyContract(gold) and replies null; the client confirm calls ensureBuyContractPet. Refusals show a note and throw.

import { Injectable } from '@nestjs/common';
import type { PetContractReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from '../inventory/pushes';
import { PetContractService, type ContractMode } from './pet-contract.service';

const truthy = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1';

@Injectable()
export class PetContractRpc {
  constructor(private readonly contracts: PetContractService) {}

  @Rpc('contractPet', { requireCharacter: true, forbidInBattle: true })
  one(session: Session, args: unknown[]): Promise<PetContractReply | null> {
    return this.run(session, args, 'one', truthy(args[1]));
  }

  @Rpc('contractPetTen', { requireCharacter: true, forbidInBattle: true })
  ten(session: Session, args: unknown[]): Promise<PetContractReply | null> {
    return this.run(session, args, 'ten', truthy(args[1]));
  }

  @Rpc('ensureBuyContractPet', { requireCharacter: true, forbidInBattle: true })
  ensure(session: Session, args: unknown[]): Promise<PetContractReply | null> {
    return this.run(session, args, 'ensure', true);
  }

  private run(session: Session, args: unknown[], mode: ContractMode, autoBuy: boolean): Promise<PetContractReply | null> {
    const type = Number(args[0]);
    if (!Number.isInteger(type) || type < 1 || type > 4) throw RpcException.invalidArgs('type');
    return midNoteOnFail(session, async () => {
      const out = await this.contracts.run(session.characterId!, type, autoBuy, mode);
      if (out.kind === 'confirm') {
        session.callback('onEnsureBuyContract', out.money);
        return null;
      }
      sendPushes(session, out.pushes);
      return out.reply;
    });
  }
}
