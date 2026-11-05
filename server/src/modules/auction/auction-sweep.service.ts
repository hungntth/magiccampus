// Expiry sweeper: settles every ended listing at boot and then once a minute (Go RunSweeper), retries settlement mails that are
// still owed, and registers the 'auction' owner of escrow refs so the startup escrow self-check knows which `auction:<id>` refs
// belong to a listing. Settling is idempotent (conditional status update + source-keyed mails), so overlapping runs are harmless.

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EscrowService } from '../inventory/escrow.service';
import { AuctionSettleService } from './auction-settle.service';
import { AuctionListing } from './auction.schema';

const SWEEP_MS = 60_000;
const BOOT_DELAY_MS = 3_000;

@Injectable()
export class AuctionSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private boot: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel(AuctionListing.name) private readonly listings: Model<AuctionListing>,
    private readonly settle: AuctionSettleService,
    private readonly escrow: EscrowService,
  ) {}

  onModuleInit(): void {
    this.escrow.registerOwner('auction', async (ids) => {
      const rows = await this.listings.find({ _id: { $in: ids } }, { _id: 1 }).lean();
      return new Set(rows.map((r) => r._id));
    });
    this.boot = setTimeout(() => void this.sweep(), BOOT_DELAY_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.boot.unref();
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.boot) clearTimeout(this.boot);
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const settled = await this.settle.settleDue();
      const retried = await this.settle.retryPending();
      if (settled > 0 || retried > 0) this.logger.log(`auction sweep: ${settled} settled, ${retried} mail retries completed`);
    } catch (e) {
      this.logger.warn(`auction sweep failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
