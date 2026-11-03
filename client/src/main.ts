// Entry point: connect → login → character select → world. Reconnects to login on socket close.

import { Application } from 'pixi.js';
import { GameClient, defaultWsUrl } from './net/client';
import { showCharSelect, showLogin, toast } from './ui/screens';
import { GameScene } from './game/GameScene';

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#0b0e14', antialias: true });
  document.getElementById('game')!.appendChild(app.canvas);

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
      await showLogin(client);
      const player = await showCharSelect(client);
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
