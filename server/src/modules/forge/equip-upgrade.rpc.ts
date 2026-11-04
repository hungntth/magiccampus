// Equipment upgrade RPCs (Flash/Go names): starOne, starAll, getStarNum, holeDig, getHoleNum, getJewelData, jewelSet, jewelDel,
// bindItem, changeLevel, equResolve and the H5 helper getUpgradeInfo. Pushes: material stacks (onAddCharactorSlot /
// onDelCharactorSlot), the changed equipment, onUPP (money, and the stat refresh for worn gear). A refusal shows
// onSystemMidMsgOrNote and answers the legacy failure shape.

import { Injectable } from '@nestjs/common';
import type { BindItemReply, ChangeLevelReply, HoleDigReply, HoleNumReply, JewelData, StarReply, UpgradeInfo } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes, type Push } from '../inventory/pushes';
import { guarded, idArg, parseUpgradeRequest } from './forge-guard';
import { SocketService } from './socket.service';
import { StarService } from './star.service';
import { TierService } from './tier.service';

@Injectable()
export class EquipUpgradeRpc {
  constructor(
    private readonly stars: StarService,
    private readonly sockets: SocketService,
    private readonly tiers: TierService,
  ) {}

  @Rpc('starOne', { requireCharacter: true, forbidInBattle: true })
  starOne(session: Session, args: unknown[]): Promise<StarReply> {
    return this.star(session, Number(args[0]), idArg(args[1], 'equipId'), idArg(args[2], 'stoneId'), null);
  }

  @Rpc('starAll', { requireCharacter: true, forbidInBattle: true })
  starAll(session: Session, args: unknown[]): Promise<StarReply> {
    return this.star(session, Number(args[0]), idArg(args[1], 'equipId'), idArg(args[3], 'stoneId'), Number(args[2]));
  }

  @Rpc('getStarNum', { requireCharacter: true })
  getStarNum(session: Session, args: unknown[]): Promise<number> {
    return this.stars.starNum(session.characterId!, idArg(args[0], 'equipId'));
  }

  @Rpc('holeDig', { requireCharacter: true, forbidInBattle: true })
  async holeDig(session: Session, args: unknown[]): Promise<HoleDigReply> {
    const diamondId = idArg(args[0], 'diamondId');
    const equipId = idArg(args[1], 'equipId');
    const fail: HoleDigReply = { equSlotId: equipId, diamondSlotId: diamondId, num: 0, flag: false };
    return this.send(session, fail, () => this.sockets.dig(session.characterId!, diamondId, equipId));
  }

  @Rpc('getHoleNum', { requireCharacter: true })
  getHoleNum(session: Session, args: unknown[]): Promise<HoleNumReply> {
    return this.sockets.holeNum(session.characterId!, idArg(args[0], 'equipId'));
  }

  @Rpc('getJewelData', { requireCharacter: true })
  getJewelData(session: Session, args: unknown[]): Promise<JewelData> {
    return this.sockets.jewelData(session.characterId!, idArg(args[0], 'equipId'));
  }

  @Rpc('jewelSet', { requireCharacter: true, forbidInBattle: true })
  jewelSet(session: Session, args: unknown[]): Promise<number> {
    const equipId = idArg(args[0], 'equipId');
    return this.send(session, 0, () => this.sockets.setGems(session.characterId!, equipId, args[1]));
  }

  @Rpc('jewelDel', { requireCharacter: true, forbidInBattle: true })
  jewelDel(session: Session, args: unknown[]): Promise<boolean> {
    const equipId = idArg(args[0], 'equipId');
    return this.send(session, false, () => this.sockets.removeGem(session.characterId!, equipId, Number(args[1])));
  }

  @Rpc('bindItem', { requireCharacter: true, forbidInBattle: true })
  bindItem(session: Session, args: unknown[]): Promise<BindItemReply> {
    const itemId = idArg(args[0], 'itemId');
    return this.send(session, { success: false }, () => this.tiers.bindItem(session.characterId!, itemId));
  }

  @Rpc('changeLevel', { requireCharacter: true, forbidInBattle: true })
  changeLevel(session: Session, args: unknown[]): Promise<ChangeLevelReply> {
    const req = parseUpgradeRequest(args[0]);
    return this.send(session, { f: false }, () => this.tiers.changeLevel(session.characterId!, req));
  }

  /** `equResolve(equipId, md5)`: the password argument is ignored (no secondary password in H5). */
  @Rpc('equResolve', { requireCharacter: true, forbidInBattle: true })
  equResolve(session: Session, args: unknown[]): Promise<boolean> {
    const equipId = idArg(args[0], 'equipId');
    return this.send(session, false, () => this.tiers.resolve(session.characterId!, equipId));
  }

  /** H5 helper: material / cost lines of one equipment for the upgrade tabs. */
  @Rpc('getUpgradeInfo', { requireCharacter: true })
  getUpgradeInfo(session: Session, args: unknown[]): Promise<UpgradeInfo> {
    return this.tiers.info(session.characterId!, idArg(args[0], 'equipId'));
  }

  private star(session: Session, count: number, equipId: number, stoneId: number, target: number | null): Promise<StarReply> {
    const fail: StarReply = { equSlotId: equipId, starSlotId: stoneId, num: 0, starNum: 0, flag: false };
    return this.send(session, fail, () => this.stars.run(session.characterId!, count, equipId, stoneId, target));
  }

  private send<R>(session: Session, fail: R, op: () => Promise<{ reply: R; pushes: Push[] }>): Promise<R> {
    return guarded(session, fail, async () => {
      const r = await op();
      sendPushes(session, r.pushes);
      return r.reply;
    });
  }
}
