// Party client wiring (phase B): roster state from the group pushes, invite / join-request dialogs, HUD team tiles + their action
// menu, leader flag over entities (onGroupFlag + scene payload flags), the 45 px follow trail animated on every client from the
// leader's moves, and the walk lock for followers. Owns no map state; GameScene hands over entities through `entityOf`.

import {
  GroupCantJoinCode, PartyLimits,
  type GroupAfkPush, type GroupDenyPush, type GroupFlagPush, type GroupGiveLeaderPush, type GroupInvited, type GroupJoined,
  type GroupLeavePush, type GroupMember, type GroupMemberPos, type GroupRequested, type PlayerData, type SceneCharacter,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { TeamBar } from '../ui/hud/teamBar';
import { askConfirm } from '../ui/confirmDialog';
import { mapNameOf } from '../ui/groupRecruit/mapNames';
import { PopupMenu, type MenuItem } from '../ui/playerMenu';
import { toast } from '../ui/screens';
import type { Entity } from './Entity';
import { Behavior, dirFromDelta } from './SheetAnim';

const FOLLOW_SPEED = 240; // a little above MOVE_SPEED so a trailing member catches up
const BLOCKED_NOTE_MS = 3000;
const POS_THROTTLE_MS = 1100;
const FOLLOW_NOTE = 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!';
const CANT_JOIN: Record<number, string> = {
  [GroupCantJoinCode.SPECIAL_STATE]: 'đang ở trạng thái đặc biệt',
  [GroupCantJoinCode.FULL]: 'nhóm đã đầy',
  [GroupCantJoinCode.IN_GROUP]: 'đã ở trong nhóm',
};

export interface PartyHost {
  client: GameClient;
  player: PlayerData;
  ui: HTMLElement;
  chat: ChatBox;
  /** Self or a peer on the current map. */
  entityOf(id: number): Entity | undefined;
  /** True while the map is frozen (battle). */
  locked(): boolean;
  /** Opens the "Chiêu mộ nhóm" window (team tile menu). */
  openRecruit?(): void;
}

export class PartyController {
  private members: GroupMember[] = [];
  private readonly flags = new Map<number, GroupFlagPush>();
  private readonly bar: TeamBar;
  private readonly menu = new PopupMenu();
  private readonly offs: (() => void)[] = [];
  private readonly selfId: number;
  private cancelInvite: (() => void) | null = null;
  private cancelRequest: (() => void) | null = null;
  private readonly requests: GroupRequested[] = [];
  private lastBlockedAt = -Infinity;
  private lastPosAt = -Infinity;

  constructor(private readonly host: PartyHost) {
    this.selfId = host.player.id;
    this.bar = new TeamBar(host.ui, (m, x, y) => this.onTile(m, x, y));
    const { client } = host;
    this.offs.push(
      client.on('onGroupInvited', (d) => this.onInvited(d as GroupInvited)),
      client.on('onGroupRequest', (d) => this.onRequested(d as GroupRequested)),
      client.on('onGroupDeny', (d) => this.note(`${(d as GroupDenyPush).name} từ chối lời mời gia nhập nhóm của bạn.`)),
      client.on('onGroupRequestDeny', (d) => this.note(`${(d as GroupDenyPush).name} từ chối yêu cầu gia nhập nhóm của bạn.`)),
      client.on('onGroupCantJoin', (cid, code) => this.onCantJoin(Number(cid), Number(code))),
      client.on('onGroupJoined', (d) => this.onJoined(d as GroupJoined)),
      client.on('onGroupLeave', (d) => this.onLeave(d as GroupLeavePush)),
      client.on('onGroupDismiss', () => this.onDismiss()),
      client.on('onGroupGiveLeader', (d) => this.onGiveLeader(d as GroupGiveLeaderPush)),
      client.on('onGroupAfk', (d) => this.setMembers((d as GroupAfkPush).members)),
      client.on('unGroupAfk', (d) => this.setMembers((d as GroupAfkPush).members)),
      client.on('onGroupFlag', (d) => this.onFlag(d as GroupFlagPush)),
    );
  }

  private get me(): GroupMember | undefined {
    return this.members.find((m) => m.cid === this.selfId);
  }

  /** A party member that is neither the leader nor AFK cannot walk: it follows the leader. */
  get followerLocked(): boolean {
    const me = this.me;
    return me !== undefined && !me.isLeader && !me.afk;
  }

  /**
   * Map-click gate for GameScene: true (with a toast and the Flash auto "Nhóm trưởng, đi nhanh nào." in team chat, throttled)
   * when the local player is a locked follower.
   */
  blocked(): boolean {
    if (!this.followerLocked) return false;
    const now = performance.now();
    if (now - this.lastBlockedAt > BLOCKED_NOTE_MS) {
      this.lastBlockedAt = now;
      toast(FOLLOW_NOTE);
      this.host.client.call('say', 3, 'Nhóm trưởng, đi nhanh nào.').catch(() => undefined);
    }
    return true;
  }

  invite(id: number): void {
    this.call('groupInvite', id);
  }

  requestJoin(id: number): void {
    this.call('groupRequest', this.selfId, id);
  }

  /** Player menu: "Xin vào nhóm" only when the target has a party and you do not. */
  canRequestJoin(id: number): boolean {
    return this.me === undefined && this.flags.get(id)?.inGroup === true;
  }

  /** Scene payload flags of a character (self or peer) that has just been created; also shows its leader flag. */
  track(data: SceneCharacter): void {
    this.flags.set(data.id, { cid: data.id, inGroup: data.inGroup, isLeader: data.isLeader, groupAfk: data.groupAfk });
    this.applyFlag(data.id);
  }

  /** Followers trail the previous non-AFK member (leader first) at FOLLOW_GAP px, as in legacy startFollow. */
  tick(dt: number): void {
    if (this.members.length < 2) return;
    let prev = this.host.entityOf(this.members[0].cid);
    if (!prev) return;
    for (const m of this.members.slice(1)) {
      const e = this.host.entityOf(m.cid);
      if (m.afk || !e) continue;
      if (!e.moving && !(m.cid === this.selfId && this.host.locked())) this.trail(e, prev, dt);
      prev = e;
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.cancelInvite?.();
    this.cancelRequest?.();
    this.menu.close();
    this.bar.destroy();
  }

  private trail(e: Entity, target: Entity, dt: number): void {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= PartyLimits.FOLLOW_GAP + 1) {
      e.setBehavior(Behavior.STAND);
      return;
    }
    const step = Math.min(FOLLOW_SPEED * dt, dist - PartyLimits.FOLLOW_GAP);
    e.face(dirFromDelta(dx, dy, e.dir));
    e.setBehavior(Behavior.RUN);
    e.position.set(e.x + (dx / dist) * step, e.y + (dy / dist) * step);
    e.zIndex = e.y;
  }

  private setMembers(list: GroupMember[]): void {
    const before = new Set([...this.members.map((m) => m.cid), ...list.map((m) => m.cid)]);
    this.members = list;
    this.bar.render(list, this.selfId);
    for (const id of before) {
      this.applyFlag(id);
      if (!list.some((m) => m.cid === id)) this.host.entityOf(id)?.setBehavior(Behavior.STAND);
    }
  }

  private applyFlag(cid: number): void {
    const member = this.members.find((m) => m.cid === cid);
    const leader = member ? member.isLeader : this.flags.get(cid)?.isLeader === true;
    this.host.entityOf(cid)?.setLeaderFlag(leader);
  }

  private onFlag(f: GroupFlagPush): void {
    this.flags.set(f.cid, f);
    this.applyFlag(f.cid);
  }

  private onJoined(d: GroupJoined): void {
    if (this.members.length === 0) this.host.chat.system('Bạn đã vào nhóm.');
    this.setMembers(d.members);
  }

  private onLeave(d: GroupLeavePush): void {
    if (d.sid === this.selfId) {
      this.note('Bạn đã rời nhóm.');
      this.setMembers([]);
      return;
    }
    this.host.chat.system(`${d.name} đã rời nhóm.`);
    this.setMembers(d.members);
  }

  private onDismiss(): void {
    this.note('Nhóm đã giải tán.');
    this.setMembers([]);
  }

  private onGiveLeader(d: GroupGiveLeaderPush): void {
    this.host.chat.system(`${d.oName} nhường chức nhóm trưởng cho ${d.nName}`);
    this.setMembers(d.members);
  }

  private onCantJoin(cid: number, code: number): void {
    const who = cid === this.selfId ? 'Bạn' : 'Người chơi này';
    toast(`${who} ${CANT_JOIN[code] ?? 'không thể vào nhóm'}`, true);
  }

  private onInvited(d: GroupInvited): void {
    this.cancelInvite?.();
    const far = d.dis === 'far' ? ' (đang ở bản đồ khác, bạn sẽ ở trạng thái tạm rời)' : '';
    this.host.chat.system(`${d.name} gửi cho bạn lời mời gia nhập nhóm.`);
    this.cancelInvite = this.ask(
      `${d.name} (Cấp ${d.level}) gửi cho bạn lời mời gia nhập nhóm.${far}`,
      () => this.call('groupJoin', d.cid),
      () => this.call('groupReqDeny', d.cid),
      () => (this.cancelInvite = null),
    );
  }

  private onRequested(d: GroupRequested): void {
    if (!this.requests.some((r) => r.cid === d.cid)) this.requests.push(d);
    this.host.chat.system(`${d.name} yêu cầu gia nhập nhóm.`);
    this.showRequest();
  }

  /** Join requests are asked one at a time, oldest first. */
  private showRequest(): void {
    const r = this.requests[0];
    if (this.cancelRequest || !r) return;
    const next = (): void => {
      this.cancelRequest = null;
      this.requests.shift();
      this.showRequest();
    };
    this.cancelRequest = this.ask(
      `${r.name} (Cấp ${r.level}) yêu cầu gia nhập nhóm. Đồng ý?`,
      () => {
        this.host.client.call<boolean>('groupAdd', r.cid).then((ok) => ok || toast('Thêm thành viên thất bại.', true), fail);
        next();
      },
      () => {
        this.call('groupReqDeny', r.cid);
        next();
      },
      next,
    );
  }

  /** Yes / No dialog that closes itself (calling `expired`) after the invite TTL; returns a canceller. */
  private ask(text: string, yes: () => void, no: () => void, expired: () => void): () => void {
    let close: () => void = () => undefined;
    const timer = setTimeout(() => {
      close();
      expired();
    }, PartyLimits.INVITE_TTL_MS);
    close = askConfirm(text, () => {
      clearTimeout(timer);
      yes();
    }, () => {
      clearTimeout(timer);
      no();
    });
    return () => {
      clearTimeout(timer);
      close();
    };
  }

  /** HUD tile click (legacy GroupInfoCanvas.onClickHandler). */
  private onTile(m: GroupMember, x: number, y: number): void {
    const me = this.me;
    if (!me) return;
    const items: MenuItem[] = [];
    if (m.cid === this.selfId) {
      if (!me.isLeader) items.push([me.afk ? 'Về nhóm' : 'Tạm rời', () => this.call(me.afk ? 'unGroupAFK' : 'groupAFK', true)]);
      items.push(['Rời nhóm', () => this.call('groupLeave')]);
    } else if (me.isLeader) {
      if (!m.afk) items.push(['Thăng làm nhóm trưởng', () => this.call('groupGiveLeader', m.cid)]);
      items.push(['Trục xuất', () => this.call('groupKick', m.cid)]);
    }
    if (m.cid !== this.selfId) items.push(['Vị trí', () => this.showPosition(m)]);
    else if (this.host.openRecruit) items.push(['Chiêu mộ nhóm', () => this.host.openRecruit?.()]);
    if (items.length > 0) this.menu.show(m.name, items, x, y);
  }

  /** getGroupMemberPosistion (sic): the server limits it to once per second, so the client throttles too. */
  private showPosition(m: GroupMember): void {
    const now = performance.now();
    if (now - this.lastPosAt < POS_THROTTLE_MS) return;
    this.lastPosAt = now;
    this.host.client.call<GroupMemberPos>('getGroupMemberPosistion', m.cid).then(async (r) => {
      if (!r.success) return toast('Không lấy được vị trí.', true);
      const name = await mapNameOf(this.host.client, r.map);
      toast(`${m.name}: ${name} (${Math.floor(r.x / 10)}, ${Math.floor(r.y / 10)})`);
    }, fail);
  }

  private call(method: string, ...args: unknown[]): void {
    this.host.client.call(method, ...args).catch(fail);
  }

  private note(text: string): void {
    toast(text);
    this.host.chat.system(text);
  }
}

function fail(e: unknown): void {
  toast((e as Error).message, true);
}
