// Pet skill / equipment / slot RPCs (phase E): petOpenSkill, petBook (awaited, reply {f, rf?, n?}), petDelSkill, petEquipOn,
// petEquipOff, petOpenSlot. Pushes (self): onUPP, onAddCharactorSlot / onDelCharactorSlot, onPetSkillInfo, onUpdatePet,
// onRefreshPetProp, onPetEquipOn / onPetEquipOff, onBlueMsg, onSystemMidMsgOrNote. The Flash client calls all but
// petBook fire-and-forget, so failures are shown as notes.

import { Injectable } from '@nestjs/common';
import type { PetBookReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes, type Push } from '../inventory/pushes';
import { PetEquipService } from './pet-equip.service';
import { PetSkillService } from './pet-skill.service';
import { PetSlotService } from './pet-slot.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class PetGearRpc {
  constructor(
    private readonly skills: PetSkillService,
    private readonly equip: PetEquipService,
    private readonly slots: PetSlotService,
  ) {}

  @Rpc('petOpenSkill', { requireCharacter: true, forbidInBattle: true })
  petOpenSkill(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    const slot = intArg(args[1], 'slot');
    return this.run(session, () => this.skills.openSkill(session.characterId!, petId, slot));
  }

  /** Awaited by the Flash client: {f: 1 done / nothing changed, 2 book or skill problem, 3 bad input, rf, n = books left}. */
  @Rpc('petBook', { requireCharacter: true, forbidInBattle: true })
  async petBook(session: Session, args: unknown[]): Promise<PetBookReply> {
    const petId = Number(args[0]);
    const bookId = Number(args[1]);
    if (!Number.isInteger(petId) || !Number.isInteger(bookId)) return { f: 3 };
    try {
      const res = await this.skills.learnBook(session.characterId!, petId, bookId);
      sendPushes(session, res.pushes);
      return res.reply;
    } catch (e) {
      if (!(e instanceof RpcException)) throw e;
      session.callback('onSystemMidMsgOrNote', e.message);
      return { f: 3 };
    }
  }

  /** (petId, slot[, md5 password]): the password is ignored in H5. */
  @Rpc('petDelSkill', { requireCharacter: true, forbidInBattle: true })
  petDelSkill(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    const slot = intArg(args[1], 'slot');
    return this.run(session, () => this.skills.delSkill(session.characterId!, petId, slot));
  }

  @Rpc('petEquipOn', { requireCharacter: true, forbidInBattle: true })
  petEquipOn(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    const itemId = intArg(args[1], 'itemId');
    return this.run(session, () => this.equip.equipOn(session.characterId!, petId, itemId));
  }

  @Rpc('petEquipOff', { requireCharacter: true, forbidInBattle: true })
  petEquipOff(session: Session, args: unknown[]): Promise<null> {
    const petId = intArg(args[0], 'petId');
    const itemId = intArg(args[1], 'itemId');
    return this.run(session, () => this.equip.equipOff(session.characterId!, petId, itemId));
  }

  @Rpc('petOpenSlot', { requireCharacter: true, forbidInBattle: true })
  petOpenSlot(session: Session): Promise<null> {
    return this.run(session, () => this.slots.openSlot(session.characterId!));
  }

  private run(session: Session, fn: () => Promise<Push[]>): Promise<null> {
    return midNoteOnFail(session, async () => {
      sendPushes(session, await fn());
      return null;
    });
  }
}
