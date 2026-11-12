// Wing RPCs, part 2 (feathers): getFeatherData(wingId), addWingFeather(wingId, {"1".."10": {idx, flag}}) -> inlaid count,
// featherDel(wingId, index) -> boolean, featherUpdate(featherId, luckId | -1, luckCount, once, tempBagFlag), featherMix(formulaRef,
// {"1": ref, "2": ref}, luckId, luckCount, luckBinded). `idx` of a reference is the item instance id (temp bag references are not supported).

import { Injectable } from '@nestjs/common';
import type { BagItem, FeatherMixReply, FeatherUpdateReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FeatherCraftService } from './feather-craft.service';
import { FeatherService } from './feather.service';
import { idOf, intArg, out } from './wing-rpc-util';

@Injectable()
export class FeatherRpc {
  constructor(
    private readonly feathers: FeatherService,
    private readonly craft: FeatherCraftService,
  ) {}

  @Rpc('getFeatherData', { requireCharacter: true })
  getFeatherData(session: Session, args: unknown[]): Promise<BagItem | null> {
    return this.feathers.data(session.characterId!, idOf(args[0]));
  }

  @Rpc('addWingFeather', { requireCharacter: true, forbidInBattle: true })
  addWingFeather(session: Session, args: unknown[]): Promise<number> {
    return out(session, 0, () => this.feathers.inlay(session.characterId!, idOf(args[0]), args[1]));
  }

  @Rpc('featherDel', { requireCharacter: true, forbidInBattle: true })
  featherDel(session: Session, args: unknown[]): Promise<boolean> {
    return out(session, false, () => this.feathers.remove(session.characterId!, idOf(args[0]), intArg(args[1])));
  }

  @Rpc('featherUpdate', { requireCharacter: true, forbidInBattle: true })
  featherUpdate(session: Session, args: unknown[]): Promise<FeatherUpdateReply> {
    const [featherId, luckId, luckCount] = [idOf(args[0]), intArg(args[1]), intArg(args[2])];
    const fail: FeatherUpdateReply = { slotId: featherId, num: 0, lSid: luckId, lnum: 0, flag: false, finalNum: 0 };
    return out(session, fail, () => this.craft.upgrade(session.characterId!, featherId, luckId, luckCount, args[3] === true));
  }

  @Rpc('featherMix', { requireCharacter: true, forbidInBattle: true })
  featherMix(session: Session, args: unknown[]): Promise<FeatherMixReply> {
    const [formulaId, luckId, luckCount] = [idOf(args[0]), intArg(args[2]), intArg(args[3])];
    const fail: FeatherMixReply = { f: false, fid: -1, fnum: 0, i: {}, lid: luckId, lnum: 0 };
    return out(session, fail, () => this.craft.mix(session.characterId!, formulaId, args[1], luckId, luckCount));
  }
}
