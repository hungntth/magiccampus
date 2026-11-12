// M14 phase H client: Chiến Trường Dũng Sĩ (3v3). Strip icon 22 -> checkPVPLine + initPVPRoom, room list / room panel (ui/threepvp),
// pushes onEnterPVPRoom / onCreatePVPRoom / onAddRoomMember / onUpdatePVPRoom / onPushPVPQueue / onPVPKickByLeader / inviteByLeader /
// onRefreshPVPPoint / onUpdateMyPoint / showPVPGroupResultAlert. Battles are ordinary onBattleStart pushes (BattleController).

import {
  THREE_PVP, type InviteByLeaderPush, type LastPvpRankRow, type PlayerData, type PvpGroupResultAlert, type PvpQueuePush, type PvpRoom,
  type PvpRoomMap, type RefreshPvpPointPush, type SceneEnterPush, type UpdateMyPointPush, type UpdatePvpRoomPush,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { ThreePvpPanel } from '../ui/threepvp/threepvpPanel';
import { showPvpResult } from '../ui/threepvp/threepvpResult';
import { setSeatReady, sortedRooms } from '../ui/threepvp/threepvpView';

const fail = (e: unknown): void => toast((e as Error).message, true);

export class ThreePvpController {
  private readonly offs: (() => void)[] = [];
  private readonly panel: ThreePvpPanel;
  private rooms: Record<number, PvpRoom> = {};
  private mine: PvpRoom | null = null;
  private queued = false;
  private point: UpdateMyPointPush = { rank: 0, point: 0 };
  private rank: LastPvpRankRow[] | null = null;
  private closers: (() => void)[] = [];

  constructor(private readonly client: GameClient, player: PlayerData) {
    this.panel = new ThreePvpPanel({
      myId: player.id,
      rooms: () => sortedRooms(this.rooms),
      mine: () => this.mine,
      queued: () => this.queued,
      point: () => this.point,
      rank: () => this.rank,
      refresh: () => void this.loadRooms().catch(fail),
      create: () => void this.client.call<PvpRoom | null>('createPVPRoom').then((r) => this.setMine(r)).catch(fail),
      join: (id, pass) => void this.client.call<PvpRoom | null>('addPVPGroup', id, 0, pass).then((r) => this.setMine(r)).catch(fail),
      loadRank: () => void this.loadRank(),
      ready: () => void this.client.call('readyOrStartPVP').catch(fail),
      kick: (cid) => void this.client.call('PVPKickByLeader', cid).catch(fail),
      setLimit: (min, max) => void this.client.call('updatePVPGroupLimit', min, max).catch(fail),
      setPass: (pass) => void this.client.call('updatePVPGroupPass', pass).catch(fail),
      invite: () => void this.client.call('quickInvite').then(() => toast('Đã gửi lời mời')).catch(fail),
      leaveGroup: () => void this.leaveGroup(),
      leaveField: () => this.leaveField(),
      onClose: () => this.panel.close(),
    });
    this.offs.push(
      client.on('onEnterPVPRoom', (d) => this.setMine(d as PvpRoom)),
      client.on('onCreatePVPRoom', (d) => this.upsert(d as PvpRoom)),
      client.on('onAddRoomMember', (d) => this.upsert(d as PvpRoom)),
      client.on('onUpdatePVPRoom', (d) => this.onUpdateRoom(d as UpdatePvpRoomPush)),
      client.on('onPushPVPQueue', (d) => this.onQueue(d as PvpQueuePush)),
      client.on('onPVPKickByLeader', (d) => this.onKicked(d as PvpRoomMap)),
      client.on('inviteByLeader', (d) => this.onInvite(d as InviteByLeaderPush)),
      client.on('onRefreshPVPPoint', (d) => this.onResult(d as RefreshPvpPointPush)),
      client.on('onUpdateMyPoint', (d) => {
        this.point = d as UpdateMyPointPush;
        this.refreshPanel();
      }),
      client.on('showPVPGroupResultAlert', (d) => this.onSettle(d as PvpGroupResultAlert)),
      client.on('onBattleStart', () => this.panel.close()),
      client.on('onSceneEnter', (d) => {
        if ((d as SceneEnterPush).mapId !== THREE_PVP.MAP_ID) this.reset();
      }),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    for (const close of this.closers) close();
    this.closers = [];
    this.panel.close();
  }

  /** Strip icon 22: line check, then the server teleports to map 73 and answers with every room. */
  openFromStrip(): void {
    void this.client.call<boolean>('checkPVPLine').then((ok) => (ok ? this.loadRooms() : undefined)).catch(fail);
  }

  private async loadRooms(): Promise<void> {
    const map = await this.client.call<PvpRoomMap | null>('initPVPRoom');
    if (!map) return;
    this.setRooms(map);
    this.panel.show();
  }

  private async loadRank(): Promise<void> {
    this.rank = null;
    this.refreshPanel();
    this.rank = await this.client.call<LastPvpRankRow[]>('getLastPVPRank').catch(() => []);
    this.refreshPanel();
  }

  private setRooms(map: PvpRoomMap): void {
    this.rooms = {};
    for (const r of Object.values(map)) this.rooms[r.id] = r;
  }

  private setMine(room: PvpRoom | null): void {
    if (!room || typeof room.id !== 'number') return;
    this.mine = room;
    this.panel.show();
  }

  /** Roster push: my own room replaces my view, any other room is a list card (only while I am in no room). */
  private upsert(room: PvpRoom): void {
    if (this.mine) {
      if (this.mine.id === room.id) this.mine = room;
    } else this.rooms[room.id] = room;
    this.refreshPanel();
  }

  private onUpdateRoom(p: UpdatePvpRoomPush): void {
    for (const r of [this.rooms[p.roomId], this.mine?.id === p.roomId ? this.mine : undefined]) {
      if (!r) continue;
      if (p.type === 'level') r.limit = { lev: p.lev };
      else r.pass = p.pass;
    }
    this.refreshPanel();
  }

  private onQueue(p: PvpQueuePush): void {
    if (p.type === 2) this.queued = p.state === 2;
    else if (!this.mine || !setSeatReady(this.mine, p.index, p.cid, p.state)) return; // cid 0 = placeholder of an empty seat
    this.refreshPanel();
  }

  private onKicked(map: PvpRoomMap): void {
    this.mine = null;
    this.queued = false;
    this.setRooms(map ?? {});
    toast('Bạn đã bị trưởng phòng mời ra khỏi phòng', true);
    this.panel.show();
  }

  private async leaveGroup(): Promise<void> {
    const map = await this.client.call<PvpRoomMap | null>('leftPVPGroup').catch((e) => { fail(e); return null; });
    if (!map) return; // queued / fighting: the server pushed a note
    this.mine = null;
    this.queued = false;
    this.setRooms(map);
    if (Object.keys(map).length === 0) await this.loadRooms().catch(fail);
    else this.panel.show();
  }

  private leaveField(): void {
    void this.client.call('leavePVPRoom').catch(fail);
    this.reset();
  }

  private onInvite(p: InviteByLeaderPush): void {
    if (this.mine) return;
    this.closers.push(askConfirm(`${p.name} mời bạn vào phòng ${p.index}`,
      () => void this.client.call('sureInvite', p.cid, p.index, 1).catch(fail),
      () => void this.client.call('sureInvite', p.cid, p.index, -1).catch(fail)));
  }

  private onResult(p: RefreshPvpPointPush): void {
    toast(`${p.isWinner ? 'Chiến thắng' : 'Thất bại'}: +${p.score} điểm`, !p.isWinner);
    if (this.mine) this.panel.show();
  }

  private onSettle(p: PvpGroupResultAlert): void {
    this.panel.close();
    this.closers.push(showPvpResult('Chiến Trường Dũng Sĩ kết thúc', '', [`Hạng ${p.rank}, nhận ${p.pvpPoint} Huy Chương Dũng Sĩ`], () => this.leaveField()));
  }

  private refreshPanel(): void {
    if (this.panel.isOpen) this.panel.render();
  }

  /** Back off map 73 (or left the field): drop the room state and the window. */
  private reset(): void {
    this.mine = null;
    this.queued = false;
    this.rooms = {};
    this.panel.close();
  }
}
