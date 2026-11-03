// Account registration and login. Passwords are stored as bcrypt(MD5(plaintext)) like the Go server,
// so the client keeps sending MD5(password) and old account rows remain compatible.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Account, type AccountDocument } from './account.schema';
import { RpcException } from '../../gateway/errors';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const MD5_RE = /^[a-f0-9]{32}$/i;

@Injectable()
export class AuthService {
  constructor(@InjectModel(Account.name) private readonly accounts: Model<Account>) {}

  async register(username: string, passwordMd5: string, email = ''): Promise<AccountDocument> {
    if (!USERNAME_RE.test(username)) throw RpcException.invalidArgs('username must be 3-20 chars [a-zA-Z0-9_]');
    if (!MD5_RE.test(passwordMd5)) throw RpcException.invalidArgs('password must be sent as md5 hex');
    const exists = await this.accounts.exists({ username: username.toLowerCase() });
    if (exists) throw RpcException.alreadyExists('username taken');
    const passwordHash = await bcrypt.hash(passwordMd5.toLowerCase(), 10);
    return this.accounts.create({ username: username.toLowerCase(), passwordHash, email });
  }

  async login(username: string, passwordMd5: string): Promise<AccountDocument> {
    const account = await this.accounts.findOne({ username: username.toLowerCase() });
    if (!account) throw RpcException.unauthorized('wrong username or password');
    if (!(await this.checkPassword(account, passwordMd5))) {
      throw RpcException.unauthorized('wrong username or password');
    }
    if (account.isBanned && (!account.banExpiry || account.banExpiry > new Date())) {
      throw RpcException.forbidden(`banned: ${account.banReason || 'no reason'}`);
    }
    account.lastLogin = new Date();
    await account.save();
    return account;
  }

  async getById(id: string): Promise<AccountDocument | null> {
    return this.accounts.findById(id);
  }

  private async checkPassword(account: AccountDocument, passwordMd5: string): Promise<boolean> {
    const stored = account.passwordHash;
    const candidate = passwordMd5.toLowerCase();
    if (stored.startsWith('$2')) return bcrypt.compare(candidate, stored);
    if (stored.toLowerCase() !== candidate) return false;
    account.passwordHash = await bcrypt.hash(candidate, 10);
    return true;
  }
}
