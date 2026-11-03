import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { GameGateway } from './game.gateway';
import { RpcRegistry } from './rpc.registry';
import { SceneManager } from './scene.manager';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [RpcRegistry, SceneManager, GameGateway],
  exports: [RpcRegistry, SceneManager, GameGateway],
})
export class GatewayModule {}
