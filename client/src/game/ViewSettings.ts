// Client-side effects of the "Hệ thống" panel (M9 phase G): hc hides other players, hn hides names, maxView caps the
// rendered players, ac keeps the camera centred on the player (off: it only scrolls when the player nears an edge).

import { settingOn, SYSTEM_SETTING_DEFAULTS, type InterfaceData } from '@mc/shared';
import type { Entity } from './Entity';

/** Share of the screen the player may cross before the camera follows when "Nhân vật ở giữa" is off. */
const EDGE = 0.3;

export class ViewSettings {
  hideOthers = false;
  hideNames = false;
  centered = true;
  maxView = Number(SYSTEM_SETTING_DEFAULTS.maxView);

  load(data: InterfaceData | undefined): void {
    this.hideOthers = settingOn(data, 'hc');
    this.hideNames = settingOn(data, 'hn');
    this.centered = settingOn(data, 'ac');
    const mv = Number(data?.maxView ?? SYSTEM_SETTING_DEFAULTS.maxView);
    this.maxView = Number.isInteger(mv) && mv > 0 ? mv : Number(SYSTEM_SETTING_DEFAULTS.maxView);
  }

  /** Other players in insertion order: hidden by hc, or beyond maxView. The own name follows hn too. */
  apply(players: Iterable<Entity>, self: Entity | null): void {
    let shown = 0;
    for (const e of players) {
      const visible = !this.hideOthers && shown < this.maxView;
      if (visible) shown++;
      e.visible = visible;
      e.showLabels(!this.hideNames);
    }
    self?.showLabels(!this.hideNames);
  }

  /** Camera offset along one axis: `prev` current offset, `pos` player position, `span` screen size, `max` limit. */
  camera(prev: number, pos: number, span: number, max: number): number {
    const centred = pos - span / 2;
    if (this.centered) return clamp(centred, 0, max);
    const lo = prev + span * EDGE;
    const hi = prev + span * (1 - EDGE);
    const next = pos < lo ? pos - span * EDGE : pos > hi ? pos - span * (1 - EDGE) : prev;
    return clamp(next, 0, max);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
