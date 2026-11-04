// Social RPCs: showChaInfo(cid) -> ChaInfo of an online character (legacy takes the last numeric arg as the id).

import { Injectable } from '@nestjs/common';
import type { ChaInfo } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { ChaInfoService } from './cha-info.service';

@Injectable()
export class SocialRpc {
  constructor(
    private readonly scenes: SceneManager,
    private readonly chaInfo: ChaInfoService,
  ) {}

  @Rpc('showChaInfo', { requireCharacter: true })
  async showChaInfo(_session: Session, args: unknown[]): Promise<ChaInfo> {
    const ids = args.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const cid = ids[ids.length - 1];
    if (cid === undefined) throw RpcException.invalidArgs('cid');
    if (!this.scenes.findByCharacter(cid)) throw RpcException.notFound('Người chơi không trực tuyến');
    return this.chaInfo.build(cid);
  }
}
