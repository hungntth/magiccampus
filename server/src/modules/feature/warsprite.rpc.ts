// War sprite + magic crystal RPCs (Flash names, Go reply shapes). War sprite: getSpWarData, getWSPBuffList, addWarSprite[Gold](idx),
// addBattleSprite[Gold](idx); push updateWSPPanel. Magic crystal: initMagicCrystalData, MagicCrystalActive / Up / Recovery(index),
// MagicCrystalAddPower(index, amount, pointType "1" | "2"); mutations reply null and push onInitMagicCrystalData.

import { Injectable } from '@nestjs/common';
import { WAR_SPRITE, type MagicCrystalData, type WspPanelData, type WspUpgradeReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { CrystalService } from './crystal.service';
import { WarSpriteService } from './warsprite.service';
import type { WspKind } from './warsprite-rules';

function indexArg(args: unknown[], max: number, min: number, name: string): number {
  const n = Number(args[0]);
  if (!Number.isInteger(n) || n < min || n > max) throw RpcException.invalidArgs(name);
  return n;
}

const wspIndex = (args: unknown[]): number => indexArg(args, WAR_SPRITE.SLOTS, 1, 'index');
const slotIndex = (args: unknown[]): number => indexArg(args, 15, 0, 'index');

@Injectable()
export class WarSpriteRpc {
  constructor(
    private readonly wsp: WarSpriteService,
    private readonly crystal: CrystalService,
  ) {}

  @Rpc('getSpWarData', { requireCharacter: true })
  getSpWarData(session: Session): Promise<WspPanelData> {
    return this.wsp.panel(session.characterId!);
  }

  @Rpc('getWSPBuffList', { requireCharacter: true })
  getWSPBuffList(session: Session): Promise<Record<string, number>> {
    return this.wsp.totals(session.characterId!);
  }

  private up(session: Session, args: unknown[], kind: WspKind, gold: boolean): Promise<WspUpgradeReply> {
    const idx = wspIndex(args);
    return midNoteOnFail(session, () => this.wsp.upgrade(session, kind, idx, gold));
  }

  @Rpc('addWarSprite', { requireCharacter: true, forbidInBattle: true })
  addWarSprite(session: Session, args: unknown[]): Promise<WspUpgradeReply> {
    return this.up(session, args, 1, false);
  }

  @Rpc('addWarSpriteGold', { requireCharacter: true, forbidInBattle: true })
  addWarSpriteGold(session: Session, args: unknown[]): Promise<WspUpgradeReply> {
    return this.up(session, args, 1, true);
  }

  @Rpc('addBattleSprite', { requireCharacter: true, forbidInBattle: true })
  addBattleSprite(session: Session, args: unknown[]): Promise<WspUpgradeReply> {
    return this.up(session, args, 2, false);
  }

  @Rpc('addBattleSpriteGold', { requireCharacter: true, forbidInBattle: true })
  addBattleSpriteGold(session: Session, args: unknown[]): Promise<WspUpgradeReply> {
    return this.up(session, args, 2, true);
  }

  @Rpc('initMagicCrystalData', { requireCharacter: true })
  initMagicCrystalData(session: Session): Promise<MagicCrystalData> {
    return this.crystal.init(session);
  }

  @Rpc('MagicCrystalActive', { requireCharacter: true, forbidInBattle: true })
  async magicCrystalActive(session: Session, args: unknown[]): Promise<null> {
    const i = slotIndex(args);
    await midNoteOnFail(session, () => this.crystal.activate(session, i));
    return null;
  }

  @Rpc('MagicCrystalUp', { requireCharacter: true, forbidInBattle: true })
  async magicCrystalUp(session: Session, args: unknown[]): Promise<null> {
    const i = slotIndex(args);
    await midNoteOnFail(session, () => this.crystal.levelUp(session, i));
    return null;
  }

  @Rpc('MagicCrystalRecovery', { requireCharacter: true, forbidInBattle: true })
  async magicCrystalRecovery(session: Session, args: unknown[]): Promise<null> {
    const i = slotIndex(args);
    await midNoteOnFail(session, () => this.crystal.recover(session, i));
    return null;
  }

  @Rpc('MagicCrystalAddPower', { requireCharacter: true, forbidInBattle: true })
  async magicCrystalAddPower(session: Session, args: unknown[]): Promise<null> {
    const i = slotIndex(args);
    const amount = Number(args[1]);
    const type = String(args[2] ?? '');
    if (!Number.isInteger(amount)) throw RpcException.invalidArgs('amount');
    await midNoteOnFail(session, () => this.crystal.addPower(session, i, amount, type));
    return null;
  }
}
