// Extension point of the Ma Tâm temp bag "Mở nhanh" (oneKeyOpenAllMXTemp): MonsterHeartModule registers the opener from onModuleInit, so TempBagModule
// never imports it (the heart panel needs the temp bag rows, the temp bag RPC needs the heart opener).

import { Injectable } from '@nestjs/common';
import type { Session } from '../../gateway/session';

export type MxOpenFn = (session: Session) => Promise<void>;

@Injectable()
export class MxOpenRegistry {
  private opener: MxOpenFn | null = null;

  register(fn: MxOpenFn): void {
    this.opener = fn;
  }

  /** Opens every Ma Tâm item of the Ma Tâm temp bag; false when no opener is registered. */
  async openAll(session: Session): Promise<boolean> {
    if (!this.opener) return false;
    await this.opener(session);
    return true;
  }
}
