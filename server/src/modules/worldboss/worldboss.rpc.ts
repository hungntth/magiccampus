// World boss RPCs (Flash names verbatim, all fire-and-forget on the client: every answer is a push): canEnterWbMap(playerId),
// wbLeaveMap(playerId), takeWbAward(playerId), wbAutoBattle(playerId, auto), wbBattleCheck(playerId), wbReliveNow(playerId),
// wbStrongBattle(type), plus the GM test RPC gmWorldBoss(action, minutes?) behind chat /wb start|stop|lobby|status. The playerId
// argument is ignored (the session's character is used). Pushes come from the services (initWbView, onUpdateWbResult, ...).

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { WB } from './wb-config';
import { WbActionsService } from './wb-actions.service';
import { WbEntryService } from './wb-entry.service';
import { WbState } from './wb-state.service';
import { WorldBossService } from './worldboss.service';

const MAX_GM_MINUTES = 240;

@Injectable()
export class WorldBossRpc {
  constructor(
    private readonly entry: WbEntryService,
    private readonly actions: WbActionsService,
    private readonly event: WorldBossService,
    private readonly state: WbState,
  ) {}

  @Rpc('canEnterWbMap', { requireCharacter: true })
  async canEnterWbMap(session: Session): Promise<null> {
    await this.entry.enter(session);
    return null;
  }

  @Rpc('wbLeaveMap', { requireCharacter: true })
  async wbLeaveMap(session: Session): Promise<null> {
    await this.entry.leaveMap(session);
    return null;
  }

  @Rpc('takeWbAward', { requireCharacter: true })
  async takeWbAward(session: Session): Promise<null> {
    await this.entry.takeAward(session);
    return null;
  }

  @Rpc('wbAutoBattle', { requireCharacter: true })
  wbAutoBattle(session: Session, args: unknown[]): null {
    const raw = args[1] ?? args[0]; // (playerId, auto); tolerate a bare flag
    if (typeof raw !== 'boolean' && raw !== 0 && raw !== 1) throw RpcException.invalidArgs('auto');
    this.entry.setAuto(session, Boolean(raw));
    return null;
  }

  @Rpc('wbBattleCheck', { requireCharacter: true })
  async wbBattleCheck(session: Session): Promise<null> {
    await this.actions.battleCheck(session);
    return null;
  }

  @Rpc('wbReliveNow', { requireCharacter: true })
  async wbReliveNow(session: Session): Promise<null> {
    await this.actions.reliveNow(session);
    return null;
  }

  @Rpc('wbStrongBattle', { requireCharacter: true })
  async wbStrongBattle(session: Session, args: unknown[]): Promise<null> {
    const type = Number(args[0]);
    if (!Number.isInteger(type) || type < 1 || type > 2) throw RpcException.invalidArgs('type');
    await this.actions.cheer(session, type);
    return null;
  }

  /** GM test control (chat /wb): start [minutes], stop, lobby [minutes], status. */
  @Rpc('gmWorldBoss', { requireCharacter: true, requireGm: true })
  async gmWorldBoss(_session: Session, args: unknown[]): Promise<string> {
    const action = args[0];
    if (action === 'status') return this.event.status();
    const minutes = args[1] === undefined ? undefined : Number(args[1]);
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_GM_MINUTES)) throw RpcException.invalidArgs('minutes');
    if (action === 'start') {
      const m = minutes ?? WB.MANUAL_MS / 60_000;
      if (!this.event.gmStart(m)) throw RpcException.forbidden('Boss Thế Giới đang diễn ra.');
      return `Đã mở Boss Thế Giới (${m} phút).`;
    }
    if (action === 'lobby') {
      const m = minutes ?? 1;
      if (!this.event.gmLobby(m)) throw RpcException.forbidden('Boss Thế Giới đang diễn ra hoặc đang chờ.');
      return `Đã mở sảnh chờ Boss Thế Giới, trận bắt đầu sau ${m} phút.`;
    }
    if (action === 'stop') {
      if (await this.event.gmStop()) return 'Đã kết thúc Boss Thế Giới.';
      if (this.state.lobby) {
        await this.event.closeLobby();
        return 'Đã đóng sảnh chờ Boss Thế Giới.';
      }
      throw RpcException.forbidden('Boss Thế Giới không diễn ra.');
    }
    throw RpcException.invalidArgs('action');
  }
}
