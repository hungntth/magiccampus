// Client quest state + flows: active quests (initQuestManager / onAddChaQuest / onCancelQuest), NPC
// markers (onSetNpcState), rewards (onUPP / onAddMoney / onPlayerLevelUp), the quest panel and tracker.
// RPCs: takeQuest, finishQuest, cancelQuest (throttled to 1 / 1100 ms each), initQuestManager on scene load.

import { countMatchingPets, isFinishable, MAX_QUEST_NUM, QuestAwardMode, QuestState, requireProgress } from '@mc/shared';
import type {
  CancelQuestResult, ChaQuest, FinishQuestArg, FinishQuestReply, InitQuestManagerReply, PlayerData,
  PlayerLevelUp, PlayerUpdate, QuestView, RequireProgress,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { QuestPanel } from '../ui/questPanel';
import { QuestTracker } from '../ui/questTracker';
import { toast } from '../ui/screens';
import type { Entity } from './Entity';
import { LoopController } from './LoopController';

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
  bagCount(templateId: number): number;
}

export class QuestController {
  private readonly quests = new Map<number, ChaQuest>();
  private readonly panel = new QuestPanel();
  private readonly tracker: QuestTracker;
  readonly loops: LoopController; // loop quests (M8 phase C): states, push messages, take / cancel / repair
  private readonly lastCall = new Map<string, number>();
  private readonly offs: (() => void)[] = [];
  private pendingMoney = ''; // onAddMoney arrives just before onUPP; reported together

  constructor(private readonly host: QuestHost, ui: HTMLElement) {
    this.tracker = new QuestTracker(ui, (q) => this.openFromTracker(q), (q) => this.find(q), (q) => this.progressOf(q));
    const c = host.client;
    this.loops = new LoopController({ client: c, chat: host.chat, quests: () => this.quests.values() });
    this.offs.push(
      c.on('onAddChaQuest', (d) => this.onAdd(d as ChaQuest)),
      // The bag changes after this handler (BagController registers later): re-render once it has applied the push.
      c.on('onAddCharactorSlot', () => this.refreshSoon()),
      c.on('onDelCharactorSlot', () => this.refreshSoon()),
      // Pet turn-in objectives count the owned pets (a rename changes whether one still matches).
      c.on('onAddPet', () => this.refreshSoon()),
      c.on('onDelPet', () => this.refreshSoon()),
      c.on('onUpdatePet', (_id, key) => key === 'petName' && this.refreshSoon()),
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
    this.loops.destroy();
  }

  closePanel(): void {
    this.panel.close();
  }

  async load(): Promise<void> {
    const res = await this.host.client.call<InitQuestManagerReply>('initQuestManager');
    this.quests.clear();
    for (const q of Object.values(res.q)) this.quests.set(q.qid, q);
    this.loops.load(res.l);
    this.tracker.render(this.quests.values());
  }

  /** Quest row clicked in the NPC dialog. */
  openFromNpc(view: QuestView, npcId: number, npcName: string): void {
    this.showPanel(view, npcId, npcName);
  }

  private openFromTracker(q: ChaQuest): void {
    this.showPanel(q, null, '');
  }

  /** Requirement lines and whether the quest can be turned in: the server state, or the bag / kill counters. */
  private progressOf(view: QuestView): { lines: RequireProgress[]; finishable: boolean } {
    const pets = Object.values(this.host.player.petList);
    const lines = requireProgress(view, QuestState.CAN_FINISH, (id) => this.host.bagCount(id), (r) => countMatchingPets(pets, r.itemId, r.q, r.name));
    const taken = view.state === QuestState.TAKEN || view.state === QuestState.CAN_FINISH;
    return { lines, finishable: taken && isFinishable(lines, view.state === QuestState.CAN_FINISH) };
  }

  private refreshSoon(): void {
    setTimeout(() => {
      this.tracker.render(this.quests.values());
      const open = this.panel.current();
      if (!open) return;
      const view = this.quests.get(open.view.qid) ?? open.view;
      this.panel.show(view, { ...open.opts, progress: this.progressOf(view) });
    }, 0);
  }

  private showPanel(view: QuestView, npcId: number | null, npcName: string): void {
    this.panel.show(view, {
      progress: this.progressOf(view),
      npcId,
      npcName,
      iconCode: npcId !== null ? this.host.npcIcon(npcId) : '0',
      classId: this.host.player.classId,
      onTake: () => npcId !== null && this.take(view, npcId),
      onFinish: (selectId) => this.finish(view, npcId, selectId),
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

  private finish(view: QuestView, npcId: number | null, selectId: number): void {
    if (view.data.at === QuestAwardMode.CHOOSE_ONE && view.award.length > 0 && selectId < 0) {
      toast('Vui lòng chọn 1 phần thưởng!', true); // QUESTPANEL_S[6]
      return;
    }
    if (!this.throttle('finish')) return;
    const arg: FinishQuestArg = { i: view.qid, s: selectId, n: npcId ?? -1 };
    void this.host.client
      .call<FinishQuestReply>('finishQuest', arg)
      .then((r) => {
        if (!r.flag) {
          toast(r.info ?? 'Không thể hoàn thành nhiệm vụ', true);
          return;
        }
        const p = this.host.player;
        if (view.data.loopId === undefined) p.questLog = `${p.questLog || '|'}${view.qid}|`; // loop rounds write no history
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
    if (view.data.loopId !== undefined) return this.loops.cancel(view.data.loopId); // a loop round: give the whole loop up
    if (!this.throttle('cancel')) return;
    void this.host.client.call('cancelQuest', view.qid).catch((e) => toast((e as Error).message, true));
  }

  private find(q: ChaQuest): void {
    if (!q.pos) return;
    if (q.pos.map === this.host.mapId()) this.host.talkToNpc(q.data.finishNpc);
    else toast(`${q.fName} ở bản đồ ${q.pos.name || q.pos.map}`);
  }

  /** onAddChaQuest = a newly taken quest, or an update of one we already track (kill counters). */
  private onAdd(q: ChaQuest): void {
    const isNew = !this.quests.has(q.qid);
    this.quests.set(q.qid, q);
    this.host.player.qn = this.quests.size;
    this.tracker.render(this.quests.values());
    if (isNew) this.host.chat.system(`Nhận nhiệm vụ: ${q.data.name}`);
    if (this.panel.questId === q.qid) this.refreshSoon();
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
    // Legacy CALLBACK_S[42..45] "Nhận: " — one [Thông báo] line per gain.
    if (gained > 0) this.host.chat.notice(`Nhận: ${gained} Kinh nghiệm`);
    if (this.pendingMoney) this.host.chat.notice(`Nhận: ${this.pendingMoney}`);
    this.pendingMoney = '';
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
