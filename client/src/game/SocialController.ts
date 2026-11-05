// Multiplayer social wiring (phases A, B, D): owns the ChatBox, the chat pushes (onSay / onWisper / onP2pWisper /
// onP2pWisperError), the click menu on other players (party entries go through `host.party`), the info panel (showChaInfo)
// and the private chat windows. Chat pushes from blacklisted characters are dropped here (friends() lookup, phase D).
// Kept out of GameScene, which only hands over entities and the stage UI parent.

import type { FederatedPointerEvent } from 'pixi.js';
import { ChatChannel, emotionOf, type ChaInfo, type MapInfo, type PlayerData, type SayPush, type WisperPush } from '@mc/shared';
import type { GameClient } from '../net/client';
import { ChaInfoPanel } from '../ui/chaInfoPanel';
import { ChatBox } from '../ui/chat';
import { PlayerMenu, type MenuTarget } from '../ui/playerMenu';
import { PrivateChat } from '../ui/privateChat';
import { toast } from '../ui/screens';
import { showEmotion } from './EmotionBubble';
import type { Entity } from './Entity';
import { PkController } from './PkController';

/** What the player menu needs from the party controller (built after this controller, hence the lazy accessor). */
export interface PartyActions {
  invite(id: number): void;
  requestJoin(id: number): void;
  canRequestJoin(id: number): boolean;
}

/** What this controller needs from the friend controller (built after it, hence the lazy accessor). */
export interface FriendActions {
  isBlack(id: number): boolean;
  add(name: string): void;
}

/** What the player menu needs from the trade controller (built after this controller, hence the lazy accessor). */
export interface TradeActions {
  request(id: number, name: string): void;
}

export interface SocialHost {
  client: GameClient;
  player: PlayerData;
  /** Stage element the chat box mounts into. */
  ui: HTMLElement;
  /** Self or a peer on the current map (for speech bubbles). */
  entityOf(id: number): Entity | undefined;
  /** True while map interaction is blocked (battle). */
  locked(): boolean;
  /** The current map (PK safe areas). */
  mapInfo(): MapInfo | null;
  party(): PartyActions;
  friends(): FriendActions;
  trade(): TradeActions;
  /** Slash commands other than /w (dev teleport etc.). */
  onCommand(cmd: string, args: string[]): void;
  /** Player menu "Xem chiến đấu" (startWatch). */
  watch(targetCid: number): void;
}

export class SocialController {
  readonly chat: ChatBox;
  /** PK click mode (system-bar PK button): while armed a click on a player attacks instead of opening the menu. */
  readonly pk: PkController;
  private readonly menu: PlayerMenu;
  private readonly info = new ChaInfoPanel();
  private readonly pchat: PrivateChat;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: SocialHost) {
    const { client } = host;
    const fail = (e: unknown): void => toast((e as Error).message, true);
    this.pk = new PkController({ client, mapInfo: () => host.mapInfo(), locked: () => host.locked() });
    this.chat = new ChatBox(host.ui, {
      onSend: (channelId, msg) => void client.call('say', channelId, msg).catch(fail),
      onWhisper: (name, text) => void client.call('wisper', name, text).catch(fail),
      onCommand: host.onCommand,
    });
    this.pchat = new PrivateChat({
      send: (targetId, text) => void client.call('p2pWisper', text, targetId).catch(fail),
      selfName: () => host.player.name,
    });
    this.menu = new PlayerMenu({
      info: (t) => this.showInfo(t),
      whisper: (t) => this.chat.prefill(`/w ${t.name} `),
      privateChat: (t) => this.pchat.open(t.id, t.name),
      invite: (t) => host.party().invite(t.id),
      canRequestJoin: (t) => host.party().canRequestJoin(t.id),
      requestJoin: (t) => host.party().requestJoin(t.id),
      addFriend: (t) => host.friends().add(t.name),
      trade: (t) => host.trade().request(t.id, t.name),
      watch: (t) => host.watch(t.id),
    });
    this.offs.push(
      client.on('onSay', (data) => this.onSay(data as SayPush)),
      client.on('onWisper', (data) => {
        const w = data as WisperPush;
        if (w.self || !this.host.friends().isBlack(w.id)) this.chat.pushWisper(w);
      }),
      client.on('onP2pWisper', (text, senderId, senderName) => {
        if (!this.host.friends().isBlack(Number(senderId))) this.pchat.receive(Number(senderId), String(senderName), String(text));
      }),
      client.on('onP2pWisperError', (targetId) => this.pchat.offline(Number(targetId))),
    );
  }

  /** Makes a peer entity clickable: opens the player menu (Ctrl+click prefills a whisper, as in legacy). */
  bindPlayer(entity: Entity, name: string): void {
    entity.on('pointertap', (ev: FederatedPointerEvent) => {
      ev.stopPropagation();
      if (this.host.locked() || this.chat.focused) return;
      if (this.pk.active) return this.pk.click(entity);
      const shown = entity.displayName || name; // renamed players keep their entity
      const target: MenuTarget = { id: entity.entityId, name: shown };
      if (ev.ctrlKey) this.chat.prefill(`/w ${shown} `);
      else this.menu.show(target, ev.clientX, ev.clientY);
    });
  }

  /** Friend panel shortcuts: prefill a whisper / open the private chat window. */
  whisperTo(name: string): void {
    this.chat.prefill(`/w ${name} `);
  }

  openPrivate(id: number, name: string): void {
    this.pchat.open(id, name);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.pk.cancel();
    this.menu.close();
    this.info.close();
    this.pchat.closeAll();
  }

  /** Logs every message; current-map chat also pops a bubble over the speaker (self included). */
  private onSay(msg: SayPush): void {
    if (msg.id !== this.host.player.id && this.host.friends().isBlack(msg.id)) return;
    this.chat.push(msg);
    if (msg.channelId !== ChatChannel.LOCAL) return;
    const who = this.host.entityOf(msg.id);
    const emotion = emotionOf(msg.msg);
    if (who && emotion) void showEmotion(who, emotion); // M9: the emotion plays instead of the text bubble
    else who?.say(msg.msg);
  }

  private showInfo(t: MenuTarget): void {
    this.host.client.call<ChaInfo>('showChaInfo', t.id).then(
      (info) => this.info.show(info, this.host.player.level),
      (e) => toast((e as Error).message, true),
    );
  }
}
