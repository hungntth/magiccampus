// M10 NPC hook registry: feature modules (dungeons, towers, training…) claim NPC clicks, npcScript menu picks and hitNpc
// fights. Hooks run in registration order (lower `order` first); the first one that returns true wins, the caller falls back
// to its default behaviour when none claims. Func ids are the Go handler ids (`dg_mh_<npc>_<diff>`, `hlvt_start`, …).

import { Injectable, Logger } from '@nestjs/common';
import type { InstanceNpc } from '@mc/shared';
import type { Session } from '../../gateway/session';

/** The NPC a click / fight targets: a data_tbl_npc row or a per-viewer instance NPC. */
export interface NpcRef {
  id: number; // the clicked id (instance id for instance NPCs)
  nid: number; // template id
  mapId: number;
  x: number;
  y: number;
  type: number;
  instance?: InstanceNpc;
}

export type ClickHook = (session: Session, npc: NpcRef) => Promise<boolean> | boolean;
export type ScriptHook = (session: Session, func: string) => Promise<boolean> | boolean;
export type HitHook = (session: Session, npc: NpcRef) => Promise<boolean> | boolean;

interface Entry<F> {
  name: string;
  order: number;
  fn: F;
}

@Injectable()
export class NpcHookRegistry {
  private readonly logger = new Logger(NpcHookRegistry.name);
  private readonly clicks: Entry<ClickHook>[] = [];
  private readonly scripts: Entry<ScriptHook>[] = [];
  private readonly hits: Entry<HitHook>[] = [];

  onClick(name: string, fn: ClickHook, order = 100): void {
    add(this.clicks, { name, order, fn });
  }

  onScript(name: string, fn: ScriptHook, order = 100): void {
    add(this.scripts, { name, order, fn });
  }

  onHit(name: string, fn: HitHook, order = 100): void {
    add(this.hits, { name, order, fn });
  }

  runClick(session: Session, npc: NpcRef): Promise<boolean> {
    return this.run(this.clicks, (fn) => fn(session, npc), `click ${npc.id}`);
  }

  runScript(session: Session, func: string): Promise<boolean> {
    return this.run(this.scripts, (fn) => fn(session, func), `script ${func}`);
  }

  runHit(session: Session, npc: NpcRef): Promise<boolean> {
    return this.run(this.hits, (fn) => fn(session, npc), `hit ${npc.id}`);
  }

  private async run<F>(list: readonly Entry<F>[], call: (fn: F) => Promise<boolean> | boolean, what: string): Promise<boolean> {
    for (const e of list) {
      if (await call(e.fn)) {
        this.logger.debug(`${what} claimed by ${e.name}`);
        return true;
      }
    }
    return false;
  }
}

function add<F>(list: Entry<F>[], e: Entry<F>): void {
  list.push(e);
  list.sort((a, b) => a.order - b.order);
}
