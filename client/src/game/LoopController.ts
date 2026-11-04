// Client side of loop quests (M8 phase C): loop states (initQuestManager.l / onTakeLoop), the pushes onCancelLoopQuest and
// onFinishLoopQuest (Flash QuestManager.as:1135-1210 messages), and the takeLoop / cancelLoop / loopRepaire calls the NPC dialog
// and quest panel use. The round itself is an ordinary quest handled by QuestController.

import type { CancelLoopQuestPush, ChaQuest, FinishLoopQuestPush, LoopStateDTO, TakeLoopPush } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';

export interface LoopHost {
  client: GameClient;
  chat: ChatBox;
  /** The quests the player currently holds. */
  quests(): Iterable<ChaQuest>;
}

export class LoopController {
  private readonly states = new Map<number, LoopStateDTO>();
  private readonly names = new Map<number, string>();
  private readonly offs: (() => void)[];

  constructor(private readonly host: LoopHost) {
    const c = host.client;
    this.offs = [
      c.on('onTakeLoop', (d) => this.onTake(d as TakeLoopPush)),
      c.on('onCancelLoopQuest', (d) => this.onCancel(d as CancelLoopQuestPush)),
      c.on('onFinishLoopQuest', (d) => this.onFinish(d as FinishLoopQuestPush)),
    ];
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  load(l: Record<string, LoopStateDTO> | undefined): void {
    this.states.clear();
    for (const s of Object.values(l ?? {})) this.states.set(s.id, s);
  }

  /** NPC dialog entries remember the loop names (the Flash client read them from a static table). */
  rememberName(lid: number, name: string): void {
    this.names.set(lid, name);
  }

  private nameOf(lid: number): string {
    return this.names.get(lid) ?? `Vòng ${lid}`;
  }

  /** Flash repair-button rule: the loop is active but no held quest belongs to it. */
  needsRepair(lid: number): boolean {
    if (!this.states.has(lid)) return false;
    for (const q of this.host.quests()) if (q.data.loopId === lid) return false;
    return true;
  }

  take(lid: number, npcId: number): void {
    void this.host.client.call('takeLoop', lid, npcId).catch(() => undefined); // refusals arrive as onSystemMidMsgOrNote
  }

  repair(lid: number): void {
    void this.host.client.call('loopRepaire', lid).catch((e) => toast((e as Error).message, true));
  }

  /** "Bỏ" on a loop round: ask first (QUESTPANEL_S[20]), then give the whole loop up. */
  cancel(lid: number): void {
    askConfirm('Xác nhận xóa nhiệm vụ vòng này?', () => {
      void this.host.client.call('cancelLoop', lid).catch(() => undefined); // the failure push carries the message
    });
  }

  private onTake(d: TakeLoopPush): void {
    if (d.flag && d.d) this.states.set(d.d.id, d.d);
  }

  private onCancel(d: CancelLoopQuestPush): void {
    if (!d.flag) return toast('Không thể xóa vòng vừa nhận!', true); // QUESTPANEL_S[19]
    this.states.delete(d.id);
    this.host.chat.system(`Từ bỏ nhiệm vụ vòng: ${this.nameOf(d.id)}`); // QUESTPANEL_S[17]
  }

  private onFinish(d: FinishLoopQuestPush): void {
    if (d.name) this.names.set(d.id, d.name);
    const name = this.nameOf(d.id);
    if (d.num !== undefined && d.ft >= d.num) {
      this.states.delete(d.id);
      this.host.chat.system(`Hoàn thành nhiệm vụ vòng: ${name}`); // QUESTPANEL_S[18]
      return;
    }
    const s = this.states.get(d.id);
    if (s) this.states.set(d.id, { ...s, ft: d.ft });
    this.host.chat.system(d.num !== undefined ? `Số vòng hoàn thành ${d.ft} ${name} ${d.ft}/${d.num}` : `Hoàn thành ${d.ft} vòng ${name}`);
  }
}
