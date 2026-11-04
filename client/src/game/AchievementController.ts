// Achievements on the client: the "Thành tựu" window (HUD button / R key), the catalog (getAchieveList, loaded on first open: the
// client has no static tables), live progress (onUpdateAchieve type 1 = achievement finished, type 2 = requirement progress),
// the claim (getAchieveAward is fire-and-forget; updateAchieveAwardLog marks it taken, onAchieveTitle names a title reward).
// The login snapshot lives on `player` (achieveLog / achieveReqLog / takeAchieveAwardLog / achPnt) and is mutated in place.

import type { AchieveCatalog, AchieveEntry, PlayerData, UpdateAchieveArgs, AchieveAwardLog } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { AchievementPanel } from '../ui/achievementPanel';

export class AchievementController {
  private readonly panel: AchievementPanel;
  private readonly offs: (() => void)[] = [];
  private entries: AchieveEntry[] = [];
  private loaded = false;
  private loading = false;

  constructor(private readonly client: GameClient, private readonly player: PlayerData) {
    player.achieveLog ??= {};
    player.achieveReqLog ??= {};
    player.takeAchieveAwardLog ??= {};
    player.achPnt ??= 0;
    this.panel = new AchievementPanel({
      entries: () => this.entries,
      points: () => this.player.achPnt ?? 0,
      doneLog: () => this.player.achieveLog ?? {},
      reqLog: () => this.player.achieveReqLog ?? {},
      claimedLog: () => this.player.takeAchieveAwardLog ?? {},
      loaded: () => this.loaded,
      onClaim: (aid) => void this.client.call('getAchieveAward', aid).catch(() => undefined),
      onClose: () => this.panel.close(),
    });
    this.offs.push(
      client.on('onUpdateAchieve', (type, id, obj) => this.onUpdate({ type: Number(type) as 1 | 2, id: Number(id), obj: (obj ?? {}) as UpdateAchieveArgs['obj'] })),
      client.on('updateAchieveAwardLog', (d) => this.onAwardLog(d as AchieveAwardLog)),
      client.on('onAchieveTitle', (name) => toast(`Nhận được danh hiệu ${String(name ?? '')}!`)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
  }

  /** HUD achievement button / R key. */
  toggle(): void {
    if (this.panel.isOpen) {
      this.panel.close();
      return;
    }
    this.panel.show();
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.loaded || this.loading) return;
    this.loading = true;
    try {
      this.entries = (await this.client.call<AchieveCatalog>('getAchieveList')).entries;
      this.loaded = true;
    } catch {
      // stays "loading"; the next open retries
    }
    this.loading = false;
    this.panel.render();
  }

  private onUpdate(u: UpdateAchieveArgs): void {
    const p = this.player;
    if (u.type === 2) {
      const prev = p.achieveReqLog![String(u.id)];
      p.achieveReqLog![String(u.id)] = { done: u.obj.done ?? prev?.done ?? 0, progress: u.obj.progress ?? prev?.progress ?? 0 };
    } else if (u.type === 1) {
      p.achieveLog![String(u.id)] = u.obj.done ?? Date.now();
      const e = this.entries.find((x) => x.id === u.id);
      if (e) p.achPnt = (p.achPnt ?? 0) + e.award;
      toast(`Đạt thành tựu: ${e?.name ?? u.id}${e ? ` (+${e.award} điểm)` : ''}`);
      if (!e && !this.loaded) void this.load().then(() => this.syncPoints());
    }
    this.panel.render();
  }

  /** Points of achievements finished while the catalog was not loaded yet (the toast could not name them). */
  private syncPoints(): void {
    const done = this.player.achieveLog ?? {};
    this.player.achPnt = this.entries.filter((e) => (done[String(e.id)] ?? 0) > 999_999).reduce((n, e) => n + e.award, 0);
    this.panel.render();
  }

  private onAwardLog(d: AchieveAwardLog): void {
    if (d.num > 0) this.player.takeAchieveAwardLog![String(d.aid)] = d.num;
    this.panel.render();
  }
}
