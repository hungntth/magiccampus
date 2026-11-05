// HMTXL RPCs (Flash XiulianshiPanel, all null responders): getHMTXLSData, enterPubRoom, endHMTXLRoom(1), getHMTAward, enterAdvRoom
// (closed, as Go) and onResetHMTProgress(cid) (the OK of resetHMTAlert, tower weekly reset). Every call ends with the onHMTXLSData
// push; refusals go out as onSystemSay, progress lines as onHMTXLSMSG. Tower NPC menus / fights are in tower.hooks.ts.

import { Injectable } from '@nestjs/common';
import { HMTXL_TEXT } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { RpcException } from '../../gateway/errors';
import { HmtxlService } from './hmtxl.service';
import { TowerService } from './tower.service';
import { TrainingRefusal } from './training-refusal';

@Injectable()
export class HmtxlRpc {
  constructor(
    private readonly room: HmtxlService,
    private readonly tower: TowerService,
  ) {}

  @Rpc('getHMTXLSData', { requireCharacter: true })
  async getData(session: Session): Promise<null> {
    await this.push(session);
    return null;
  }

  @Rpc('enterPubRoom', { requireCharacter: true })
  async enter(session: Session): Promise<null> {
    await this.run(session, async () => {
      await this.room.enter(session.characterId!);
      session.callback('onHMTXLSMSG', HMTXL_TEXT.LOG_ENTER);
    });
    return null;
  }

  @Rpc('enterAdvRoom', { requireCharacter: true })
  enterAdv(session: Session): null {
    session.callback('onSystemSay', HMTXL_TEXT.ADV_CLOSED);
    return null;
  }

  @Rpc('endHMTXLRoom', { requireCharacter: true })
  async end(session: Session, args: unknown[]): Promise<null> {
    if (Number(args[0]) === 2) {
      session.callback('onSystemSay', HMTXL_TEXT.ADV_CLOSED);
      return null;
    }
    await this.run(session, async () => {
      session.callback('onHMTXLSMSG', HMTXL_TEXT.LOG_END(await this.room.end(session.characterId!)));
    });
    return null;
  }

  @Rpc('getHMTAward', { requireCharacter: true })
  async award(session: Session): Promise<null> {
    await this.run(session, async () => {
      const r = await this.room.claim(session);
      session.callback('onHMTXLSMSG', HMTXL_TEXT.LOG_AWARD(r.exp, r.crystal));
    });
    return null;
  }

  /** onResetHMTProgress(cid): the cid argument is ignored (the session character resets), it only has to be a number. */
  @Rpc('onResetHMTProgress', { requireCharacter: true, forbidInBattle: true })
  async reset(session: Session, args: unknown[]): Promise<null> {
    if (args.length > 0 && !Number.isFinite(Number(args[0]))) throw RpcException.invalidArgs('cid');
    try {
      session.callback('onSystemSay', await this.tower.reset(session));
    } catch (e) {
      if (!(e instanceof TrainingRefusal)) throw e;
      session.callback('onSystemSay', e.message);
    }
    return null;
  }

  private async run(session: Session, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (e) {
      if (!(e instanceof TrainingRefusal)) throw e;
      session.callback('onSystemSay', e.message);
    }
    await this.push(session);
  }

  private async push(session: Session): Promise<void> {
    session.callback('onHMTXLSData', await this.room.panel(session.characterId!));
  }
}
