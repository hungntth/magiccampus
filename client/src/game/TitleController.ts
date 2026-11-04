// Titles on the client: the "Danh hiệu" panel flow (gtl on open, setTitle / setActTitle replies), the nameplates over heads
// (scene payloads + onTitleUpdate / onActTitleUpdate broadcasts) and the grant pushes (onAddTitle / onAddActTitle).
// The title buff row (long-buff key 0) is pushed by the server (upLongBuff / delBuff) and drawn by the buff bar.

import {
  titleLabel, type PlayerData, type SceneCharacter, type SetActTitleResult, type SetTitleResult, type TitleAdded,
  type TitleBroadcast, type TitleList, type TitleView,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { TitlePanel } from '../ui/titlePanel';
import type { Entity } from './Entity';

export interface TitleHost {
  client: GameClient;
  player: PlayerData;
  entityOf(id: number): Entity | undefined;
  /** Re-render windows that show the player's data (character panel). */
  changed(): void;
}

interface Plate {
  tv: TitleView | null;
  atv: TitleView | null;
}

export class TitleController {
  private readonly panel: TitlePanel;
  private readonly offs: (() => void)[] = [];
  private readonly plates = new Map<number, Plate>();
  private known = new Map<number, TitleView>(); // views from gtl / grants, by id

  constructor(private readonly host: TitleHost) {
    this.panel = new TitlePanel({
      data: () => this.data(),
      onSet: (tab, id) => (tab === 0 ? this.setTitle(id) : this.setActTitle(id)),
      onClear: (tab) => (tab === 0 ? this.setTitle(-1) : this.setActTitle(-1)),
      onClose: () => this.panel.close(),
    });
    const c = host.client;
    this.offs.push(
      c.on('onTitleUpdate', (d) => this.onBroadcast(d as TitleBroadcast, false)),
      c.on('onActTitleUpdate', (d) => this.onBroadcast(d as TitleBroadcast, true)),
      c.on('onAddTitle', (d) => this.onAdded(d as TitleAdded)),
      c.on('onAddActTitle', (cts) => {
        host.player.cts = String(cts ?? '');
        this.panel.render();
      }),
      c.on('onScenePlayerLeft', (id) => this.plates.delete(Number(id))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
  }

  /** Character panel "Danh hiệu" button. */
  toggle(): void {
    if (this.panel.isOpen) {
      this.panel.close();
      return;
    }
    this.panel.show();
    void this.load();
  }

  /** Scene payload (self or a peer): draws the nameplates from `tv` / `atv`. */
  apply(entity: Entity, sc: Pick<SceneCharacter, 'id' | 'tv' | 'atv'>): void {
    this.plates.set(sc.id, { tv: sc.tv ?? null, atv: sc.atv ?? null });
    this.draw(entity, sc.id);
    if (sc.id === this.host.player.id) this.syncSelf();
  }

  private draw(entity: Entity | undefined, cid: number): void {
    const p = this.plates.get(cid);
    entity?.setTitles(p?.tv ? titleLabel(p.tv) : null, p?.atv ? titleLabel(p.atv) : null);
  }

  private syncSelf(): void {
    const p = this.plates.get(this.host.player.id);
    Object.assign(this.host.player, { t: p?.tv?.id ?? 0, actT: p?.atv?.id ?? 0, tv: p?.tv ?? undefined, atv: p?.atv ?? undefined });
  }

  private onBroadcast(d: TitleBroadcast, act: boolean): void {
    const plate = this.plates.get(d.cid) ?? { tv: null, atv: null };
    const view = d.tid > 0 ? (d.view ?? this.known.get(d.tid) ?? null) : null;
    if (act) plate.atv = view;
    else plate.tv = view;
    this.plates.set(d.cid, plate);
    this.draw(this.host.entityOf(d.cid), d.cid);
    if (d.cid === this.host.player.id) {
      this.syncSelf();
      this.panel.render();
      this.host.changed();
    }
  }

  private onAdded(d: TitleAdded): void {
    this.host.player.ct = d.ct;
    if (d.view) this.known.set(d.view.id, d.view);
    if (d.f <= 3) toast(`Nhận được danh hiệu ${d.view?.n ?? d.t}!`);
    if (this.panel.isOpen) void this.load();
  }

  private async load(): Promise<void> {
    try {
      const res = await this.host.client.call<TitleList>('gtl');
      this.host.player.ct = res.ct;
      this.host.player.cts = res.cts;
      this.known = new Map((res.titles ?? []).map((t) => [t.id, t]));
    } catch {
      // keep the previous lists
    }
    this.panel.render();
  }

  private idsOf(list: string | undefined): number[] {
    return (list ?? '').split('|').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  }

  private data(): { perm: TitleView[]; timed: TitleView[]; active: number; actActive: number } {
    const view = (id: number): TitleView[] => {
      const v = this.known.get(id);
      return v ? [v] : [];
    };
    const p = this.host.player;
    return {
      perm: this.idsOf(p.ct).flatMap(view),
      timed: this.idsOf(p.cts).flatMap(view),
      active: p.t ?? 0,
      actActive: p.actT ?? 0,
    };
  }

  private setTitle(id: number): void {
    void this.host.client.call<SetTitleResult>('setTitle', id).then(
      (r) => this.settled(r.f, 'Không thể thiết lập danh hiệu'),
      () => this.settled(false, 'Không thể thiết lập danh hiệu'),
    );
  }

  private setActTitle(id: number): void {
    void this.host.client.call<SetActTitleResult>('setActTitle', id).then(
      (r) => this.settled(r.f, 'Không thể hiển thị danh hiệu'),
      () => this.settled(false, 'Không thể hiển thị danh hiệu'),
    );
  }

  private settled(ok: boolean, failText: string): void {
    if (!ok) toast(failText, true);
    this.panel.settle();
  }
}
