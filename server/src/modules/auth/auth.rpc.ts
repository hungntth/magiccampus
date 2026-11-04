// RPCs: register, login, logout. Login binds the account to the session and kicks any older session.

import { Injectable } from '@nestjs/common';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';
import { AuthService } from './auth.service';

const KICKED_BY_OTHER = 1;

@Injectable()
export class AuthRpc {
  constructor(
    private readonly auth: AuthService,
    private readonly scenes: SceneManager,
  ) {}

  @Rpc('register')
  async register(_session: Session, args: unknown[]): Promise<{ accountId: string }> {
    const [username, passwordMd5, email] = args;
    if (typeof username !== 'string' || typeof passwordMd5 !== 'string') throw RpcException.invalidArgs();
    const account = await this.auth.register(username, passwordMd5, typeof email === 'string' ? email : '');
    return { accountId: account.id };
  }

  @Rpc('login')
  async login(session: Session, args: unknown[]): Promise<{ accountId: string; username: string; vipLevel: number }> {
    const [username, passwordMd5] = args;
    if (typeof username !== 'string' || typeof passwordMd5 !== 'string') throw RpcException.invalidArgs();
    const account = await this.auth.login(username, passwordMd5);
    session.accountId = account.id;
    session.username = account.username;
    session.gmLevel = account.gmLevel ?? 0;
    const previous = this.scenes.bindAccount(session, account.id);
    if (previous) {
      previous.callback('onKickChar', KICKED_BY_OTHER);
      setTimeout(() => previous.close(4001, 'logged in elsewhere'), 300);
    }
    return { accountId: account.id, username: account.username, vipLevel: account.vipLevel };
  }

  @Rpc('logout', { requireAuth: true })
  logout(session: Session): { ok: true } {
    this.scenes.release(session);
    session.accountId = null;
    session.username = null;
    session.gmLevel = 0;
    session.characterId = null;
    session.characterName = null;
    return { ok: true };
  }
}
