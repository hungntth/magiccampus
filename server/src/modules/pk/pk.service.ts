// PK service (M6 phase C): the opt-in flag (uif apvp, sent in the login payload) and PVPStartClient, which gathers the facts, runs the
// pure pkEligibility gate and starts a PvP battle on the combat module. Refusals throw RpcException.forbidden(note) (the client toasts it).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { parseSafeAreas, PK_NOTES } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { CombatService } from '../combat/combat.service';
import { PvpService } from '../combat/pvp.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import { CharacterStatsService, type CharStats } from '../stats/character-stats.service';
import { pkEligibility, type PkSide } from './pk-rules';

@Injectable()
export class PkService implements OnModuleInit {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
    private readonly gameData: GameDataService,
    private readonly parties: PartyManager,
    private readonly stats: CharacterStatsService,
    private readonly combat: CombatService,
    private readonly pvp: PvpService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra(async (cid) => ({ apvp: await this.apvpOf(cid) }));
  }

  async apvpOf(characterId: number): Promise<boolean> {
    const doc = await this.chars.findById(characterId, { apvp: 1 }).lean();
    return doc?.apvp === true;
  }

  /** uif("apvp", bool, false): persists the opt-in on the character. */
  async setApvp(characterId: number, on: boolean): Promise<void> {
    await this.chars.updateOne({ _id: characterId }, { $set: { apvp: on } });
  }

  /** PVPStartClient(targetCid): gates, then the duel. */
  async start(session: Session, targetCid: number): Promise<void> {
    const aCid = session.characterId!;
    if (targetCid === aCid) throw RpcException.invalidArgs('targetCid');
    const target = this.scenes.findByCharacter(targetCid);
    if (!target || !target.hasCharacter) throw RpcException.forbidden(PK_NOTES.OFFLINE);
    const [aSt, tSt] = await Promise.all([this.stats.compute(aCid), this.stats.compute(targetCid)]);
    const map = this.gameData.getMap(session.mapId);
    const verdict = pkEligibility(this.sideOf(session, aSt), this.sideOf(target, tSt), tSt.doc.apvp === true, {
      pk: Number(map?.pk ?? 0), safeFlag: Number(map?.safe_flag ?? 0), safeAreas: parseSafeAreas(map?.s_area as string | null | undefined),
    });
    if (!verdict.ok) throw RpcException.forbidden(verdict.note);
    const pets = await this.combat.loadPets([aCid, targetCid]);
    const battle = this.pvp.start(
      { session, st: aSt, pet: pets.get(aCid) }, { session: target, st: tSt, pet: pets.get(targetCid) },
    );
    if (!battle) throw RpcException.forbidden(PK_NOTES.IN_BATTLE);
  }

  private sideOf(s: Session, st: CharStats): PkSide {
    const cid = s.characterId!;
    const party = this.parties.partyOf(cid);
    return {
      cid, mapId: s.mapId, x: st.doc.posX, y: st.doc.posY, hp: st.doc.currentHp, inBattle: s.battleId !== null,
      partyId: party?.id ?? null, partyLeader: !party || party.leaderId === cid || party.afk.has(cid),
    };
  }
}
