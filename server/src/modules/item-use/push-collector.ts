// A PushSink that records pushes in order instead of sending them: item-use hooks return Push[] to UseItemService (the RPC layer
// sends them after the slot update), while GrantService / RewardGrantService emit through callback().

import type { PushSink } from '../rewards/push-sink';
import type { Push } from '../inventory/pushes';

export class PushCollector implements PushSink {
  readonly pushes: Push[] = [];

  constructor(readonly characterId: number) {}

  callback(method: string, ...args: unknown[]): void {
    this.pushes.push({ m: method, a: args });
  }
}
