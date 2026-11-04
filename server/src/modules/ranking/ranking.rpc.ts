// Ranking RPC: rankGet(category) -> {name, data:[{id, name, guild, value}]} (Flash ActivePanel.getInfo). No pushes.

import { Injectable } from '@nestjs/common';
import { isRankCategory, type RankGetReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { RankingService } from './ranking.service';

@Injectable()
export class RankingRpc {
  constructor(private readonly ranking: RankingService) {}

  @Rpc('rankGet', { requireCharacter: true })
  async rankGet(_session: Session, args: unknown[]): Promise<RankGetReply> {
    const category = args[0];
    if (!isRankCategory(category)) throw RpcException.invalidArgs('category');
    return this.ranking.rankGet(category);
  }
}
