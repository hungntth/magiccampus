// WorldBossCoreModule (M10 phase I): only the WbState holder, so ActivityModule can show the icon 15 state in the login strip without
// importing the whole world boss module (combat, scene, rewards).

import { Module } from '@nestjs/common';
import { WbState } from './wb-state.service';

@Module({
  providers: [WbState],
  exports: [WbState],
})
export class WorldBossCoreModule {}
