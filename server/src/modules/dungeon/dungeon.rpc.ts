// Phụ bản RPCs: getFbInfo() -> FbInfo[] (H5 hub helper; the Flash FB list was static XML) and the GM test command
// gmDungeon(action, key, minutes?) behind `/dg reset <key>` (drops today's run, the daily lock and abandon locks) and
// `/dg time <key> <min>` (the open run ends in <min> minutes; warnings re-armed). Push: onDungeonRun after a GM change.

import { Injectable } from '@nestjs/common';
import type { FbInfo } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { dungeonByKey, runOf } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonViewService } from './dungeon-view.service';

const MAX_GM_MINUTES = 24 * 60;

@Injectable()
export class DungeonRpc {
  constructor(
    private readonly state: DungeonStateService,
    private readonly views: DungeonViewService,
  ) {}

  @Rpc('getFbInfo', { requireCharacter: true })
  getFbInfo(session: Session): Promise<FbInfo[]> {
    return this.views.fbInfo(session.characterId!);
  }

  @Rpc('gmDungeon', { requireCharacter: true, requireGm: true })
  async gmDungeon(session: Session, args: unknown[]): Promise<string> {
    const action = args[0];
    const key = args[1];
    if (action !== 'reset' && action !== 'time') throw RpcException.invalidArgs('action');
    const d = typeof key === 'string' ? dungeonByKey(key) : undefined;
    if (!d) throw RpcException.invalidArgs('key');
    const cid = session.characterId!;
    if (action === 'reset') {
      await this.state.mutate(cid, (st) => {
        delete st.runs[d.key];
        delete st.done[d.key];
        st.abandoned = {};
        return true;
      });
      await this.views.push(session);
      return `Đã xóa lượt ${d.name} hôm nay.`;
    }
    const minutes = Number(args[2]);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_GM_MINUTES) throw RpcException.invalidArgs('minutes');
    const now = this.state.now();
    const ok = await this.state.mutate(cid, (st) => {
      const r = runOf(st.runs, d.key, this.state.today());
      if (!r) return false;
      r.openedAt = now + minutes * 60_000 - d.rules.durationMin * 60_000;
      r.warned = 0;
      return true;
    });
    if (!ok) throw RpcException.forbidden(`Chưa có lượt ${d.name} hôm nay.`);
    await this.views.push(session);
    return `${d.name}: còn ${minutes} phút.`;
  }
}
