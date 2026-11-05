// Phụ bản quest pick-ups (Go handlers/npc gathering_quest_node.go, restricted here to dungeon floor maps): a type-24 NPC whose
// `qid` names a quest gives that quest's collect item (the one named like the node when the quest needs several; else the
// first kind-1 type-29 requirement), 1 bound unit per click, only while the quest is active and short of the item. H5 picks
// are instant (M10 decision 15: no hand-pick bar, no node stock).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { NpcType } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { InventoryService } from '../inventory/inventory.service';
import { midNote, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { GrantService } from '../rewards/grant.service';
import { dungeonByMap } from './dungeon-rules';
import { DungeonSupport } from './dungeon-support.service';

const TEXT = {
  NEED_QUEST: (q: string, item: string) => `Cần nhận nhiệm vụ [${q}] mới có thể lấy ${item}.`,
  ENOUGH: (item: string) => `Ngươi đã có đủ ${item} cho nhiệm vụ.`,
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.',
} as const;

/** Quest ids of a node's `qid` ("|1462", "5548", "|1985|1986"). */
export function nodeQuestIds(raw: unknown): number[] {
  return String(raw ?? '').split('|').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
}

/** Go questNodeCollectItem over requirement rows. */
export function nodeItem(nodeName: string, rows: readonly { kind: number; type: number; itemId: number; num: number }[], itemName: (id: number) => string): { itemId: number; need: number } | null {
  const items = rows.filter((r) => r.kind === 1 && r.type === 29 && r.itemId > 0);
  const named = items.find((r) => nodeName.trim() !== '' && itemName(r.itemId).trim() === nodeName.trim());
  const r = named ?? items[0];
  return r ? { itemId: r.itemId, need: Math.max(1, r.num) } : null;
}

@Injectable()
export class DungeonPickupHooks implements OnModuleInit {
  private readonly names = new Map<number, string>();

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
    private readonly support: DungeonSupport,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('dungeon-pickup', async (s, npc) => {
      if (npc.instance || npc.type !== NpcType.GATHER || !dungeonByMap(s.mapId)) return false;
      const row = this.gameData.getNpc(npc.id);
      const qids = nodeQuestIds(row?.qid);
      if (!row || qids.length === 0) return false;
      await this.pick(s, String(row.name ?? ''), qids);
      return true;
    }, 70);
  }

  private async itemName(id: number): Promise<string> {
    if (!this.names.has(id)) this.names.set(id, String((await this.gameData.template(29, id))?.name ?? id));
    return this.names.get(id)!;
  }

  private async pick(session: Session, nodeName: string, qids: number[]): Promise<void> {
    const cid = session.characterId!;
    for (const qid of qids) {
      const rows = this.gameData.questRequire(qid);
      for (const r of rows) if (r.kind === 1) await this.itemName(r.itemId);
      const need = nodeItem(nodeName, rows, (id) => this.names.get(id) ?? '');
      if (!need) continue;
      const item = this.names.get(need.itemId) ?? String(need.itemId);
      if (!(await this.support.questActive(cid, qid))) return systemSay(session, TEXT.NEED_QUEST(this.support.questName(qid), item));
      const held = (await this.inventory.countByTemplate(cid, [need.itemId])).get(need.itemId) ?? 0;
      if (held >= need.need) return systemSay(session, TEXT.ENOUGH(item));
      const g = [{ kind: 'item' as const, table: 29, templateId: need.itemId, qty: 1, bound: true }];
      if (!(await this.grants.fits(cid, g))) return midNote(session, TEXT.BAG_FULL);
      await this.grants.grant(session, g);
      await this.support.pushQuest(session, qid);
      return;
    }
  }
}
