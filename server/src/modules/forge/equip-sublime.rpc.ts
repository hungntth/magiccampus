// Character gear Thang hoa / Doi khac che RPCs (Flash names, EquipFunc tabs): sublimeEquip, onValidateSublime, restrainEquip, onValidateRestrain.
// Every one answers {itemId, flagStr, num} (the panel writes flagStr into the slot) or null after a refusal note. Pushes (self): stack
// changes (onAddCharactorSlot / onDelCharactorSlot), onUPP (gold, stats of worn gear), onSystemMidMsgOrNote, validateRestrain(equipId, element)
// when the Bui Ma Phap is missing and autoBuy was ticked (the Yes button calls onValidateRestrain). Logic in EquipSublimeService.

import { Injectable } from '@nestjs/common';
import type { EquipSublimeReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { EquipSublimeService } from './equip-sublime.service';
import { flexBool, idArg, optionalId, sendOut } from './forge-guard';

@Injectable()
export class EquipSublimeRpc {
  constructor(private readonly sublimes: EquipSublimeService) {}

  /** (equipId, dustStackId|NaN, autoBuy). */
  @Rpc('sublimeEquip', { requireCharacter: true, forbidInBattle: true })
  sublimeEquip(session: Session, args: unknown[]): Promise<EquipSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    return sendOut<EquipSublimeReply | null>(session, null, () => this.sublimes.sublime(session.characterId!, equipId, optionalId(args[1]), flexBool(args[2])));
  }

  /** The Yes of the "buy dust with gold" alert: (equipId, dustStackId), always autoBuy. */
  @Rpc('onValidateSublime', { requireCharacter: true, forbidInBattle: true })
  onValidateSublime(session: Session, args: unknown[]): Promise<EquipSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    return sendOut<EquipSublimeReply | null>(session, null, () => this.sublimes.sublime(session.characterId!, equipId, optionalId(args[1]), true));
  }

  /** (equipId, dustStackId|NaN, element 1..6, autoBuy). */
  @Rpc('restrainEquip', { requireCharacter: true, forbidInBattle: true })
  restrainEquip(session: Session, args: unknown[]): Promise<EquipSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    const element = Number(args[2]);
    return sendOut<EquipSublimeReply | null>(session, null,
      () => this.sublimes.restrain(session.characterId!, equipId, optionalId(args[1]), element, flexBool(args[3]), false));
  }

  /** The Yes of validateRestrain: (equipId, element), pays the gold price. */
  @Rpc('onValidateRestrain', { requireCharacter: true, forbidInBattle: true })
  onValidateRestrain(session: Session, args: unknown[]): Promise<EquipSublimeReply | null> {
    const equipId = idArg(args[0], 'equipId');
    const element = Number(args[1]);
    return sendOut<EquipSublimeReply | null>(session, null, () => this.sublimes.restrain(session.characterId!, equipId, 0, element, true, true));
  }
}
