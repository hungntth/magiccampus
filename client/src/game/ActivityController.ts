// M8 phase A on the client: the activity strip (startedActList from the login payload, clicks open the H5 panel of the system),
// the diary window (getDiaryList / getCharDiaryData / getDailyActAward, push updateDiaryData), the sign-in window (5-day
// getSignInData / signinNow and the monthly calendar calls + their pushes) and the online-gift timer (Flash Core.initTimer).

import {
  ACTIVITY_PORTED_IDS, ActivityId, type DailyActAwardReply, type DailySignInData, type DailySignInDoReply, type DailySignInInit, type DiaryData,
  type DiaryEntry, type PlayerData, type SignInData, type TodayOnlineTime, ONLINE_GIFT_MINUTES,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { DailyActPanel } from '../ui/dailyActPanel';
import { ActivityStrip } from '../ui/hud/activityStrip';
import { DailySystemsController } from './DailySystemsController';
import { StoreSystemsController } from './StoreSystemsController';
import { TowerController } from './TowerController';
import { TrialsController } from './TrialsController';
import { TrainingController } from './TrainingController';
import type { Entity } from './Entity';
import { VipController } from './VipController';
import { SignInPanel } from '../ui/signInPanel';
import { toast } from '../ui/screens';

export interface ActivityHost {
  client: GameClient;
  player: PlayerData;
  refreshHud(): void;
  /** map entity of a character (mount sprite swap) */
  entityOf(id: number): Entity | undefined;
  bagCount(templateId: number): number;
  /** M10 "Phó bản" hub (button in the daily window) */
  openDungeons(): void;
  /** M10 phase E: strip icon 2 (Tinh Giới Thập Nhị Cung window) */
  openStar(): void;
  /** M10 phase G: strip icon 27 (Mê Trận lobby window) */
  openMaze(): void;
  /** M10 phase G: strip icon 16 (Đố Vui Có Thưởng) */
  openQuiz(): void;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class ActivityController {
  private readonly strip: ActivityStrip;
  private readonly daily: DailyActPanel;
  private readonly signIn: SignInPanel;
  private readonly vip: VipController;
  private readonly daily2: DailySystemsController;
  private readonly training: TrainingController;
  private readonly towers: TowerController;
  private readonly trials: TrialsController;
  private readonly stores: StoreSystemsController;
  private readonly offs: (() => void)[] = [];
  private catalog: DiaryEntry[] = [];
  private diary: DiaryData | null = null;
  private online: { minutes: number; gifts: number } | null = null;
  private legacy: SignInData | null = null;
  private calendar: DailySignInInit | null = null;
  private consume = 0;
  private giftTimer: ReturnType<typeof setTimeout> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private giftRetries = 0;

  constructor(private readonly host: ActivityHost) {
    const { client, player } = host;
    this.strip = new ActivityStrip({
      level: () => player.level,
      expRe: () => 0,
      has: (id) => ACTIVITY_PORTED_IDS.includes(id),
      open: (id) => this.openActivity(id),
    });
    this.vip = new VipController({ client, player, refreshHud: host.refreshHud });
    this.daily2 = new DailySystemsController({ client, player });
    this.training = new TrainingController({ client, player });
    this.towers = new TowerController({ client, player });
    this.trials = new TrialsController(client);
    this.stores = new StoreSystemsController({ client, player, entityOf: host.entityOf, bagCount: host.bagCount });
    this.strip.setList(player.startedActList ?? {});
    this.daily = new DailyActPanel({
      catalog: () => this.catalog, data: () => this.diary, online: () => this.online,
      onChest: (tier) => this.claimChest(tier), onClose: () => this.closeDaily(), onDungeons: () => host.openDungeons(),
    });
    this.signIn = new SignInPanel({
      legacy: () => this.legacy, calendar: () => this.calendar, consumeTotal: () => this.consume,
      onSigninNow: () => this.signinNow(), onSign: () => this.doSignin(), onRetro: () => this.retroactive(),
      onCrit: () => this.upCrit(), onLucky: () => this.claimLucky(), onClose: () => this.signIn.close(),
    });
    this.offs.push(
      client.on('updateDiaryData', (id, val, act) => this.onDiary(String(id), Number(val), Number(act))),
      client.on('onPlayerLevelUp', () => this.strip.refresh()),
      client.on('updateActivityList', (list) => this.strip.setList((list ?? {}) as NonNullable<PlayerData['startedActList']>)),
      client.on('updateActivityState', (d) => {
        const s = d as { id: number; sortType: number; flag: number };
        this.strip.setState(s.id, s.sortType, s.flag);
      }),
      client.on('setBtnsDailySignInAct', (d) => this.setCalendarData(d as DailySignInData)),
      client.on('onDailySignInActDoSignin', (d) => this.setCalendarData((d as DailySignInDoReply).data)),
      client.on('updateDailySignInActCrit', (n) => {
        if (this.calendar) this.calendar.data.crit = Number(n);
        this.signIn.render();
      }),
      client.on('oninitDailySignInActConsumeLimit', (n) => {
        this.consume = Math.max(0, Number(n));
        this.signIn.render();
      }),
    );
    void this.initGiftTimer();
  }

  destroy(): void {
    for (const off of this.offs) off();
    if (this.giftTimer) clearTimeout(this.giftTimer);
    this.stopClock();
    this.strip.destroy();
    this.daily.close();
    this.signIn.close();
    this.vip.destroy();
    this.daily2.destroy();
    this.training.destroy();
    this.towers.destroy();
    this.trials.destroy();
    this.stores.destroy();
  }

  /** Strip icon dispatch (phase D ids: 21 wish tree, 24 magic array, 25 festival, 49 daily boss). */
  private openActivity(id: number): void {
    if (id === ActivityId.DAILY_SIGNIN) this.openSignIn(1);
    else if (id === ActivityId.STAR) this.host.openStar();
    else if (id === ActivityId.MAZE) this.host.openMaze();
    else if (id === ActivityId.QUIZ) this.host.openQuiz();
    else if (id === ActivityId.WORLD_BOSS) void this.host.client.call('canEnterWbMap', this.host.player.id).catch(fail); // M10 I: the server teleports + initWbView
    else if (id === ActivityId.TXKC) this.training.openTxkc();
    else if (id === ActivityId.HMTXL) this.training.openHmtxl();
    else if (id === ActivityId.NINE_BOSS) this.towers.openNine();
    else if (id === ActivityId.FLOP_PASS) this.towers.openFlop();
    else if (id === ActivityId.TRIALS) this.trials.toggle();
    else if (id === ActivityId.VIP_SHOP) this.openVip('shop');
    else if (id === ActivityId.BOSS_DAILY) this.daily2.openBoss();
    else if (id === ActivityId.FEAST) this.daily2.openFeast();
    else if (id === ActivityId.LOTTO) this.stores.openLotto();
    else if (id === ActivityId.PRABUFF) this.stores.openPrabuff();
    else this.openDaily();
  }

  /** HUD VIP button (tab vip) and strip icon 19 (VIP shop tab). */
  /** Minimap red function column "Ủy thác" (offline exp window). */
  openOffline(): void {
    this.daily2.openOffline();
  }

  /** Character panel "Thú cưỡi" button (mount window, legacy CharactorPanel.showMount). */
  openMount(): void {
    this.stores.openMount();
  }

  openVip(tab: 'vip' | 'shop' = 'vip'): void {
    this.vip.open(tab);
  }

  // --- diary window ---

  /** System bar "Hoạt động hằng ngày" button and strip icon 0. */
  openDaily(): void {
    if (this.daily.isOpen) return this.closeDaily();
    this.daily.show();
    this.clock ??= setInterval(() => this.tickClock(), 60_000);
    const { client } = this.host;
    if (this.catalog.length === 0) void client.call<DiaryEntry[]>('getDiaryList').then((r) => { this.catalog = r; this.daily.render(); }).catch(fail);
    void client.call<DiaryData>('getCharDiaryData').then((r) => { this.diary = r; this.daily.render(); }).catch(fail);
    void this.refreshOnline();
  }

  private closeDaily(): void {
    this.stopClock();
    this.daily.close();
  }

  private stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  }

  private tickClock(): void {
    if (this.online) this.online = { ...this.online, minutes: this.online.minutes + 1 };
    this.daily.render();
  }

  private async refreshOnline(): Promise<void> {
    const r = await this.host.client.call<TodayOnlineTime>('getTodayOnlineTime').catch(() => null);
    if (!r) return;
    this.online = { minutes: r.t, gifts: r.f };
    this.daily.render();
  }

  private onDiary(id: string, val: number, act: number): void {
    this.diary ??= { act: 0, ad: false };
    this.diary[id] = val;
    if (act >= 0) this.diary.act = act;
    this.daily.render();
  }

  private claimChest(tier: number): void {
    void this.host.client.call<DailyActAwardReply>('getDailyActAward', tier).then((r) => {
      if (this.diary) this.diary.ad = r.f;
      this.daily.render();
    }).catch(fail);
  }

  // --- online gift timer (Core.initTimer / onTimer) ---

  private async initGiftTimer(): Promise<void> {
    const r = await this.host.client.call<TodayOnlineTime>('getTodayOnlineTime').catch(() => null);
    if (!r) return;
    this.online = { minutes: r.t, gifts: r.f };
    const remaining = (r.f + 1) * ONLINE_GIFT_MINUTES - r.t;
    if (remaining <= 0 && this.giftRetries++ < 3) void this.takeGift();
    else if (remaining > 0) this.scheduleGift(remaining);
  }

  private scheduleGift(minutes: number): void {
    if (this.giftTimer) clearTimeout(this.giftTimer);
    this.giftTimer = setTimeout(() => void this.takeGift(), Math.max(1, minutes) * 60_000);
  }

  private async takeGift(): Promise<void> {
    const res = await this.host.client.call<number>('getDailyOnlineAct').catch(() => 0);
    if (res === -1) {
      await this.initGiftTimer();
      if (this.daily.isOpen) void this.refreshOnline();
    } else if (res > 0) this.scheduleGift(res);
  }

  // --- sign-in window ---

  openSignIn(tab: number): void {
    this.signIn.show(tab);
    const { client } = this.host;
    void client.call<SignInData>('getSignInData').then((r) => { this.legacy = r; this.signIn.render(); }).catch(fail);
    void client.call<DailySignInInit>('initDailySignInActData').then((r) => { this.calendar = r; this.signIn.render(); }).catch(fail);
    void client.call('initDailySignInActConsumeLimit').catch(() => undefined);
  }

  private setCalendarData(data: DailySignInData): void {
    if (this.calendar) this.calendar.data = data;
    this.signIn.render();
  }

  private signinNow(): void {
    void this.host.client.call<SignInData>('signinNow').then((r) => { this.legacy = r; this.signIn.render(); this.syncCalendar(); }).catch(fail);
  }

  private doSignin(): void {
    void this.host.client.call<DailySignInDoReply>('dailySignInActDoSignin').then((r) => {
      this.setCalendarData(r.data);
      void this.host.client.call<SignInData>('getSignInData').then((l) => { this.legacy = l; this.signIn.render(); }).catch(() => undefined);
    }).catch(fail);
  }

  private retroactive(): void {
    void this.host.client.call('dailySignInActRetroactive').catch(fail);
  }

  private upCrit(): void {
    void this.host.client.call('dailySignInUpActCrit').catch(fail);
  }

  private claimLucky(): void {
    void this.host.client.call<number>('dailySignInActGetAward').catch(fail);
  }

  /** A legacy sign-in marks the same ledger day: reload the calendar so both tabs agree. */
  private syncCalendar(): void {
    void this.host.client.call<DailySignInInit>('initDailySignInActData').then((r) => { this.calendar = r; this.signIn.render(); }).catch(() => undefined);
  }
}
