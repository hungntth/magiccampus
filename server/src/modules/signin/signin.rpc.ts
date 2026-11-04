// Sign-in RPCs (Flash names): getSignInData, signinNow (legacy 5-day panel), initDailySignInActData,
// initDailySignInActConsumeLimit, dailySignInActDoSignin, dailySignInActGetAward, dailySignInActRetroactive, dailySignInUpActCrit.
// Pushes (self): setBtnsDailySignInAct, onDailySignInActDoSignin, oninitDailySignInActConsumeLimit, updateDailySignInActCrit,
// plus the reward pushes (onUPP, onAddMoney, onAddItem, onBlueMsg).

import { Injectable } from '@nestjs/common';
import type { DailySignInDoReply, DailySignInInit, SignInData } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { SigninService } from './signin.service';

@Injectable()
export class SigninRpc {
  constructor(private readonly signin: SigninService) {}

  @Rpc('getSignInData', { requireCharacter: true })
  getSignInData(session: Session): Promise<SignInData> {
    return this.signin.legacyData(session.characterId!);
  }

  @Rpc('signinNow', { requireCharacter: true, forbidInBattle: true })
  signinNow(session: Session): Promise<SignInData> {
    return this.signin.signinNow(session);
  }

  @Rpc('initDailySignInActData', { requireCharacter: true })
  initDailySignInActData(session: Session): Promise<DailySignInInit> {
    return this.signin.init(session);
  }

  @Rpc('initDailySignInActConsumeLimit', { requireCharacter: true })
  async initDailySignInActConsumeLimit(session: Session): Promise<null> {
    await this.signin.consumeLimit(session);
    return null;
  }

  @Rpc('dailySignInActDoSignin', { requireCharacter: true, forbidInBattle: true })
  dailySignInActDoSignin(session: Session): Promise<DailySignInDoReply> {
    return this.signin.doSignin(session);
  }

  @Rpc('dailySignInActGetAward', { requireCharacter: true, forbidInBattle: true })
  dailySignInActGetAward(session: Session): Promise<number> {
    return this.signin.getAward(session);
  }

  @Rpc('dailySignInActRetroactive', { requireCharacter: true, forbidInBattle: true })
  dailySignInActRetroactive(session: Session): Promise<null> {
    return this.signin.retroactive(session);
  }

  @Rpc('dailySignInUpActCrit', { requireCharacter: true, forbidInBattle: true })
  dailySignInUpActCrit(session: Session): Promise<null> {
    return this.signin.upCrit(session);
  }
}
