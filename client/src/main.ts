// Entry point: connect → login → character select → world. Reconnects to login on socket close.

import { Application } from 'pixi.js';
import { GameClient, defaultWsUrl } from './net/client';
import { showCharSelect } from './ui/charSelect';
import { showLogin } from './ui/loginScreen';
import { toast } from './ui/screens';
import { GameScene } from './game/GameScene';
import { loadSkins } from './ui/hud/skin';
import { initStage } from './ui/stage';

async function main(): Promise<void> {
  const app = new Application();
  initStage();
  // Sharp sprites on HiDPI phones where the stage is scaled down; capped to keep fill cost sane.
  const resolution = Math.min(window.devicePixelRatio || 1, 2);
  await app.init({ resizeTo: window, background: '#0b0e14', antialias: true, resolution, autoDensity: true });
  document.getElementById('game')!.appendChild(app.canvas);
  await loadSkins();

  for (;;) {
    const client = new GameClient(defaultWsUrl());
    let scene: GameScene | null = null;
    let closed = false;
    const closedPromise = new Promise<void>((resolve) => {
      client.onClose((code, reason) => {
        closed = true;
        toast(`Mất kết nối (${code}${reason ? ` ${reason}` : ''})`, true, 5000);
        resolve();
      });
    });

    try {
      await client.connect();
      let player = null;
      while (!player) {
        await showLogin(client);
        player = await showCharSelect(client); // null = "Quay lại" (logged out, same socket)
      }
      scene = new GameScene(app, client, player);
      await scene.enter();
      await closedPromise;
    } catch (err) {
      if (!closed) toast((err as Error).message, true, 5000);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      scene?.destroy();
      app.ticker.start();
    }
  }
}

void main();
