// Pet management RPCs (phase A): initViewPetMngP, changePetState, changePetName, delPetByClient, bindedPetByPlayer,
// changePetProperty, startPetFollow, cancelPetFollow (map broadcast onCancelPet/onCreatePet). Pushes (self): onUpdatePet(petId, key, value), onRefreshPetProp(petId, property), onDelPet(petId),
// onSystemMidMsgOrNote. The Flash client calls the mutating ones fire-and-forget, so failures are shown as notes.

import { Injectable } from '@nestjs/common';
import type { InitViewPetMngPResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes, type Push } from '../inventory/pushes';
import { PetFollowService } from './pet-follow.service';
import { PetService } from './pet.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class PetRpc {
  constructor(
    private readonly pets: PetService,
    private readonly follow: PetFollowService,
  ) {}

  /** Every pet as `{[id]: {id, data}}` (the Flash panel reads this once at login). */
  @Rpc('initViewPetMngP', { requireCharacter: true })
  initViewPetMngP(session: Session): Promise<InitViewPetMngPResult> {
    return this.pets.listWrapped(session.characterId!);
  }

  @Rpc('changePetState', { requireCharacter: true, forbidInBattle: true })
  changePetState(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    const state = intArg(args[1], 'state');
    return this.run(session, () => this.pets.setState(session.characterId!, petId, state));
  }

  @Rpc('changePetName', { requireCharacter: true, forbidInBattle: true })
  changePetName(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    return this.run(session, () => this.pets.rename(session.characterId!, petId, args[1]));
  }

  /** (petId[, md5 password]): the password is ignored in H5. */
  @Rpc('delPetByClient', { requireCharacter: true, forbidInBattle: true })
  delPetByClient(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    return this.run(session, () => this.pets.release(session.characterId!, petId));
  }

  @Rpc('bindedPetByPlayer', { requireCharacter: true, forbidInBattle: true })
  bindedPetByPlayer(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    return this.run(session, () => this.pets.bind(session.characterId!, petId));
  }

  @Rpc('changePetProperty', { requireCharacter: true, forbidInBattle: true })
  changePetProperty(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    return this.run(session, () => this.pets.changeProperty(session.characterId!, petId, args[1]));
  }

  /** (petId, currentShowPetId): truthy reply makes the client show the cancel button. */
  @Rpc('startPetFollow', { requireCharacter: true, forbidInBattle: true })
  startPetFollow(session: Session, args: unknown[]): Promise<true> {
    return this.follow.start(session.characterId!, intArg(args[0], 'petId'));
  }

  /** (showPetId): clears the following pet. */
  @Rpc('cancelPetFollow', { requireCharacter: true })
  cancelPetFollow(session: Session): Promise<true> {
    return this.follow.cancel(session.characterId!);
  }

  private run(session: Session, fn: () => Promise<Push[]>): Promise<null> {
    return midNoteOnFail(session, async () => {
      sendPushes(session, await fn());
      return null;
    });
  }
}
