// changeNameByCard(newName) (Flash Player.as:1114, Go item/special.go): rename with the Thẻ Đổi Tên card. Replies {success, name};
// pushes onUPP{name} to the caller and onScenePlayerRenamed(id, name) to the room. Refusals also show onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import type { ChangeNameByCardReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { RenameService } from './rename.service';

@Injectable()
export class RenameRpc {
  constructor(private readonly renames: RenameService) {}

  @Rpc('changeNameByCard', { requireCharacter: true, forbidInBattle: true })
  changeNameByCard(session: Session, args: unknown[]): Promise<ChangeNameByCardReply> {
    return midNoteOnFail(session, () => this.renames.rename(session, args[0]));
  }
}
