// Tủ Đồ RPCs (recipe side): freeExtractRecipe / goldExtractRecipe / ssdExtractRecipe -> {dressInfo, recipeId, recipeNum}, tenExtractRecipe /
// largessdExtractRecipe -> {dressInfo, planArr}, makeAllChips -> dressInfo, transformRecipe(ids) -> {dressInfo, recipeId, recipeNum},
// transformAllRecipe(ids, picked?) -> {dressInfo, produceArr}. A refusal shows onSystemMidMsgOrNote and rejects the call.

import { Injectable } from '@nestjs/common';
import type { DressDrawResult, DressInfo, DressTenResult, DressTransformAllResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { DressDrawService } from './dress-draw.service';

/** Array of positive integers (empty cells are omitted by the client); anything else is invalidArgs. */
function idList(v: unknown, name: string): number[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 1000) throw RpcException.invalidArgs(name);
  return v.map((x) => {
    const n = Number(x);
    if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(name);
    return n;
  });
}

@Injectable()
export class DressRecipeRpc {
  constructor(private readonly draws: DressDrawService) {}

  @Rpc('freeExtractRecipe', { requireCharacter: true, forbidInBattle: true })
  freeExtractRecipe(session: Session): Promise<DressDrawResult> {
    return midNoteOnFail(session, () => this.draws.freeExtract(session));
  }

  @Rpc('goldExtractRecipe', { requireCharacter: true, forbidInBattle: true })
  goldExtractRecipe(session: Session): Promise<DressDrawResult> {
    return midNoteOnFail(session, () => this.draws.goldExtract(session));
  }

  @Rpc('ssdExtractRecipe', { requireCharacter: true, forbidInBattle: true })
  ssdExtractRecipe(session: Session): Promise<DressDrawResult> {
    return midNoteOnFail(session, () => this.draws.ssdExtract(session));
  }

  @Rpc('tenExtractRecipe', { requireCharacter: true, forbidInBattle: true })
  tenExtractRecipe(session: Session): Promise<DressTenResult> {
    return midNoteOnFail(session, () => this.draws.tenExtract(session));
  }

  @Rpc('largessdExtractRecipe', { requireCharacter: true, forbidInBattle: true })
  largessdExtractRecipe(session: Session): Promise<DressTenResult> {
    return midNoteOnFail(session, () => this.draws.largeSsdExtract(session));
  }

  @Rpc('makeAllChips', { requireCharacter: true, forbidInBattle: true })
  makeAllChips(session: Session): Promise<DressInfo> {
    return midNoteOnFail(session, () => this.draws.makeAllChips(session));
  }

  @Rpc('transformRecipe', { requireCharacter: true, forbidInBattle: true })
  transformRecipe(session: Session, args: unknown[]): Promise<DressDrawResult> {
    const ids = idList(args[0], 'recipeIds');
    return midNoteOnFail(session, () => this.draws.transformOne(session, ids));
  }

  @Rpc('transformAllRecipe', { requireCharacter: true, forbidInBattle: true })
  transformAllRecipe(session: Session, args: unknown[]): Promise<DressTransformAllResult> {
    const ids = idList(args[0], 'recipeIds');
    const picked = idList(args[1], 'picked');
    return midNoteOnFail(session, () => this.draws.transformAll(session, ids, picked));
  }
}
