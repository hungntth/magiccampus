// Kết bái client wiring (M14 C): answers every stock prompt with a confirm (CALLBACK_S[196-207]): onLeaderConfirmToBro -> beginBrother,
// onAgreeSetBrother / onAcceptNewBroMem / onBeginDisbondBrothers -> becomeBrother / acceptNewMemToBrother / disbandBrothers (bool),
// onSetBrotherTitle / onUpdateBrotherTitle -> title input -> confirm -> updateBrotherTitle, onBreakBrother -> breakBrotherShip, the
// onFailTo* pushes (refuser looked up in the IM lists) and onBrotherTitleUpdate (own suffix; the nameplates are TitleController's).
// Also owns the IM "Kết bái" tab (registered through the host, same id replaces the plain list).

import {
  BROTHER, BROTHER_FUNC, BROTHER_TEXT,
  type AgreeSetBrother, type BrotherTitleUpdate, type InitViewImC, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { brotherTabSpec } from '../ui/im/brotherTab';
import { askBrotherTitle } from '../ui/im/brotherTitleDialog';
import type { ImTabSpec } from '../ui/im/imTabs';
import { toast } from '../ui/screens';

export interface BrotherHost {
  client: GameClient;
  chat: { notice(text: string): void };
  player: PlayerData;
  /** Current IM lists (the refuser's name is looked up in them). */
  lists(): InitViewImC;
  /** The IM window: registering a tab with the same id replaces it and re-renders. */
  registerTab(spec: ImTabSpec): void;
}

export class BrotherController {
  private readonly offs: (() => void)[] = [];
  private readonly spec: ImTabSpec;
  private selected: number | null = null;

  constructor(private readonly host: BrotherHost) {
    this.spec = brotherTabSpec({
      title: () => String(this.host.player.broT ?? ''),
      selected: () => this.selected,
      select: (id) => {
        this.selected = id === this.selected ? null : id;
        this.host.registerTab(this.spec);
      },
      rename: () => this.askTitle(),
      leave: () => this.confirmLeave(),
      disband: () => void this.host.client.call('npcScript', BROTHER_FUNC.disband).catch((e) => this.fail(e)),
      guide: () => this.host.chat.notice(BROTHER_TEXT.tabGuide),
    });
    host.registerTab(this.spec);
    const { client } = host;
    this.offs.push(
      client.on('onLeaderConfirmToBro', () => this.confirm(BROTHER_TEXT.leaderFee, () => this.call('beginBrother'))),
      client.on('onAgreeSetBrother', (d) => this.onAgree(d as AgreeSetBrother)),
      client.on('onAcceptNewBroMem', (names, hasBrother) => this.onAcceptNew(names, Boolean(hasBrother))),
      client.on('onBeginDisbondBrothers', () => this.answer(BROTHER_TEXT.disband, 'disbandBrothers')),
      client.on('onFailToBecomeBrother', (cid) => toast(BROTHER_TEXT.refused(this.nameOf(Number(cid))), true)),
      client.on('onFailToAcceptNewBroMem', (cid) => toast(BROTHER_TEXT.refused(this.nameOf(Number(cid))), true)),
      client.on('onFailToDiabondBrothers', (cid) => toast(BROTHER_TEXT.disbandRefused(this.nameOf(Number(cid))), true)),
      client.on('onSetBrotherTitle', () => this.confirm(BROTHER_TEXT.askTitle, () => this.askTitle())),
      client.on('onUpdateBrotherTitle', () => this.askTitle()),
      client.on('onBreakBrother', () => this.confirmLeave()),
      client.on('onBrotherTitleUpdate', (d) => this.onTitle(d as BrotherTitleUpdate)),
      client.on('onInitViewImC', () => this.syncTitle()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  private fail(e: unknown): void {
    toast((e as Error).message, true);
  }

  private call(method: string, ...args: unknown[]): void {
    void this.host.client.call(method, ...args).catch((e) => this.fail(e));
  }

  /** Yes / No prompt that closes itself once the server's 60 s answer window is over. */
  private confirm(text: string, onYes: () => void, onNo?: () => void): void {
    const close = askConfirm(text, onYes, onNo);
    window.setTimeout(close, BROTHER.answerMs);
  }

  private answer(text: string, method: 'becomeBrother' | 'acceptNewMemToBrother' | 'disbandBrothers'): void {
    this.confirm(text, () => this.call(method, true), () => this.call(method, false));
  }

  private onAgree(d: AgreeSetBrother): void {
    this.answer(BROTHER_TEXT.agree(d.cname), 'becomeBrother');
  }

  /** hasBrother true: the receiver is a brother and `names` are the newcomers; false: the receiver is the newcomer. */
  private onAcceptNew(names: unknown, hasBrother: boolean): void {
    const list = Array.isArray(names) ? names.map(String) : [];
    this.answer(hasBrother ? BROTHER_TEXT.acceptNew(list) : BROTHER_TEXT.joinGroup, 'acceptNewMemToBrother');
  }

  private askTitle(): void {
    // The confirm opens a beat later: an Enter keypress that submitted the input must not also answer the confirm.
    askBrotherTitle((title) => window.setTimeout(() => askConfirm(BROTHER_TEXT.confirmTitle(title), () => this.call('updateBrotherTitle', title)), 150));
  }

  private confirmLeave(): void {
    askConfirm(BROTHER_TEXT.leave, () => this.call('breakBrotherShip'));
  }

  private nameOf(cid: number): string {
    const l = this.host.lists();
    return [...l.brother, ...l.friend, ...l.tutor, ...l.couple, ...l.enemy].find((e) => e.cid === cid)?.name ?? 'Một thành viên';
  }

  private onTitle(d: BrotherTitleUpdate): void {
    if (d.cid !== this.host.player.id) return;
    this.host.player.broT = d.tname;
    this.host.registerTab(this.spec);
  }

  /** The group is gone when the brother list is empty: forget a stale suffix. */
  private syncTitle(): void {
    if (this.host.lists().brother.length === 0 && this.host.player.broT) this.host.player.broT = '';
  }
}
