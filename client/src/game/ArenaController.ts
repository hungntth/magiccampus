// Đấu pet flow (legacy PetArenaPanel / PetFightConf): owns the window, the RPCs -- getPetArenaData, getPetArenaRank, getLastPetArenaRank,
// getPetRankAward, getPetArenaSysMsg, getPetArenaConf, petArenaTicket, petArenaFight, addPetFightNum, clearArenaCD, replayPetFight -- and the
// pushes onGetEnemies, onGetArenaLog, addArenaLog, onPetArenaFight, onPetArenaRank, onPetArenaSysMsg, addArenaNum. The replay itself is
// played by the battle WatchMode (onBattleReplay). Server refusals of a challenge are addArenaLog lines, other notes go through toasts.

import type {
  PetArenaFightPush, PetArenaNumPush, PetArenaPrevRank, PetArenaRankReply, PetArenaRow, PetArenaSysMsg, PetSkillInfo, PetView, PlayerData,
  PPVESlot,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { pushCapped } from '../ui/petbattle/arenaRules';
import { ArenaWindow } from '../ui/petbattle/arenaWindow';
import type { ArenaActions, ArenaModel } from '../ui/petbattle/petBattleTypes';

export interface ArenaControllerHost {
  client: GameClient;
  player: PlayerData;
  pets(): PetView[];
  skillInfo(id: number): PetSkillInfo | undefined;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class ArenaController {
  private readonly win: ArenaWindow;
  private readonly offs: (() => void)[] = [];
  private readonly state: ArenaModel = { loaded: false, rows: [], log: [], notes: [], sys: null, rank: null, prev: null, autoWatch: true };

  constructor(private readonly host: ArenaControllerHost) {
    this.win = new ArenaWindow({
      model: () => this.state, actions: this.actions(), playerId: () => host.player.id, playerLevel: () => host.player.level,
      points: () => host.player.currencies?.paPnt ?? 0,
    }, () => this.win.close());
    const c = host.client;
    this.offs.push(
      c.on('onGetEnemies', (rows) => this.setRows(rows)),
      c.on('onGetArenaLog', (lines) => this.setLog(lines)),
      c.on('addArenaLog', (text) => this.addNote(text)),
      c.on('onPetArenaFight', (d) => this.onFight(d as PetArenaFightPush)),
      c.on('onPetArenaRank', (d) => this.set(() => (this.state.rank = d as PetArenaRankReply))),
      c.on('onPetArenaSysMsg', (msg) => this.set(() => (this.state.sys = msg as PetArenaSysMsg))),
      c.on('addArenaNum', (d) => this.onTurns(d as PetArenaNumPush)),
    );
  }

  /** Entry point (HUD "Đấu Pet", Flash MiniMapCanvas getPetArenaData): toggles the window and loads the panel data. */
  toggle(): void {
    if (this.win.isOpen) {
      this.win.close();
      return;
    }
    this.win.show();
    this.actions().refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
  }

  private actions(): ArenaActions {
    const c = this.host.client;
    const send = (method: string, ...args: unknown[]): void => void c.call(method, ...args).catch(fail);
    return {
      pets: () => this.host.pets(),
      skillInfo: (id) => this.host.skillInfo(id),
      refresh: () => {
        send('getPetArenaData');
        send('getPetArenaSysMsg', -1);
      },
      register: (name, conf) => this.register(name, conf),
      loadConf: async () => (await c.call<{ conf1?: Record<string, PPVESlot> }>('getPetArenaConf')).conf1 ?? {},
      fight: (row) => send('petArenaFight', row.cid, row.rank),
      buyTurn: () => send('addPetFightNum'),
      clearCd: () => void c.call<boolean>('clearArenaCD').then((done) => done && this.clearCooldown()).catch(fail),
      loadRank: () => send('getPetArenaRank'),
      loadPrev: () => void c.call<PetArenaPrevRank>('getLastPetArenaRank').then((r) => this.set(() => (this.state.prev = r))).catch(fail),
      claimAward: () => send('getPetRankAward'),
      replay: (bid) => send('replayPetFight', bid),
      setAutoWatch: (on) => {
        this.state.autoWatch = on;
      },
    };
  }

  /** petArenaTicket: a refreshed list means the registration was accepted; null = refused with a note (the dialog stays open). */
  private async register(name: string, conf: Record<string, PPVESlot>): Promise<boolean> {
    try {
      const rows = await this.host.client.call<PetArenaRow[] | null>('petArenaTicket', name, conf);
      if (rows) this.setRows(rows);
      return rows !== null;
    } catch (e) {
      fail(e);
      return false;
    }
  }

  private set(change: () => void): void {
    change();
    this.win.render();
  }

  private setRows(rows: unknown): void {
    if (!Array.isArray(rows)) return;
    this.set(() => {
      this.state.rows = rows as PetArenaRow[];
      this.state.loaded = true;
    });
  }

  private setLog(lines: unknown): void {
    if (Array.isArray(lines)) this.set(() => (this.state.log = lines as PetArenaFightPush[]));
  }

  private addNote(text: unknown): void {
    if (typeof text === 'string' && text) this.set(() => (this.state.notes = pushCapped(this.state.notes, text)));
  }

  /** Attacker line (guest false, replay when auto-watch is on) or defender line (guest true); `enemy` is the refreshed list. */
  private onFight(d: PetArenaFightPush): void {
    this.state.log = pushCapped(this.state.log, d);
    if (d.enemy) this.state.rows = d.enemy;
    this.win.render();
    if (!d.guest && this.state.autoWatch && d.bid) void this.host.client.call('replayPetFight', d.bid).catch(fail);
  }

  private onTurns(d: PetArenaNumPush): void {
    const me = this.state.rows[0];
    if (d.f && me && me.cid === this.host.player.id) me.max = d.max;
    this.win.render();
  }

  private clearCooldown(): void {
    const me = this.state.rows[0];
    if (me) me.cd = 0;
    this.win.render();
  }
}
