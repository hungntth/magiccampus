// SignInModule (M8 phase A): the legacy 5-day panel and the monthly calendar on one ledger (character_signins).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { SigninLedger } from './signin-ledger.service';
import { SigninRpc } from './signin.rpc';
import { CharacterSignin, CharacterSigninSchema } from './signin.schema';
import { SigninService } from './signin.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterSignin.name, schema: CharacterSigninSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    ActivityEventsModule,
    ActivityRewardsModule,
  ],
  providers: [SigninLedger, SigninService, SigninRpc],
})
export class SignInModule {}
