// ThreePvpCoreModule: the dependency-free 3v3 state (rooms, run, strip entry of icon 22). Imported by the activity module for the login
// strip list without pulling in the whole event module.

import { Module } from '@nestjs/common';
import { ThreePvpState } from './threepvp-state';

@Module({
  providers: [ThreePvpState],
  exports: [ThreePvpState],
})
export class ThreePvpCoreModule {}
