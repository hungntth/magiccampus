// Loads a simulated line-up (PPVE / arena) from the database: the owner's pets by id, their battle view under a stat context (PPVE
// adds the carve provider; the arena guard / talent too), full HP / MP and no life drain, as Fighters at explicit slots with their cmdList
// scripts. Skill ids of a script are mapped to the skill the pet owns (same code_name, any level) so an upgraded skill still casts.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PPVESlot } from '@mc/shared';
import type { Fighter, Side } from '../combat/battle.types';
import { petFighterAt } from '../combat/fighters';
import { GameDataService } from '../gamedata/gamedata.service';
import { PetBattleService } from '../pet/pet-battle.service';
import type { PetStatContext } from '../pet/pet-stat-provider';
import { Pet } from '../pet/pet.schema';
import type { PetScript } from './pet-script';
import { scriptOf } from './ppve-rules';

export interface Lineup {
  fighters: Fighter[];
  /** Script by fighter slot (only pets with a non-empty cmdList). */
  scripts: Map<number, PetScript>;
}

export interface LineupSpec {
  slots: readonly PPVESlot[];
  ctx: Extract<PetStatContext, 'ppve' | 'arena'>;
  side: Side;
  /** Battle slot of a position 1..5 (PPVE 15..19; the arena attacker 15..19, the defender 5..9). */
  slotOf: (pos: number) => number;
}

@Injectable()
export class PetLineupService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly petBattle: PetBattleService,
    private readonly gameData: GameDataService,
  ) {}

  /** The fighters of the owner's pets in `spec.slots` (a deleted pet is simply absent). */
  async load(ownerId: number, spec: LineupSpec): Promise<Lineup> {
    const rows = await this.pets.find({ _id: { $in: spec.slots.map((s) => s.pid) }, characterId: ownerId }).lean();
    const views = await this.petBattle.battlePetsOf(ownerId, rows, spec.ctx);
    const out: Lineup = { fighters: [], scripts: new Map() };
    for (const slot of spec.slots) {
      const view = views.get(slot.pid);
      if (!view) continue;
      const fighter = petFighterAt(spec.slotOf(slot.pos), spec.side, view);
      fighter.ownerCid = undefined; // the client must not treat a line-up pet as the viewer's own battle pet
      out.fighters.push(fighter);
      const script = this.ownedScript(scriptOf(slot.cmdList), view.skills);
      if (Object.keys(script).length > 0) out.scripts.set(fighter.slot, script);
    }
    return out;
  }

  /** Skill entries are rewritten to the owned skill of the same family; an entry the pet does not own keeps its id (the engine then attacks). */
  private ownedScript(script: PetScript, owned: readonly number[]): PetScript {
    const out: PetScript = {};
    for (const [round, entry] of Object.entries(script)) {
      out[round] = entry.action === -50 && entry.id > 0 ? { ...entry, id: this.ownedSkill(entry.id, owned) } : entry;
    }
    return out;
  }

  private ownedSkill(id: number, owned: readonly number[]): number {
    if (owned.includes(id)) return id;
    const code = this.gameData.skill(id)?.codeName;
    if (!code) return id;
    return owned.find((sid) => this.gameData.skill(sid)?.codeName === code) ?? id;
  }
}
