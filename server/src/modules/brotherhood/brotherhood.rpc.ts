// Kết bái RPCs (Flash names): beginBrother (leader confirmed the fee), becomeBrother(bool) / acceptNewMemToBrother(bool) /
// disbandBrothers(bool) (each participant's answer), breakBrotherShip, updateBrotherTitle(title). Results travel as pushes
// (onAgreeSetBrother, onAcceptNewBroMem, onFailTo*, onSetBrotherTitle, onBrotherTitleUpdate, onInitViewImC...); replies are null.

import { Injectable } from '@nestjs/common';
import { BrotherKind } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { BrotherExec } from './brother-exec.service';
import { BrotherhoodService } from './brotherhood.service';

/** Go boolArg: a bool, a non-zero number or the strings "true" / "1". */
const boolArg = (v: unknown): boolean => v === true || v === 'true' || v === '1' || (typeof v === 'number' && v !== 0);

@Injectable()
export class BrotherhoodRpc {
  constructor(
    private readonly brothers: BrotherhoodService,
    private readonly exec: BrotherExec,
  ) {}

  @Rpc('beginBrother', { requireCharacter: true, forbidInBattle: true })
  beginBrother(session: Session): Promise<null> {
    return this.brothers.begin(session);
  }

  @Rpc('becomeBrother', { requireCharacter: true, forbidInBattle: true })
  becomeBrother(session: Session, args: unknown[]): Promise<null> {
    return this.brothers.answer(session, BrotherKind.SWEAR, boolArg(args[0]));
  }

  @Rpc('acceptNewMemToBrother', { requireCharacter: true, forbidInBattle: true })
  acceptNewMemToBrother(session: Session, args: unknown[]): Promise<null> {
    return this.brothers.answer(session, BrotherKind.JOIN, boolArg(args[0]));
  }

  @Rpc('disbandBrothers', { requireCharacter: true, forbidInBattle: true })
  disbandBrothers(session: Session, args: unknown[]): Promise<null> {
    return this.brothers.answer(session, BrotherKind.DISBAND, boolArg(args[0]));
  }

  @Rpc('breakBrotherShip', { requireCharacter: true, forbidInBattle: true })
  breakBrotherShip(session: Session): Promise<null> {
    return this.exec.leave(session);
  }

  @Rpc('updateBrotherTitle', { requireCharacter: true, forbidInBattle: true })
  updateBrotherTitle(session: Session, args: unknown[]): Promise<null> {
    return this.exec.setTitle(session, args[0]);
  }
}
