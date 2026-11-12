// Monster heart RPCs (legacy MonsterHeartPanel): initMonsterHeartData(), monsterHeartSet(heartId, hole, box, type), monsterHeartReMove(hole, box),
// openHoleMonsterHeart(box, hole), openHoleMonsterHeartJingang(box, hole, itemKK), upgradeMonsterHeartItem(isAll, giid, num, useStone, byGold),
// resolveMonsterHeart(giid, num[, md5pass]), upgradeMonsterHeartBox(box) and the H5 catalog read getMonsterHeartCatalog().
// Pushes: updateMonsterHeartPanel, updateMonsterHeartBox, updateMonsterHeartBagByType(bag, type), updateMonsterHeartAfterUp(isAll, n),
// onUpgradeMonsterHeartBox(heartBoxLev), onUPP (stats, gold, currencies). The secondary password (md5pass) is accepted and ignored (H5 has none).
// A refusal shows onSystemMidMsgOrNote and rejects the call (the Go server answered most of them silently).

import { Injectable } from '@nestjs/common';
import type { MonsterHeartCatalog, MonsterHeartState } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { MonsterHeartService } from './monsterheart.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

const boolArg = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';

@Injectable()
export class MonsterHeartRpc {
  constructor(private readonly hearts: MonsterHeartService) {}

  @Rpc('getMonsterHeartCatalog', { requireCharacter: true })
  getMonsterHeartCatalog(): MonsterHeartCatalog {
    return this.hearts.catalog();
  }

  @Rpc('initMonsterHeartData', { requireCharacter: true })
  initMonsterHeartData(session: Session): Promise<MonsterHeartState> {
    return this.hearts.init(session.characterId!);
  }

  /** args: (bagPos = heart id, hole, box, type); the type is re-derived from the heart. */
  @Rpc('monsterHeartSet', { requireCharacter: true, forbidInBattle: true })
  monsterHeartSet(session: Session, args: unknown[]): Promise<null> {
    const [heartId, hole, box] = [intArg(args[0], 'bagPos'), intArg(args[1], 'hole'), intArg(args[2], 'box')];
    return midNoteOnFail(session, () => this.hearts.place(session, heartId, hole, box));
  }

  @Rpc('monsterHeartReMove', { requireCharacter: true, forbidInBattle: true })
  monsterHeartReMove(session: Session, args: unknown[]): Promise<null> {
    const [hole, box] = [intArg(args[0], 'hole'), intArg(args[1], 'box')];
    return midNoteOnFail(session, () => this.hearts.place(session, null, hole, box));
  }

  @Rpc('openHoleMonsterHeart', { requireCharacter: true, forbidInBattle: true })
  openHoleMonsterHeart(session: Session, args: unknown[]): Promise<null> {
    const [box, hole] = [intArg(args[0], 'box'), intArg(args[1], 'hole')];
    return midNoteOnFail(session, () => this.hearts.openWithGold(session, box, hole));
  }

  /** args: (box, hole, itemKK); the Kim Cương stack argument is ignored (the server picks the stacks of the right colour). */
  @Rpc('openHoleMonsterHeartJingang', { requireCharacter: true, forbidInBattle: true })
  openHoleMonsterHeartJingang(session: Session, args: unknown[]): Promise<null> {
    const [box, hole] = [intArg(args[0], 'box'), intArg(args[1], 'hole')];
    return midNoteOnFail(session, () => this.hearts.openWithDiamond(session, box, hole));
  }

  @Rpc('upgradeMonsterHeartItem', { requireCharacter: true, forbidInBattle: true })
  upgradeMonsterHeartItem(session: Session, args: unknown[]): Promise<null> {
    const opts = { isAll: boolArg(args[0]), useStone: boolArg(args[3]), byGold: boolArg(args[4]) };
    const [heartId, num] = [intArg(args[1], 'giid'), intArg(args[2], 'num')];
    return midNoteOnFail(session, () => this.hearts.upgrade(session, heartId, num, opts));
  }

  @Rpc('resolveMonsterHeart', { requireCharacter: true, forbidInBattle: true })
  resolveMonsterHeart(session: Session, args: unknown[]): Promise<null> {
    const [heartId, num] = [intArg(args[0], 'giid'), intArg(args[1], 'num')];
    return midNoteOnFail(session, () => this.hearts.resolve(session, heartId, num));
  }

  @Rpc('upgradeMonsterHeartBox', { requireCharacter: true, forbidInBattle: true })
  upgradeMonsterHeartBox(session: Session, args: unknown[]): Promise<null> {
    const box = intArg(args[0], 'box');
    return midNoteOnFail(session, () => this.hearts.upgradeBox(session, box));
  }
}
