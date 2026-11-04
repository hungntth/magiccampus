// Mount RPCs (Flash names): getMountList, checkHaveMount, renewMount(dressId), addMountExp(mode), addMountUpExp, beginMounting(dressId), stopMounting.
// Pushes: onAddMountExp, onUpdateDressList (to the caller), onMountOn / onMountOff (map broadcast).

import { Injectable } from '@nestjs/common';
import type { AddMountExpReply, AddMountUpExpReply, MountListReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { MountService } from './mount.service';

function intArg(args: unknown[], i: number, name: string): number {
  const n = Number(args[i]);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class MountRpc {
  constructor(private readonly mount: MountService) {}

  @Rpc('getMountList', { requireCharacter: true })
  getMountList(session: Session): Promise<MountListReply> {
    return this.mount.list(session.characterId!);
  }

  @Rpc('checkHaveMount', { requireCharacter: true })
  checkHaveMount(session: Session): Promise<number> {
    return this.mount.check(session.characterId!);
  }

  @Rpc('renewMount', { requireCharacter: true, forbidInBattle: true })
  renewMount(session: Session, args: unknown[]): Promise<number> {
    return this.mount.renew(session, intArg(args, 0, 'dressId'));
  }

  @Rpc('addMountExp', { requireCharacter: true, forbidInBattle: true })
  addMountExp(session: Session, args: unknown[]): Promise<AddMountExpReply> {
    return this.mount.feed(session, intArg(args, 0, 'mode'));
  }

  @Rpc('addMountUpExp', { requireCharacter: true, forbidInBattle: true })
  addMountUpExp(session: Session): Promise<AddMountUpExpReply> {
    return this.mount.evolve(session);
  }

  @Rpc('beginMounting', { requireCharacter: true, forbidInBattle: true })
  beginMounting(session: Session, args: unknown[]): Promise<null> {
    return this.mount.begin(session, intArg(args, 0, 'dressId'));
  }

  @Rpc('stopMounting', { requireCharacter: true, forbidInBattle: true })
  stopMounting(session: Session): Promise<null> {
    return this.mount.stop(session);
  }
}
