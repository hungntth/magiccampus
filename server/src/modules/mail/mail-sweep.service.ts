// Expiry sweeper: one pass at boot and then every hour. Expired mailboxes (30 days unread / 10 days after read) are cleaned in
// batches through MailDeleteService (player mail returns to its sender, system attachments are destroyed); an online owner gets
// onDelMail(id) per removed mail. Legacy: Go RunExpiryLoop -> mail_expire_all(500), up to 20 batches per pass.

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MailCoreService } from './mail-core.service';
import { MailDeleteService } from './mail-delete.service';

const BATCH = 500;
const MAX_BATCHES = 20;
const INTERVAL_MS = 60 * 60 * 1000;
const BOOT_DELAY_MS = 5000;

@Injectable()
export class MailSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailSweepService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly core: MailCoreService,
    private readonly remove: MailDeleteService,
  ) {}

  onModuleInit(): void {
    const boot = setTimeout(() => void this.sweep(), BOOT_DELAY_MS);
    const loop = setInterval(() => void this.sweep(), INTERVAL_MS);
    boot.unref();
    loop.unref();
    this.timers = [boot, loop];
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
  }

  /** One pass; returns the number of mails removed. */
  async sweep(now = Date.now()): Promise<number> {
    let removed = 0;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const receivers = await this.remove.expiredReceivers(now, BATCH);
        if (receivers.length === 0) break;
        let progress = 0;
        for (const rid of receivers) {
          const ids = await this.remove.expireFor(rid, now);
          progress += ids.length;
          for (const id of ids) this.core.pushTo(rid, 'onDelMail', id);
        }
        removed += progress;
        if (progress === 0) break; // nothing could be removed (errors are logged): do not spin
      }
    } catch (e) {
      this.logger.error(`mail sweep failed: ${(e as Error).message}`);
    }
    if (removed > 0) this.logger.log(`mail sweep removed ${removed} expired mail(s)`);
    return removed;
  }
}
