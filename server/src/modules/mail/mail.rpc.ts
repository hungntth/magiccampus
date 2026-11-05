// Mail RPCs (Flash names): showMailP, addMail, closeMail, takeMail, setReadDate, delMail, delMails; GM dev tool devSendMail.
// Pushes (to the caller): onAddMail (sent echo / error object), onDelCharactorSlot, onDelPet, onUPP, onAddItem, onAddCharactorSlot,
// onAddPet, onSystemMidMsgOrNote. Receivers get onAddMail / onDelMail from the services. initViewMailMngP comes from the NPC click.

import { Injectable } from '@nestjs/common';
import { MAIL_TEXT, type SetReadDateReply, type ShowMailReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { sendPushes } from '../inventory/pushes';
import { MailDeleteService } from './mail-delete.service';
import { parseAddMail, parseIds } from './mail-rules';
import { MailSendService } from './mail-send.service';
import { MailSystemService } from './mail-system.service';
import { MailTakeService } from './mail-take.service';
import { MailService } from './mail.service';

@Injectable()
export class MailRpc {
  constructor(
    private readonly mail: MailService,
    private readonly sender: MailSendService,
    private readonly taker: MailTakeService,
    private readonly remover: MailDeleteService,
    private readonly system: MailSystemService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
  ) {}

  @Rpc('showMailP', { requireCharacter: true })
  showMailP(session: Session): Promise<ShowMailReply> {
    return this.mail.list(session.characterId!);
  }

  @Rpc('closeMail', { requireCharacter: true })
  closeMail(): null {
    return null;
  }

  /** addMail(name, obj, delPassMD5): proxy call without a reply; the result is pushes (the password is ignored in H5). */
  @Rpc('addMail', { requireCharacter: true, forbidInBattle: true })
  async addMail(session: Session, args: unknown[]): Promise<null> {
    const parsed = parseAddMail(args);
    if (!parsed.ok) {
      if (parsed.reason === 'amount') {
        session.callback('onSystemMidMsgOrNote', MAIL_TEXT.MONEY);
        return null;
      }
      throw RpcException.invalidArgs('obj');
    }
    const out = await this.sender.send(session.characterId!, session.characterName ?? '', parsed.input);
    if (out.ok) sendPushes(session, out.pushes);
    else if ('error' in out) session.callback('onAddMail', { id: -1, type: out.error });
    else session.callback('onSystemMidMsgOrNote', out.note);
    return null;
  }

  /** takeMail(id[, confirm]) -> id, or 0 with a note. COD mail needs the second argument (the player confirmation). */
  @Rpc('takeMail', { requireCharacter: true, forbidInBattle: true })
  async takeMail(session: Session, args: unknown[]): Promise<number> {
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) return 0;
    const second = args[1];
    const confirmed = second !== undefined && second !== null && second !== '' && second !== false && second !== 0;
    const out = await this.taker.take(session.characterId!, id, confirmed);
    if (!out.ok) {
      session.callback('onSystemMidMsgOrNote', out.note);
      return 0;
    }
    sendPushes(session, out.pushes);
    return out.id;
  }

  @Rpc('setReadDate', { requireCharacter: true })
  setReadDate(session: Session, args: unknown[]): Promise<SetReadDateReply | null> {
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) return Promise.resolve(null);
    return this.mail.markRead(session.characterId!, id);
  }

  @Rpc('delMail', { requireCharacter: true })
  async delMail(session: Session, args: unknown[]): Promise<number> {
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) return 0;
    const done = await this.remover.deleteMails(session.characterId!, [id]);
    return done[0] ?? 0;
  }

  @Rpc('delMails', { requireCharacter: true })
  delMails(session: Session, args: unknown[]): Promise<number[]> {
    return this.remover.deleteMails(session.characterId!, parseIds(args[0]));
  }

  /** H5 dev tool: devSendMail(name, templateId, count[, money, gold]) sends a system mail with an item template (29, else 19). */
  @Rpc('devSendMail', { requireCharacter: true, requireGm: true })
  async devSendMail(_session: Session, args: unknown[]): Promise<{ id: number } | null> {
    const name = typeof args[0] === 'string' ? args[0].trim() : '';
    const templateId = Number(args[1] ?? 0);
    const count = Number(args[2] ?? 1);
    const money = Number(args[3] ?? 0);
    const gold = Number(args[4] ?? 0);
    if (!name) throw RpcException.invalidArgs('name');
    if (!Number.isInteger(templateId) || !Number.isInteger(count) || !(money >= 0) || !(gold >= 0)) throw RpcException.invalidArgs('args');
    const target = await this.characters.findByName(name);
    if (!target) throw RpcException.notFound('character');
    let item: { templateId: number; table: 29 | 19; count: number; bound: boolean } | undefined;
    if (templateId > 0) {
      const table = (await this.gameData.template(29, templateId)) ? 29 : (await this.gameData.template(19, templateId)) ? 19 : 0;
      if (table === 0) throw RpcException.notFound('template');
      item = { templateId, table, count: Math.max(1, count), bound: false };
    }
    const view = await this.system.sendSystemMail({
      receiverId: target._id, title: 'Thư từ GM', text: 'Thư thử nghiệm gửi bởi công cụ GM.', money, gold, ...(item ? { item } : {}),
    });
    if (!view) throw RpcException.invalidArgs('mail');
    return { id: view.id };
  }
}
