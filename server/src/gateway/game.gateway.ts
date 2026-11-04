// Raw `ws` server attached to Nest's HTTP server. Parses JSON calls, dispatches to RpcRegistry,
// returns results, and notifies disconnect hooks so feature modules can clean up.

import { Injectable, Logger } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '@mc/shared';
import { Session } from './session';
import { RpcRegistry } from './rpc.registry';
import { RpcException } from './errors';
import { SceneManager } from './scene.manager';

export type DisconnectHook = (session: Session) => Promise<void> | void;

const MAX_MESSAGE_BYTES = 64 * 1024;

@Injectable()
export class GameGateway {
  private readonly logger = new Logger(GameGateway.name);
  private readonly sessions = new Map<number, Session>();
  private readonly disconnectHooks: DisconnectHook[] = [];
  private readonly characterLeaveHooks: DisconnectHook[] = [];
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly registry: RpcRegistry,
    private readonly scenes: SceneManager,
  ) {}

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
    this.wss.on('connection', (socket, req) => this.onConnection(socket, req.socket.remoteAddress ?? '?'));
    this.logger.log(`WebSocket endpoint ready at /ws (${this.registry.list().length} methods)`);
  }

  onDisconnect(hook: DisconnectHook): void {
    this.disconnectHooks.push(hook);
  }

  /** Runs when a session stops playing its character without disconnecting (backToCharSelect). */
  onCharacterLeave(hook: DisconnectHook): void {
    this.characterLeaveHooks.push(hook);
  }

  async leaveCharacter(session: Session): Promise<void> {
    for (const hook of this.characterLeaveHooks) {
      try {
        await hook(session);
      } catch (err) {
        this.logger.error(`character leave hook failed: ${(err as Error).message}`);
      }
    }
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  private onConnection(socket: WebSocket, remote: string): void {
    const session = new Session(socket);
    this.sessions.set(session.id, session);
    this.logger.log(`conn ${session.id} open from ${remote}`);

    socket.on('message', (data) => void this.onMessage(session, data.toString()));
    socket.on('close', () => void this.onClose(session));
    socket.on('error', (err) => this.logger.warn(`conn ${session.id} error: ${err.message}`));
  }

  private async onMessage(session: Session, raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      session.close(1003, 'bad json');
      return;
    }
    if (!msg || msg.t !== 'call' || typeof msg.m !== 'string' || typeof msg.id !== 'number') {
      session.close(1003, 'bad frame');
      return;
    }
    const args = Array.isArray(msg.a) ? msg.a : [];
    const quiet = this.registry.isQuiet(msg.m);
    if (!quiet) this.logger.log(`conn ${session.id} -> ${msg.m}(${safeArgs(args)})`);

    try {
      const result = await this.registry.dispatch(session, msg.m, args);
      session.sendRaw({ t: 'res', id: msg.id, ok: true, r: result ?? null });
      if (!quiet) this.logger.log(`conn ${session.id} <- ${msg.m} ok`);
    } catch (err) {
      const wire = err instanceof RpcException ? err.toWire() : { code: 'INTERNAL', msg: 'internal error' };
      if (!(err instanceof RpcException)) {
        this.logger.error(`conn ${session.id} ${msg.m} failed: ${(err as Error).stack ?? err}`);
      } else if (!quiet) {
        this.logger.warn(`conn ${session.id} <- ${msg.m} ${wire.code}: ${wire.msg}`);
      }
      session.sendRaw({ t: 'res', id: msg.id, ok: false, e: wire });
    }
  }

  private async onClose(session: Session): Promise<void> {
    this.sessions.delete(session.id);
    for (const hook of this.disconnectHooks) {
      try {
        await hook(session);
      } catch (err) {
        this.logger.error(`disconnect hook failed: ${(err as Error).message}`);
      }
    }
    this.scenes.release(session);
    this.logger.log(`conn ${session.id} closed (${session.characterName ?? session.username ?? 'anon'})`);
  }
}

function safeArgs(args: unknown[]): string {
  const s = JSON.stringify(args);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}
