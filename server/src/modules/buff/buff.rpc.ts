// Buff RPCs: delBuffClient(rowId) and the dev command gmAddBuff(buffId, seconds).
// Pushes (self): delBuff(rowId), upLongBuff(LongBuff), onUPP (stat refresh). initLongBuff is pushed by sceneLogin.

import { Injectable } from '@nestjs/common';
import type { LongBuff } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { CharacterStatsService } from '../stats/character-stats.service';
import { BuffService } from './buff.service';

const MAX_GM_SECONDS = 30 * 24 * 3600;

@Injectable()
export class BuffRpc {
  constructor(
    private readonly buffs: BuffService,
    private readonly stats: CharacterStatsService,
  ) {}

  /** Fire-and-forget on the client: unknown id -> delBuff only; non-removable (template buff = 0) -> nothing. */
  @Rpc('delBuffClient', { requireCharacter: true })
  async delBuffClient(session: Session, args: unknown[]): Promise<null> {
    const rowId = Number(args[0]);
    if (!Number.isInteger(rowId)) throw RpcException.invalidArgs('buffId');
    const row = await this.buffs.findOwned(session.characterId!, rowId);
    if (!row) {
      session.callback('delBuff', rowId);
      return null;
    }
    if (!this.buffs.removable(row)) return null;
    await this.buffs.remove(session.characterId!, rowId);
    session.callback('delBuff', rowId);
    await this.stats.refreshPush(session);
    return null;
  }

  /** H5 dev command `/buff <id> [seconds]`: grants a buff (0 seconds = permanent) to the caller. */
  @Rpc('gmAddBuff', { requireCharacter: true, requireGm: true })
  async gmAddBuff(session: Session, args: unknown[]): Promise<LongBuff> {
    const buffId = Number(args[0]);
    const seconds = args[1] === undefined ? 0 : Number(args[1]);
    if (!Number.isInteger(buffId) || buffId <= 0) throw RpcException.invalidArgs('buffId');
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_GM_SECONDS) throw RpcException.invalidArgs('seconds');
    const buff = await this.buffs.grant(session.characterId!, buffId, seconds);
    session.callback('upLongBuff', buff);
    await this.stats.refreshPush(session);
    return buff;
  }
}
