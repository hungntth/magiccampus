// Chat slash commands for the world scene: /go <mapId> (gmGoMap, dev teleport), /maps (getMapList), /tp (teleport map picker: scroll or gold), /buff <id> [seconds] (gmAddBuff), /grant <currency|item|title> <id> <n> (gmGrant).

import type { GmGrantResult, SceneLoginResponse } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';

export async function runSceneCommand(
  cmd: string,
  args: string[],
  client: GameClient,
  chat: ChatBox,
  applyScene: (res: SceneLoginResponse) => Promise<void>,
  openTransport: () => void = () => undefined,
): Promise<void> {
  try {
    if (cmd === 'go') {
      const mapId = Number(args[0]);
      if (!Number.isInteger(mapId)) {
        chat.system('Dùng: /go <mapId>');
        return;
      }
      await applyScene(await client.call<SceneLoginResponse>('gmGoMap', mapId));
      return;
    }
    if (cmd === 'tp') {
      openTransport();
      return;
    }
    if (cmd === 'maps') {
      const maps = await client.call<{ id: number; name: string; type: number }[]>('getMapList');
      chat.system(maps.map((m) => `${m.id}:${m.name}`).join(' · '));
      return;
    }
    if (cmd === 'buff') {
      const id = Number(args[0]);
      const secs = args[1] === undefined ? 0 : Number(args[1]);
      if (!Number.isInteger(id) || !Number.isInteger(secs)) {
        chat.system('Dùng: /buff <id> [giây] (0 = vĩnh viễn)');
        return;
      }
      await client.call('gmAddBuff', id, secs);
      return;
    }
    if (cmd === 'grant') {
      const kind = args[0];
      if (!['currency', 'item', 'title', 'equip'].includes(kind ?? '') || args[1] === undefined) {
        chat.system('Dùng: /grant <currency|item|title|equip> <id> [n] [khóa] (currency: tên hoặc id, vd spirituality; title: n = giây, 0 = vĩnh viễn; equip: id trang bị, khóa = 1)');
        return;
      }
      const r = await client.call<GmGrantResult>('gmGrant', kind, args[1], args[2] === undefined ? undefined : Number(args[2]), args[3] === undefined ? undefined : Number(args[3]));
      chat.system(`Đã cấp: ${r.note}`);
      return;
    }
    chat.system(`Lệnh không rõ: /${cmd}`);
  } catch (e) {
    chat.system(`Lỗi: ${(e as Error).message}`);
  }
}
