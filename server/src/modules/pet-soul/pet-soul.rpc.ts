// M12 Menh Hon RPCs (Flash names and arg order): openBag, lockSoul, soulLevelUp(index[, petId]), putInToExp(index, amount),
// transformExp(slot | maxColor, true), transformExpInPanel(tempIndex | maxColor, true), preySoul(index, quick, moneyFlag),
// exchangeSoul(soulId), putSoulToBag(tempIndex | -1, true), openPetSoulBag(petId), moveSoul(sid, newSid, petId|-1).
// Pushes: onOpenBag, onLockSoul, onSoulLevelUp, onPutInToExp, onTransformExp, onTransAllExp, onTransformExpInPanel, onTransAllExpInPanel,
// onPreySoulSingle, onPreySoulAll, onPutSoulToBag, onPutAllSoulToBag, onUpdateSoulSlot (+ onAddMoney / onUPP / onRefreshPetProp).
// exchangeSoul and openPetSoulBag answer through the reply (Flash Responder). A refusal is shown as a note, like Go.

import { Injectable } from '@nestjs/common';
import type { ExchangeSoulReply, OpenPetSoulBagReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { push, sendPushes, type Push } from '../inventory/pushes';
import { PetSoulService } from './pet-soul.service';
import { SoulDissolveService } from './soul-dissolve.service';
import { SoulPreyService } from './soul-prey.service';
import { SoulRefusal } from './soul-rules';

function integer(value: unknown, field: string, min = 1): number {
  const n = Number(value);
  if (value === null || value === '' || !Number.isInteger(n) || n < min) throw RpcException.invalidArgs(field);
  return n;
}
const truthy = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';

@Injectable()
export class PetSoulRpc {
  constructor(
    private readonly souls: PetSoulService,
    private readonly dissolve: SoulDissolveService,
    private readonly prey: SoulPreyService,
  ) {}

  /** A full bag pushes nothing; any other refusal pushes onOpenBag {index:0} (the client shows "Khong du tien"). */
  @Rpc('openBag', { requireCharacter: true, forbidInBattle: true })
  openBag(session: Session): Promise<null> {
    return this.run(session, () => this.souls.openBag(session.characterId!), (e) => (e.code === 'bagFull' ? [] : [push('onOpenBag', { index: 0 })]), false);
  }

  @Rpc('lockSoul', { requireCharacter: true, forbidInBattle: true })
  lockSoul(session: Session, args: unknown[]): Promise<null> {
    const index = integer(args[0], 'index');
    return this.run(session, () => this.souls.lock(session.characterId!, index));
  }

  @Rpc('soulLevelUp', { requireCharacter: true, forbidInBattle: true })
  soulLevelUp(session: Session, args: unknown[]): Promise<null> {
    const index = integer(args[0], 'index');
    const petId = args[1] === undefined || args[1] === null ? undefined : integer(args[1], 'petId');
    return this.run(session, () => this.souls.levelUp(session.characterId!, index, petId));
  }

  @Rpc('putInToExp', { requireCharacter: true, forbidInBattle: true })
  putInToExp(session: Session, args: unknown[]): Promise<null> {
    const index = integer(args[0], 'index');
    const amount = integer(args[1], 'amount');
    return this.run(session, () => this.souls.pourExp(session.characterId!, index, amount));
  }

  @Rpc('transformExp', { requireCharacter: true, forbidInBattle: true })
  transformExp(session: Session, args: unknown[]): Promise<null> {
    const first = integer(args[0], 'index', 0);
    return this.run(session, () => (truthy(args[1]) ? this.dissolve.dissolveAll(session.characterId!, first) : this.dissolve.dissolve(session.characterId!, first)));
  }

  @Rpc('transformExpInPanel', { requireCharacter: true, forbidInBattle: true })
  transformExpInPanel(session: Session, args: unknown[]): Promise<null> {
    const first = integer(args[0], 'index', 0);
    return this.run(session, () => (truthy(args[1]) ? this.dissolve.dissolveTempAll(session.characterId!, first) : this.dissolve.dissolveTemp(session.characterId!, first)));
  }

  /** Failures push onPreySoulSingle {type}: 2 = not enough Pha Le (PET_SOUL_S[9]), 1 = cannot divine (PET_SOUL_S[10]). */
  @Rpc('preySoul', { requireCharacter: true, forbidInBattle: true })
  preySoul(session: Session, args: unknown[]): Promise<null> {
    const index = integer(args[0], 'index', 0);
    const advanced = truthy(args[2]);
    const quick = truthy(args[1]) && !advanced;
    const cid = session.characterId!;
    return this.run(session, () => (quick ? this.prey.quick(cid) : this.prey.prey(cid, index, advanced)), (e) => [push('onPreySoulSingle', { type: e.code === 'noPoints' ? 2 : 1 })]);
  }

  @Rpc('exchangeSoul', { requireCharacter: true, forbidInBattle: true })
  exchangeSoul(session: Session, args: unknown[]): Promise<ExchangeSoulReply> {
    return this.prey.exchange(session.characterId!, integer(args[0], 'soulId'));
  }

  @Rpc('putSoulToBag', { requireCharacter: true, forbidInBattle: true })
  putSoulToBag(session: Session, args: unknown[]): Promise<null> {
    const index = integer(args[0], 'index', -1);
    return this.run(session, () => this.prey.putToBag(session.characterId!, index, index < 0 && truthy(args[1])));
  }

  @Rpc('openPetSoulBag', { requireCharacter: true, forbidInBattle: true })
  async openPetSoulBag(session: Session, args: unknown[]): Promise<OpenPetSoulBagReply | null> {
    const petId = integer(args[0], 'petId');
    try {
      return await this.souls.openPetBag(session.characterId!, petId);
    } catch (e) {
      if (!(e instanceof SoulRefusal)) throw e;
      if (e.message) session.callback('onSystemMidMsgOrNote', e.message);
      return null;
    }
  }

  @Rpc('moveSoul', { requireCharacter: true, forbidInBattle: true })
  moveSoul(session: Session, args: unknown[]): Promise<null> {
    const from = integer(args[0], 'sid');
    const to = integer(args[1], 'newSid');
    const petId = args[2] === undefined || args[2] === null ? -1 : integer(args[2], 'petId', -1);
    return this.run(session, () => this.souls.move(session.characterId!, from, to, petId));
  }

  /** Sends the pushes of a successful call; a SoulRefusal becomes a note (when it has text) plus the optional refusal pushes. */
  private async run(session: Session, fn: () => Promise<Push[]>, onRefuse?: (e: SoulRefusal) => Push[], note = true): Promise<null> {
    try {
      sendPushes(session, await fn());
    } catch (e) {
      if (!(e instanceof SoulRefusal)) throw e;
      if (note && e.message) session.callback('onSystemMidMsgOrNote', e.message);
      if (onRefuse) sendPushes(session, onRefuse(e));
    }
    return null;
  }
}
