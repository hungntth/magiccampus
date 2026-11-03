// Process configuration read once from the environment (.env is loaded in main.ts).

import * as path from 'node:path';

export interface AppConfig {
  port: number;
  mongoUri: string;
  assetDir: string;
  seedDir: string;
  corsOrigin: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
    mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame',
    assetDir: path.resolve(process.env.ASSET_DIR ?? '../mcgame/frontend/s/res'),
    seedDir: path.resolve(process.env.SEED_DIR ?? '../mcgame/supabase/seeds'),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
  };
}

export const APP_CONFIG = 'APP_CONFIG';
