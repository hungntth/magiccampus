// Relationships client wiring: owns the lists fed by onInitViewImC / onAddRelationship / onDelRelationship / onAddRelationByName,
// the "Hảo hữu" panel (HUD button / K key), the friend-request prompt (onBeFriendOfOther Yes/No -> addRelationByName /
// refuseToAddFriend, onRefusedToAddFriend note) and onSetClose (intimacy line in the chat log + row update). The blacklist lookup
// serves SocialController (drops onSay / onWisper / onP2pWisper from blacklisted characters, legacy Core.isBlack). The snapshot is
// requested at construction and on every panel open (online markers; no presence push exists).

import {
  FRIEND_REQUEST_TEXT, RelationType, setCloseLine,
  type BeFriendOfOther, type InitViewImC, type PlayerData, type RefusedToAddFriend, type RelationEntry, type RelationTypeId,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { FriendPanel } from '../ui/friendPanel';
import type { ImTabSpec } from '../ui/im/imTabs';
import { toast } from '../ui/screens';
import { BrotherController } from './BrotherController';
import { MarriageController } from './MarriageController';
import { MentorController } from './MentorController';

export interface FriendHost {
  client: GameClient;
  chat: { notice(text: string): void; system(text: string): void };
  /** Login payload: the Sư đồ tab starts from its ti / tn / tl / tp / ll fields. */
  player: PlayerData;
  whisper(name: string): void;
  privateChat(id: number, name: string): void;
  invite(id: number): void;
}

const emptyLists = (): InitViewImC => ({ friend: [], black: [], enemy: [], couple: [], tutor: [], brother: [] });
const KEYS = ['friend', 'black', 'enemy', 'couple', 'tutor', 'brother'] as const;
const REMOVE_TEXT: Record<number, [string, string]> = {
  [RelationType.FRIEND]: ['danh sách bạn bè', 'Xóa bạn'],
  [RelationType.BLACK]: ['sổ đen', 'Xóa danh sách đen'],
  [RelationType.ENEMY]: ['danh sách kẻ thù', 'Xóa kẻ thù'],
};
const ADD_TEXT: Record<number, string> = { 1: 'Kết bạn', 2: 'Danh sách đen', 3: 'Kẻ thù' };

export class FriendController {
  private lists: InitViewImC = emptyLists();
  private readonly panel: FriendPanel;
  private readonly mentor: MentorController;
  private readonly brother: BrotherController;
  private readonly marriage: MarriageController;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: FriendHost) {
    const { client } = host;
    this.panel = new FriendPanel({
      lists: () => this.lists,
      add: (name, type) => this.addByName(name, type),
      remove: (e) => this.confirmRemove(e),
      whisper: (e) => host.whisper(e.name),
      privateChat: (e) => host.privateChat(e.cid, e.name),
      invite: (e) => host.invite(e.cid),
      refresh: () => this.refresh(),
      couple: () => this.marriage.header(),
    });
    this.offs.push(
      client.on('onInitViewImC', (data) => this.onInit(data as InitViewImC)),
      client.on('onAddRelationship', (data) => this.onAdd(data as RelationEntry)),
      client.on('onDelRelationship', (id) => this.onDel(Number(id))),
      client.on('onAddRelationByName', (code) => {
        if (Number(code) === -1) toast('Người chơi này không tồn tại!', true);
      }),
      client.on('onBeFriendOfOther', (data) => this.onBeFriend(data as BeFriendOfOther)),
      client.on('onRefusedToAddFriend', (data) => toast(FRIEND_REQUEST_TEXT.refused((data as RefusedToAddFriend).name))),
      client.on('onSetClose', (otherId, otherName, num) => this.onSetClose(Number(otherId), String(otherName), Number(num))),
    );
    this.mentor = new MentorController({ client, chat: host.chat, player: host.player, registerTab: (spec) => this.registerTab(spec) });
    this.brother = new BrotherController({ client, chat: host.chat, player: host.player, lists: () => this.lists, registerTab: (spec) => this.registerTab(spec) });
    this.marriage = new MarriageController({ client, chat: host.chat, player: host.player, refreshIm: () => this.panel.render() });
    this.refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.mentor.destroy();
    this.brother.destroy();
    this.marriage.destroy();
    this.panel.close();
  }

  /** Blacklisted character id: its chat / whispers are dropped locally. */
  isBlack(cid: number): boolean {
    return this.lists.black.some((e) => e.cid === cid);
  }

  /** Later phases (mentor / brotherhood) replace or add an IM tab here. */
  registerTab(spec: ImTabSpec): void {
    this.panel.registerTab(spec);
  }

  /** HUD friend button / K key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show();
  }

  /** Player menu "Kết bạn" and the panel's add box. The server swaps a blacklist row for a friend / enemy row (and back). */
  addByName(name: string, type: RelationTypeId = RelationType.FRIEND): void {
    void this.host.client.call('addRelationByName', name, type).catch((e) => toast((e as Error).message, true));
  }

  private refresh(): void {
    void this.host.client.call('initViewImC').catch(() => undefined);
  }

  private confirmRemove(e: RelationEntry): void {
    const [what, done] = REMOVE_TEXT[e.type] ?? ['danh sách', 'Xóa'];
    const extra = e.type === RelationType.FRIEND ? ` có điểm thân mật là ${e.intimacy}` : '';
    askConfirm(`Xác nhận xóa ${e.name}${extra} khỏi ${what}?`, () => {
      void this.host.client.call('delRelationship', e.id).then(
        () => toast(`${done}: ${e.name}`),
        (err) => toast((err as Error).message, true),
      );
    });
  }

  /** CALLBACK_S[96] note when the sender is already a friend, else the CALLBACK_S[97] Yes / No prompt (never for blacklisted senders). */
  private onBeFriend(d: BeFriendOfOther): void {
    if (this.isBlack(d.otherId)) return;
    if (d.alreadyFriend) return void toast(FRIEND_REQUEST_TEXT.note(d.name));
    askConfirm(
      FRIEND_REQUEST_TEXT.ask(d.name),
      () => this.addByName(d.name, RelationType.FRIEND),
      () => void this.host.client.call('refuseToAddFriend', { targetId: d.otherId, selfName: '' }).catch(() => undefined),
    );
  }

  /** CALLBACK_S[77] / [78] / [103]: the chat line plus the new total on the row (a drop only repaints after the next snapshot). */
  private onSetClose(otherId: number, otherName: string, num: number): void {
    this.host.chat.notice(setCloseLine(otherName, num));
    if (num > 0 || num === 0) {
      for (const k of KEYS) for (const e of this.lists[k]) if (e.cid === otherId) e.intimacy = num;
    } else {
      for (const k of KEYS) for (const e of this.lists[k]) if (e.cid === otherId) e.intimacy = Math.max(0, e.intimacy + num);
    }
    this.panel.render();
  }

  private onInit(data: InitViewImC): void {
    this.lists = { ...emptyLists(), ...data };
    this.panel.render();
  }

  private onAdd(entry: RelationEntry): void {
    const list = this.lists[KEYS[entry.type - 1]];
    if (!list.some((e) => e.id === entry.id)) list.unshift(entry);
    toast(`${ADD_TEXT[entry.type] ?? 'Quan hệ'}: ${entry.name}`);
    this.panel.render();
  }

  private onDel(id: number): void {
    for (const k of KEYS) this.lists[k] = this.lists[k].filter((e) => e.id !== id);
    this.panel.render();
  }
}
