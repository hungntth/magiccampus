// System RPCs: `checkNetDelay` (MiniMapCanvas delay strip ping, every 10 s; returns server epoch ms).

import { Injectable } from '@nestjs/common';
import type { NetDelayReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';

@Injectable()
export class SystemRpc {
  @Rpc('checkNetDelay', { requireAuth: true })
  checkNetDelay(): NetDelayReply {
    return Date.now();
  }
}
