// changeNameByCard: validates the new name, consumes one Thẻ Đổi Tên (2126), stores the name, then refreshes everything that cached it.
// Name caches: session.characterName (chat, trade / party invites), the room (onScenePlayerRenamed), party members (snapshot rebuilt
// from the character documents). Friends / blacklist and trade sessions hold ids only, so they read the new name on their next view.

import { Injectable } from '@nestjs/common';
import { RENAME_CARD_TID, validateNewName, type ChangeNameByCardReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { PartyService } from '../party/party.service';
import { ItemSpendService } from './item-spend.service';

/** One global key serializes the unique-name check with the write (character locks use positive ids). */
const NAME_LOCK = -1;

@Injectable()
export class RenameService {
  constructor(
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
    private readonly party: PartyService,
    private readonly spend: ItemSpendService,
  ) {}

  async rename(session: Session, raw: unknown): Promise<ChangeNameByCardReply> {
    const check = validateNewName(raw);
    if (!check.ok) throw RpcException.invalidArgs(check.msg);
    const id = session.characterId!;
    return withCharLock(NAME_LOCK, () => withCharLock(id, async () => {
      if (check.name === session.characterName) throw RpcException.forbidden('Tên mới trùng với tên hiện tại.');
      if (await this.characters.nameTaken(check.name)) throw RpcException.alreadyExists('Tên này đã có người sử dụng.');
      if (((await this.spend.owned(id, [RENAME_CARD_TID])).get(RENAME_CARD_TID) ?? 0) < 1) {
        throw RpcException.forbidden('Bạn không có Thẻ Đổi Tên.');
      }
      await this.spend.take(session, RENAME_CARD_TID);
      try {
        await this.characters.rename(id, check.name);
      } catch (e) {
        await this.spend.giveBack(session, RENAME_CARD_TID);
        throw e;
      }
      session.characterName = check.name;
      session.callback('onUPP', { name: check.name });
      this.scenes.broadcast(session.mapId, 'onScenePlayerRenamed', [id, check.name], session);
      await this.party.refreshOf(id);
      return { success: true, name: check.name };
    }));
  }
}
