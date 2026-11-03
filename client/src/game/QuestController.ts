// Client quest state + flows: active quests (initQuestManager / onAddChaQuest / onCancelQuest), NPC
// markers (onSetNpcState), rewards (onUPP / onAddMoney / onPlayerLevelUp), the quest panel and tracker.
// RPCs: takeQuest, finishQuest, cancelQuest (throttled to 1 / 1100 ms each), initQuestManager on scene load.

import { MAX_QUEST_NUM } from '@mc/shared';
import type {
  CancelQuestResult, ChaQuest, FinishQuestArg, FinishQuestReply, InitQuestManagerReply, PlayerData,
  PlayerLevelUp, PlayerUpdate, QuestView,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { QuestPanel } from '../ui/questPanel';
import { QuestTracker } from '../ui/questTracker';
import { toast } from '../ui/screens';
import type { Entity } from './Entity';

const THROTTLE_MS = 1100;

export interface QuestHost {
  client: GameClient;
  chat: ChatBox;
  player: PlayerData;
  npc(id: number): Entity | undefined;
  npcIcon(id: number): string;
  mapId(): number;
  talkToNpc(id: number): void;
  playerChanged(): void;
}

export class QuestController {
  private readonly quests = new Map<number, ChaQuest>();
  private readonly panel = new QuestPanel();
  private readonly tracker: QuestTracker;
  private readonly lastCall = new Map<string, number>();
  private readonly offs: (() => void)[] = [];
  private pendingMoney = ''; // onAddMoney arrives just before onUPP; reported together

  constructor(private readonly host: QuestHost, ui: HTMLElement) {
    this.tracker = new QuestTracker(ui, (q) => this.openFromTracker(q), (q) => this.find(q));
    const c = host.client;
    this.offs.push(
      c.on('onAddChaQuest', (d) => this.onAdd(d as ChaQuest)),
      c.on('onCancelQuest', (d) => this.onCancel(d as CancelQuestResult)),
      c.on('onSetNpcState', (id, state) => this.host.npc(Number(id))?.setQuestState(Number(state))),
      c.on('onUPP', (d) => this.onUpdate(d as PlayerUpdate)),
      c.on('onAddMoney', (_id, key, amount) => this.onMoney(String(key), Number(amount))),
      c.on('onPlayerLevelUp', (d) => this.host.chat.system(`Chúc mừng! Bạn đã lên cấp ${(d as PlayerLevelUp).level}`)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
    this.tracker.destroy();
  }

  closePanel(): void {
    this.panel.close();
  }

  async load(): Promise<void> {
    const res = await this.host.client.call<InitQuestManagerReply>('initQuestManager');
    this.quests.clear();
    for (const q of Object.values(res.q)) this.quests.set(q.qid, q);
    this.tracker.render(this.quests.values());
  }

  /** Quest row clicked in the NPC dialog. */
  openFromNpc(view: QuestView, npcId: number, npcName: string): void {
    this.showPanel(view, npcId, npcName);
  }

  private openFromTracker(q: ChaQuest): void {
    this.showPanel(q, null, '');
  }

  private showPanel(view: QuestView, npcId: number | null, npcName: string): void {
    this.panel.show(view, {
      npcId,
      npcName,
      iconCode: npcId !== null ? this.host.npcIcon(npcId) : '0',
      onTake: () => npcId !== null && this.take(view, npcId),
      onFinish: () => this.finish(view, npcId),
      onCancel: () => this.cancel(view),
    });
  }

  private take(view: QuestView, npcId: number): void {
    if (this.quests.size >= MAX_QUEST_NUM) {
      toast('Nhiệm vụ mà bạn có thể nhận đã đạt giới hạn!', true);
      return;
    }
    if (!this.throttle('take')) return;
    this.panel.close();
    void this.host.client.call('takeQuest', view.qid, npcId).catch((e) => toast((e as Error).message, true));
  }

  private finish(view: QuestView, npcId: number | null): void {
    if (!this.throttle('finish')) return;
    const arg: FinishQuestArg = { i: view.qid, s: -1, n: npcId ?? -1 };
    void this.host.client
      .call<FinishQuestReply>('finishQuest', arg)
      .then((r) => {
        if (!r.flag) {
          toast(r.info ?? 'Không thể hoàn thành nhiệm vụ', true);
          return;
        }
        const p = this.host.player;
        p.questLog = `${p.questLog || '|'}${view.qid}|`;
        if (r.qn !== undefined) p.qn = r.qn;
        this.quests.delete(view.qid);
        this.tracker.render(this.quests.values());
        this.panel.close();
        this.host.chat.system(`Hoàn thành nhiệm vụ: ${view.data.name}`);
        if (npcId !== null && view.data.completeText) this.host.npc(npcId)?.say(view.data.completeText);
      })
      .catch((e) => toast((e as Error).message, true));
  }

  private cancel(view: QuestView): void {
    if (!this.throttle('cancel')) return;
    void this.host.client.call('cancelQuest', view.qid).catch((e) => toast((e as Error).message, true));
  }

  private find(q: ChaQuest): void {
    if (!q.pos) return;
    if (q.pos.map === this.host.mapId()) this.host.talkToNpc(q.data.finishNpc);
    else toast(`${q.fName} ở bản đồ ${q.pos.name || q.pos.map}`);
  }

  private onAdd(q: ChaQuest): void {
    this.quests.set(q.qid, q);
    this.host.player.qn = this.quests.size;
    this.tracker.render(this.quests.values());
    this.host.chat.system(`Nhận nhiệm vụ: ${q.data.name}`);
  }

  private onCancel(r: CancelQuestResult): void {
    if (!r.flag) {
      toast(r.info ?? 'Không thể hủy nhiệm vụ', true);
      return;
    }
    const q = this.quests.get(r.qid);
    this.quests.delete(r.qid);
    this.host.player.qn = r.qn;
    this.tracker.render(this.quests.values());
    if (this.panel.questId === r.qid) this.panel.close();
    if (q) this.host.chat.system(`Đã hủy nhiệm vụ: ${q.data.name}`);
  }

  private onUpdate(u: PlayerUpdate): void {
    const gained = u.exp !== undefined ? u.exp - this.host.player.exp : 0;
    Object.assign(this.host.player, u);
    const parts = [gained > 0 ? `${gained} Exp` : '', this.pendingMoney].filter(Boolean);
    this.pendingMoney = '';
    if (parts.length > 0) this.host.chat.system(`Nhận được ${parts.join(', ')}`);
    this.host.playerChanged();
  }

  private onMoney(key: string, amount: number): void {
    const label = key === 'gold' ? 'Vàng' : 'Tiền';
    if (amount > 0) this.pendingMoney = `${amount} ${label}`;
  }

  private throttle(kind: string): boolean {
    const now = performance.now();
    if (now - (this.lastCall.get(kind) ?? -Infinity) < THROTTLE_MS) return false;
    this.lastCall.set(kind, now);
    return true;
  }
}
