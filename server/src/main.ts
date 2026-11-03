import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { GameGateway } from './gateway/game.gateway';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.enableCors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  await app.listen(config.port);
  app.get(GameGateway).attach(app.getHttpServer());
  Logger.log(`HTTP + WebSocket listening on :${config.port}`, 'Bootstrap');
  Logger.log(`Assets served from ${config.assetDir}`, 'Bootstrap');
}

void bootstrap();
