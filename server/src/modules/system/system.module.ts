// System module: connection-level helpers that belong to no game feature (net delay ping).

import { Module } from '@nestjs/common';
import { SystemRpc } from './system.rpc';

@Module({
  providers: [SystemRpc],
})
export class SystemModule {}
