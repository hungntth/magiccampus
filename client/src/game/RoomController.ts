// Team-room client wiring (M14 phase F, "Chiêu mộ nhóm"): owns the board / my-room state and every room push (onCreateRoom,
// onGetRoomList, onGetMyRoom, onApplyToRoom, onApplyListChange, onAcceptRoomApply, onKickRoomMember, onMemberLeave (bare cid),
// onSetRoomHost (bare cid), onSetRoomConfig, onRoomSay tuple). Calls createRoom / getRoomList / getMyRoom / applyToRoom /
// acceptRoomApply / kickRoomMember / leaveRoom / setRoomHost / setRoomConfig / roomChat. Refusals arrive as rejected calls (toast).

import {
  ROOM, ROOM_TEXT,
  type ApplyListChangePush, type CreateRoomArg, type MyRoomReply, type PlayerData, type RoomListReply, type RoomMemberRow,
  type RoomSayPush, type SetRoomConfigArg, type SetRoomConfigPush,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { askConfirm } from '../ui/confirmDialog';
import { openRoomForm } from '../ui/groupRecruit/roomForm';
import { RoomPanel, type RoomTab } from '../ui/groupRecruit/roomPanel';
import { toast } from '../ui/screens';
import { stageEl } from '../ui/stage';

export interface RoomHost {
  client: GameClient;
  player: PlayerData;
  chat: ChatBox;
}

const MAX_CHAT_LINES = 60;
const NONE: MyRoomReply = { f: 0 };

export class RoomController {
  private board: RoomListReply | null = null;
  private mine: MyRoomReply = NONE;
  private readonly lines: string[] = [];
  private readonly panel: RoomPanel;
  private readonly button: HTMLButtonElement;
  private readonly offs: (() => void)[] = [];
  private closeForm: (() => void) | null = null;

  constructor(private readonly host: RoomHost) {
    this.panel = new RoomPanel({
      board: () => this.board,
      mine: () => this.mine,
      selfId: () => host.player.id,
      chatLines: () => this.lines,
      onRefresh: () => this.refresh(),
      onApply: (no) => this.act('applyToRoom', no),
      onCreate: () => this.openCreate(),
      onAccept: (m) => this.act('acceptRoomApply', m.cid),
      onKick: (m) => askConfirm(`Trục xuất ${m.name} khỏi nhóm?`, () => this.act('kickRoomMember', m.cid)),
      onGiveHost: (m) => askConfirm(`Giao quyền nhóm trưởng cho ${m.name}?`, () => this.act('setRoomHost', m.cid)),
      onUpdate: () => this.openUpdate(),
      onLeave: () => askConfirm('Rời khỏi nhóm chiêu mộ?', () => this.leave()),
      onSay: (text) => this.act('roomChat', text, false),
      onClose: () => this.close(),
    });
    this.button = document.createElement('button');
    this.button.className = 'gr-recruit-btn';
    this.button.textContent = 'Chiêu mộ';
    this.button.title = 'Chiêu mộ nhóm';
    this.button.onclick = () => this.toggle();
    stageEl().appendChild(this.button);

    const { client } = host;
    this.offs.push(
      client.on('onCreateRoom', () => {
        toast('Đã đăng chiêu mộ nhóm.');
        this.refresh();
      }),
      client.on('onGetRoomList', (d) => this.setBoard(d as RoomListReply)),
      client.on('onGetMyRoom', (d) => this.setMine(d as MyRoomReply)),
      client.on('onApplyToRoom', () => {
        toast('Đã gửi yêu cầu gia nhập nhóm.');
        this.refresh();
      }),
      client.on('onApplyListChange', (d) => this.onApplyChange(d as ApplyListChangePush)),
      client.on('onAcceptRoomApply', (cid) => this.onAccepted(Number(cid))),
      client.on('onKickRoomMember', (d) => this.onKicked(d as RoomMemberRow)),
      client.on('onMemberLeave', (cid) => this.onMemberGone(Number(cid))),
      client.on('onSetRoomHost', (cid) => this.onHost(Number(cid))),
      client.on('onSetRoomConfig', (d) => this.onConfig(d as SetRoomConfigPush)),
      client.on('onRoomSay', (d) => this.onSay(d as RoomSayPush)),
    );
    void this.loadMine(); // seeds the "Nhóm của tôi" state after a reconnect
  }

  /** Opens the window (board tab, or my room when already in one). */
  open(tab?: RoomTab): void {
    if (this.host.player.level < ROOM.minUiLevel) return void toast(ROOM_TEXT.LEVEL_UI, true);
    this.panel.show(tab ?? (this.mine.f === 0 ? 'board' : 'mine'));
    this.refresh();
  }

  close(): void {
    this.closeForm?.();
    this.closeForm = null;
    this.panel.close();
  }

  toggle(): void {
    if (this.panel.isOpen) this.close();
    else this.open();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
    this.button.remove();
  }

  private refresh(): void {
    void this.loadMine();
    this.host.client.call<RoomListReply>('getRoomList').then((r) => this.setBoard(r), fail);
  }

  private async loadMine(): Promise<void> {
    try {
      this.setMine(await this.host.client.call<MyRoomReply>('getMyRoom'));
    } catch (e) {
      fail(e);
    }
  }

  private setBoard(d: RoomListReply): void {
    this.board = d;
    this.panel.render();
  }

  private setMine(d: MyRoomReply): void {
    this.mine = d;
    if (d.f === 0) this.lines.length = 0;
    this.panel.render();
  }

  /** Fire-and-forget call; most actions are followed by a pushed view, the rest refresh here. */
  private act(method: string, arg: unknown, refresh = true): void {
    this.host.client.call(method, arg).then(() => refresh && this.refresh(), fail);
  }

  private leave(): void {
    this.host.client.call('leaveRoom').then(() => {
      this.mine = NONE;
      this.lines.length = 0;
      this.refresh();
    }, fail);
  }

  private openCreate(): void {
    if (this.host.player.level < ROOM.minUiLevel) return void toast(ROOM_TEXT.LEVEL_UI, true);
    this.closeForm?.();
    this.closeForm = openRoomForm({ title: 'Tạo nhóm chiêu mộ', playerLevel: this.host.player.level }, (arg) => {
      this.act('createRoom', arg satisfies CreateRoomArg);
      this.panel.show('mine');
    });
  }

  private openUpdate(): void {
    const d = this.mine.d;
    if (!d) return;
    this.closeForm?.();
    const now = new Date(d.time + 7 * 3_600_000);
    const current: CreateRoomArg = {
      fid: d.fid, type: d.type, minLevel: d.minLevel, maxLevel: d.maxLevel, hour: now.getUTCHours(), minute: now.getUTCMinutes(),
    };
    this.closeForm = openRoomForm({ title: 'Cập nhật nhóm chiêu mộ', playerLevel: this.host.player.level, current }, (a) => {
      const arg: SetRoomConfigArg = { fid: a.fid, type: a.type, minLevel: a.minLevel, maxLevel: a.maxLevel, time: { hour: a.hour, minute: a.minute } };
      this.act('setRoomConfig', arg);
    });
  }

  private onApplyChange(d: ApplyListChangePush): void {
    if (d.f) this.host.chat.system(ROOM_TEXT.APPLY(d.d.name));
    const room = this.mine.d;
    if (room) {
      room.applyList = room.applyList.filter((a) => a.cid !== d.d.cid);
      if (d.f) room.applyList.push(d.d);
      this.panel.render();
    }
    void this.loadMine();
  }

  private onAccepted(cid: number): void {
    const room = this.mine.d;
    const known = room?.applyList.find((a) => a.cid === cid) ?? room?.members.find((m) => m.cid === cid);
    if (known) this.host.chat.system(ROOM_TEXT.JOINED(known.name));
    this.loadMine().then(() => {
      const joined = this.mine.d?.members.find((m) => m.cid === cid);
      if (!known && joined) this.host.chat.system(ROOM_TEXT.JOINED(joined.name));
    });
  }

  private removeMember(cid: number): void {
    const room = this.mine.d;
    if (!room) return;
    room.members = room.members.filter((m) => m.cid !== cid);
    this.panel.render();
  }

  private onKicked(row: RoomMemberRow): void {
    if (row.cid === this.host.player.id) {
      toast('Bạn đã bị trục xuất khỏi nhóm.', true);
      this.setMine(NONE);
    } else {
      this.removeMember(row.cid);
    }
    this.refresh();
  }

  /** The legacy panel ignored this push because it expects an object: the payload is a bare character id. */
  private onMemberGone(cid: number): void {
    if (!Number.isInteger(cid)) return;
    if (cid === this.host.player.id) this.setMine(NONE);
    else this.removeMember(cid);
    this.refresh();
  }

  private onHost(cid: number): void {
    if (this.mine.d) this.mine.d.cid = cid;
    this.panel.render();
    void this.loadMine();
  }

  private onConfig(d: SetRoomConfigPush): void {
    const room = this.mine.d;
    if (room) {
      room.fid = d.fid;
      room.type = d.type;
      room.minLevel = d.minLevel;
      room.maxLevel = d.maxLevel;
      room.time = d.time;
      this.panel.render();
    }
    this.refresh();
  }

  private onSay([cid, name, text]: RoomSayPush): void {
    this.lines.push(`${cid === this.host.player.id ? 'Bạn' : String(name)}: ${String(text)}`);
    if (this.lines.length > MAX_CHAT_LINES) this.lines.shift();
    this.panel.render();
  }
}

function fail(e: unknown): void {
  toast((e as Error).message, true);
}
