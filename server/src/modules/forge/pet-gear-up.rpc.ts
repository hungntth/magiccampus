// Pet gear upgrade RPCs (Flash names, EquiptFuncPanel pet tabs): petEquLevelUp, petEquModColor, petEquModBind, surepetEquModBind,
// petEquModPre, surePetEquModPre, sublimePetEquip, onValidateSublimePet, restrainPetEquip, onValidateRestrainPet, repairPetEqu,
// repairPetEquAll. Pushes (self): onAddCharactorSlot / onDelCharactorSlot, onChangeEquiptInst, onUPP, onRefreshPetProp,
// onSystemMidMsgOrNote, validateRestrainPet(equipId, element) (the Yes button calls onValidateRestrainPet). Logic in the services.

import { Injectable } from '@nestjs/common';
import type {
  PetEquBindPreview, PetEquLevelUpReply, PetEquModColorReply, PetEquPrePreview, PetEquSublimeReply, RepairReply, SurePetEquBindReply,
  SurePetEquPreReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes, midNoteOnFail } from '../inventory/pushes';
import { guarded, idArg } from './forge-guard';
import { PetGearModService } from './pet-gear-mod.service';
import { PetGearRepairService } from './pet-gear-repair.service';
import { PetGearUpService } from './pet-gear-up.service';
import { PET_EQU_TEXT } from './pet-gear-up-rules';
import type { Out } from './refine.service';
import { SublimeService } from './sublime.service';

const flexBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';
/** Optional slot id argument (the Flash client sends NaN / null when the stack slot is empty). */
const optionalId = (v: unknown): number => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const decisionOf = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs('decision');
  return n;
};

@Injectable()
export class PetGearUpRpc {
  constructor(
    private readonly up: PetGearUpService,
    private readonly mods: PetGearModService,
    private readonly sublimes: SublimeService,
    private readonly repairs: PetGearRepairService,
  ) {}

  /** (equipId, shardStackId): the stack argument is only a UI hint, shards are taken by template. Refusal -> {flag:false, msg}. */
  @Rpc('petEquLevelUp', { requireCharacter: true, forbidInBattle: true })
  async petEquLevelUp(session: Session, args: unknown[]): Promise<PetEquLevelUpReply> {
    const equipId = optionalId(args[0]);
    if (equipId === 0) return { flag: false, msg: PET_EQU_TEXT.invalid };
    return this.reply(session, { flag: false, msg: PET_EQU_TEXT.invalid }, () => this.up.levelUp(session.characterId!, equipId));
  }

  @Rpc('petEquModColor', { requireCharacter: true, forbidInBattle: true })
  async petEquModColor(session: Session, args: unknown[]): Promise<PetEquModColorReply> {
    const equipId = optionalId(args[0]);
    if (equipId === 0) return { flag: false, num: 0, msg: PET_EQU_TEXT.invalid };
    return this.reply(session, { flag: false, num: 0, msg: PET_EQU_TEXT.invalid }, () => this.up.modColor(session.characterId!, equipId));
  }

  @Rpc('petEquModBind', { requireCharacter: true, forbidInBattle: true })
  petEquModBind(session: Session, args: unknown[]): Promise<PetEquBindPreview> {
    const [equipId, materialId] = [idArg(args[0], 'equipId'), idArg(args[1], 'material')];
    return this.send<PetEquBindPreview>(session, { f: false }, () => this.mods.bindPreview(session.characterId!, equipId, materialId));
  }

  @Rpc('surepetEquModBind', { requireCharacter: true, forbidInBattle: true })
  surepetEquModBind(session: Session, args: unknown[]): Promise<SurePetEquBindReply> {
    const decision = decisionOf(args[0]);
    return this.send<SurePetEquBindReply>(session, { f: 'false' }, () => this.mods.sureBind(session.characterId!, decision));
  }

  @Rpc('petEquModPre', { requireCharacter: true, forbidInBattle: true })
  petEquModPre(session: Session, args: unknown[]): Promise<PetEquPrePreview> {
    const [equipId, materialId] = [idArg(args[0], 'equipId'), idArg(args[1], 'material')];
    return this.send<PetEquPrePreview>(session, { f: false }, () => this.mods.prePreview(session.characterId!, equipId, materialId));
  }

  @Rpc('surePetEquModPre', { requireCharacter: true, forbidInBattle: true })
  surePetEquModPre(session: Session, args: unknown[]): Promise<SurePetEquPreReply> {
    const decision = decisionOf(args[0]);
    return this.send<SurePetEquPreReply>(session, { f: 'false' }, () => this.mods.surePre(session.characterId!, decision));
  }

  /** (equipId, dustStackId|NaN, autoBuy): answers {itemId, flagStr, num}; a refusal shows a note and answers null (the client ignores it). */
  @Rpc('sublimePetEquip', { requireCharacter: true, forbidInBattle: true })
  sublimePetEquip(session: Session, args: unknown[]): Promise<PetEquSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    return this.send<PetEquSublimeReply | null>(session, null, () => this.sublimes.sublime(session.characterId!, equipId, optionalId(args[1]), flexBool(args[2])));
  }

  /** The Yes of the "buy dust with gold" alert: (equipId, dustStackId), always autoBuy. */
  @Rpc('onValidateSublimePet', { requireCharacter: true, forbidInBattle: true })
  onValidateSublimePet(session: Session, args: unknown[]): Promise<PetEquSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    return this.send<PetEquSublimeReply | null>(session, null, () => this.sublimes.sublime(session.characterId!, equipId, optionalId(args[1]), true));
  }

  /** (equipId, dustStackId|NaN, element 1..6, autoBuy). */
  @Rpc('restrainPetEquip', { requireCharacter: true, forbidInBattle: true })
  restrainPetEquip(session: Session, args: unknown[]): Promise<PetEquSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    const element = Number(args[2]);
    return this.send<PetEquSublimeReply | null>(session, null,
      () => this.sublimes.restrain(session.characterId!, equipId, optionalId(args[1]), element, flexBool(args[3]), false));
  }

  /** The Yes of validateRestrainPet: (equipId, element), pays the gold price. */
  @Rpc('onValidateRestrainPet', { requireCharacter: true, forbidInBattle: true })
  onValidateRestrainPet(session: Session, args: unknown[]): Promise<PetEquSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    const element = Number(args[1]);
    return this.send<PetEquSublimeReply | null>(session, null, () => this.sublimes.restrain(session.characterId!, equipId, 0, element, true, true));
  }

  /** (petId, itemId, type): Go ignores the pet id and the type. */
  @Rpc('repairPetEqu', { requireCharacter: true, forbidInBattle: true })
  repairPetEqu(session: Session, args: unknown[]): Promise<RepairReply> {
    const itemId = idArg(args[1], 'itemId');
    return this.run(session, () => this.repairs.repairOne(session.characterId!, itemId));
  }

  @Rpc('repairPetEquAll', { requireCharacter: true, forbidInBattle: true })
  repairPetEquAll(session: Session, args: unknown[]): Promise<RepairReply> {
    const petId = idArg(args[0], 'petId');
    return this.run(session, () => this.repairs.repairAll(session.characterId!, petId));
  }

  /** Refusal -> note toast + the legacy failure shape. */
  private send<T>(session: Session, fail: T, fn: () => Promise<Out<T>>): Promise<T> {
    return guarded(session, fail, async () => {
      const out = await fn();
      sendPushes(session, out.pushes);
      return out.reply;
    });
  }

  /** Refusal -> the failure reply carries the text (the Flash panels print `msg`); no toast. */
  private async reply<T extends { msg?: string }>(session: Session, fail: T, fn: () => Promise<Out<T>>): Promise<T> {
    try {
      const out = await fn();
      sendPushes(session, out.pushes);
      return out.reply;
    } catch (e) {
      if (e instanceof RpcException) return { ...fail, msg: e.message };
      throw e;
    }
  }

  private run(session: Session, fn: () => Promise<Out<RepairReply>>): Promise<RepairReply> {
    return midNoteOnFail(session, async () => {
      const out = await fn();
      sendPushes(session, out.pushes);
      return out.reply;
    });
  }
}
