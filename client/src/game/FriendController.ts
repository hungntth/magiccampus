// Friends / blacklist client wiring (phase D): owns the lists fed by onInitViewImC / onAddRelationship / onDelRelationship /
// onAddRelationByName, the "Hảo hữu" panel (HUD button / K key) and the blacklist lookup SocialController uses to drop
// onSay / onWisper / onP2pWisper from blacklisted characters (legacy Core.isBlack). The snapshot is requested at construction
// (so the filter works before the panel is ever opened) and on every panel open (online markers; no presence push exists).

import { RelationType, type InitViewImC, type RelationEntry, type RelationTypeId } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { FriendPanel } from '../ui/friendPanel';
import { toast } from '../ui/screens';

export interface FriendHost {
  client: GameClient;
  whisper(name: string): void;
  privateChat(id: number, name: string): void;
  invite(id: number): void;
}

export class FriendController {
  private friend: RelationEntry[] = [];
  private black: RelationEntry[] = [];
  private readonly panel: FriendPanel;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: FriendHost) {
    const { client } = host;
    this.panel = new FriendPanel({
      lists: () => ({ friend: this.friend, black: this.black }),
      add: (name, type) => this.addByName(name, type),
      remove: (e) => this.confirmRemove(e),
      whisper: (e) => host.whisper(e.name),
      privateChat: (e) => host.privateChat(e.cid, e.name),
      invite: (e) => host.invite(e.cid),
      refresh: () => this.refresh(),
    });
    this.offs.push(
      client.on('onInitViewImC', (data) => this.onInit(data as InitViewImC)),
      client.on('onAddRelationship', (data) => this.onAdd(data as RelationEntry)),
      client.on('onDelRelationship', (id) => this.onDel(Number(id))),
      client.on('onAddRelationByName', (code) => {
        if (Number(code) === -1) toast('Người chơi này không tồn tại!', true);
      }),
    );
    this.refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
  }

  /** Blacklisted character id: its chat / whispers are dropped locally. */
  isBlack(cid: number): boolean {
    return this.black.some((e) => e.cid === cid);
  }

  /** HUD friend button / K key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show();
  }

  /** Player menu "Kết bạn" and the panel's add box. The server swaps a blacklist row for a friend row (and back). */
  addByName(name: string, type: RelationTypeId = RelationType.FRIEND): void {
    void this.host.client.call('addRelationByName', name, type).catch((e) => toast((e as Error).message, true));
  }

  private refresh(): void {
    void this.host.client.call('initViewImC').catch(() => undefined);
  }

  private confirmRemove(e: RelationEntry): void {
    const what = e.type === RelationType.FRIEND ? 'danh sách bạn bè' : 'sổ đen';
    askConfirm(`Xác nhận xóa ${e.name} khỏi ${what}?`, () => {
      void this.host.client.call('delRelationship', e.id).then(
        () => toast(`${e.type === RelationType.FRIEND ? 'Xóa bạn' : 'Xóa danh sách đen'}: ${e.name}`),
        (err) => toast((err as Error).message, true),
      );
    });
  }

  private onInit(data: InitViewImC): void {
    this.friend = data.friend;
    this.black = data.black;
    this.panel.render();
  }

  private onAdd(entry: RelationEntry): void {
    const list = entry.type === RelationType.FRIEND ? this.friend : this.black;
    if (!list.some((e) => e.id === entry.id)) list.unshift(entry);
    toast(`${entry.type === RelationType.FRIEND ? 'Kết bạn' : 'Danh sách đen'}: ${entry.name}`);
    this.panel.render();
  }

  private onDel(id: number): void {
    this.friend = this.friend.filter((e) => e.id !== id);
    this.black = this.black.filter((e) => e.id !== id);
    this.panel.render();
  }
}
