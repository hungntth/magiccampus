// Kho Báu Đại Mạc hooks (Go application/dungeon khobau_rules.go, handlers/npc dungeon_khobau.go): boss kits on the line-up
// (skill roll × 2 for 321 / 323-327, Đồng Bì 325 defence × 2 / dodge × 3, Xác Ướp 326 speed × 1.5, Tư Tế Bồi Táng 204 rebuilt
// at the dungeon level and halved), the Bồi Táng vase package 3-90102 per credited character, and the chest reveal on the
// Pharaoh 689 win (no floor quest on floor 5). The event copy (khobau_event) fights with stock stats.

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DungeonDef } from '@mc/shared';
import type { Fighter } from '../../combat/battle.types';
import { creatureFighter } from '../../combat/fighters';
import { GameDataService } from '../../gamedata/gamedata.service';
import { InstanceDataService } from '../../gamedata/instance-data';
import { systemSay } from '../../npcscript/menu';
import { GrantService, type Grant } from '../../rewards/grant.service';
import { rollPlan } from '../../rewards/plan-roller';
import { DungeonChestService } from '../dungeon-chest.service';
import { DungeonEvents } from '../dungeon-events';
import { DungeonFightService } from '../dungeon-fight.service';
import { DungeonSupport } from '../dungeon-support.service';

export const KHOBAU = { KEY: 'khobau', VASE_PLAN: '3-90102', VASE_FIRST: 898, VASE_LAST: 908, PHARAOH: 689 } as const;

export interface KhoBauTuning { skillScale?: number; defense?: number; dodge?: number; speed?: number; stats?: number; relevel?: boolean }

/** Per creature id (khobau_rules.go khoBauTuning). */
export const KHOBAU_TUNING: Readonly<Record<number, KhoBauTuning>> = {
  321: { skillScale: 2 }, 323: { skillScale: 2 }, 324: { skillScale: 2 }, 325: { skillScale: 2, defense: 2, dodge: 3 },
  326: { skillScale: 2, speed: 1.5 }, 327: { skillScale: 2 }, 204: { relevel: true, stats: 0.5 },
};

const scale = (v: number, f?: number): number => (f && f > 0 && v > 0 ? Math.max(1, Math.floor(v * f)) : v);

/** Applies the kit in place (pure apart from the optional relevel builder). */
export function tuneKhoBau(f: Fighter, t: KhoBauTuning): void {
  if (t.stats) {
    f.hpMax = scale(f.hpMax, t.stats);
    f.hp = f.hpMax;
    f.attack = scale(f.attack, t.stats);
    f.defense = scale(f.defense, t.stats);
    f.magicAttack = scale(f.magicAttack, t.stats);
    f.magicDefense = scale(f.magicDefense, t.stats);
  }
  f.defense = scale(f.defense, t.defense);
  f.dodge = scale(f.dodge, t.dodge);
  f.speed = scale(f.speed, t.speed);
  if (t.skillScale) f.npc = { ...(f.npc ?? {}), chanceScale: t.skillScale };
}

const TEXT = {
  VASE: (n: string) => `Mở ${n} nhận được bảo vật bồi táng.`,
  VASE_FULL: 'Túi đồ đã đầy, một phần bảo vật bồi táng không nhận được.',
  CHEST: (n: string) => `Pharaoh Cabu III đã ngã xuống, ${n} đã xuất hiện.`,
} as const;

@Injectable()
export class KhoBauHooks implements OnModuleInit {
  constructor(
    private readonly fights: DungeonFightService,
    private readonly events: DungeonEvents,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly grants: GrantService,
    private readonly chests: DungeonChestService,
    private readonly support: DungeonSupport,
  ) {}

  onModuleInit(): void {
    this.fights.addTuner((enemies, d) => this.tune(enemies, d));
    this.events.onVictory(async (e) => {
      if (e.d.key !== KHOBAU.KEY) return;
      for (const cid of e.credited) {
        if (e.npcId >= KHOBAU.VASE_FIRST && e.npcId <= KHOBAU.VASE_LAST) await this.vase(cid, e.npcId);
        if (e.npcId === KHOBAU.PHARAOH && (await this.chests.pushIfVisible(cid, e.d))) {
          this.support.say(cid, TEXT.CHEST(this.support.npcName(e.d.chest!.npc, 'Bảo Rương')));
        }
      }
    });
  }

  private tune(enemies: Fighter[], d: DungeonDef): void {
    if (d.key !== KHOBAU.KEY) return;
    enemies.forEach((f, i) => {
      const t = KHOBAU_TUNING[f.refId];
      if (!t) return;
      let unit = f;
      const tpl = t.relevel && f.level > d.level ? this.gameData.creature(f.refId) : undefined;
      if (tpl) unit = { ...creatureFighter(f.slot, tpl, d.level, f.bossFlag, f.expBase ?? -1), npc: f.npc };
      tuneKhoBau(unit, t);
      enemies[i] = unit;
    });
  }

  private async vase(characterId: number, npcId: number): Promise<void> {
    const s = this.support.session(characterId);
    if (!s) return;
    const grants: Grant[] = this.grants.fromPlan(rollPlan(this.instanceData.planRows(KHOBAU.VASE_PLAN), Math.random));
    const fit: Grant[] = [];
    for (const g of grants) if (await this.grants.fits(characterId, [...fit, g])) fit.push(g);
    if (fit.length > 0 && (await this.grants.grant(s, fit))) systemSay(s, TEXT.VASE(this.support.npcName(npcId, 'Bồi Táng Phẩm')));
    if (fit.length < grants.length) systemSay(s, TEXT.VASE_FULL);
  }
}
