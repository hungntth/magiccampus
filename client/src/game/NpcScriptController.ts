// M10 scripted NPC content (legacy NpcScriptPanel / CallBack): onList(npcId, title, info, options) opens a menu in the NPC
// dialog and a pick sends npcScript(func) (`close_dialog` only closes); onNpcMsg(npcId, text) replaces the open dialog's text
// or shows a speech bubble; onMidNote(text) is a centre toast; onSystemSay(text) a system chat line.

import { NPC_SCRIPT_CLOSE, type NpcMenuOption } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { stripTags, type NpcDialog } from '../ui/npcDialog';
import { toast } from '../ui/screens';
import type { NpcLayer } from './NpcLayer';

export class NpcScriptController {
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly client: GameClient,
    private readonly dialog: NpcDialog,
    private readonly npcs: NpcLayer,
    private readonly chat: ChatBox,
  ) {
    this.offs.push(
      client.on('onList', (npcId, title, info, options) => this.onList(Number(npcId), String(title ?? ''), String(info ?? ''), options)),
      client.on('onNpcMsg', (npcId, text) => this.onNpcMsg(Number(npcId), String(text ?? ''))),
      client.on('onMidNote', (text) => toast(stripTags(String(text ?? '')), false, 5000)),
      client.on('onSystemSay', (text) => this.chat.system(stripTags(String(text ?? '')))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  private onList(npcId: number, title: string, info: string, raw: unknown): void {
    const options: NpcMenuOption[] = (Array.isArray(raw) ? raw : [])
      .filter((o): o is { label: unknown; func: unknown } => !!o && typeof o === 'object' && 'func' in o)
      .map((o) => ({ label: String(o.label ?? ''), func: String(o.func ?? '') }))
      .filter((o) => o.func !== '');
    const name = this.npcs.get(npcId)?.displayName ?? title;
    this.dialog.showMenu(npcId, name, this.npcs.icon(npcId), title, info, options, (o) => {
      if (o.func === NPC_SCRIPT_CLOSE) return;
      void this.client.call('npcScript', o.func).catch((e) => toast((e as Error).message, true));
    });
  }

  private onNpcMsg(npcId: number, text: string): void {
    if (!text) return;
    if (this.dialog.npcId === npcId) this.dialog.setText(text);
    else this.npcs.get(npcId)?.say(stripTags(text));
  }
}
