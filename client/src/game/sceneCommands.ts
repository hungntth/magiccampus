// Chat slash commands for the world scene: /go <mapId> (sceneChange), /maps (getMapList).

import type { SceneLoginResponse } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';

export async function runSceneCommand(
  cmd: string,
  args: string[],
  client: GameClient,
  chat: ChatBox,
  applyScene: (res: SceneLoginResponse) => Promise<void>,
): Promise<void> {
  try {
    if (cmd === 'go') {
      const mapId = Number(args[0]);
      if (!Number.isInteger(mapId)) {
        chat.system('Dùng: /go <mapId>');
        return;
      }
      await applyScene(await client.call<SceneLoginResponse>('sceneChange', mapId));
      return;
    }
    if (cmd === 'maps') {
      const maps = await client.call<{ id: number; name: string; type: number }[]>('getMapList');
      chat.system(maps.map((m) => `${m.id}:${m.name}`).join(' · '));
      return;
    }
    chat.system(`Lệnh không rõ: /${cmd}`);
  } catch (e) {
    chat.system(`Lỗi: ${(e as Error).message}`);
  }
}
