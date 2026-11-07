// Core VIP data access (VipCoreModule, importable by chat / scene without cycles): the character_vip document with an optimistic
// `rev` update, the cached data_tbl_pm_right view, the right-13 transform pool and the scene / chat pmLevel decoration.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { parseCountConfig, pmLevelOf, type PmCountConfig, type PmRightView, type SceneCharacter } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterVip } from './vip.schema';
import { emptyVip, type VipState } from './pm-rules';

export interface VipDoc extends VipState {
  characterId: number;
  rev: number;
  transform: { resCode: string; expiresAt: number; pm?: boolean } | null;
}

const stripTags = (s: unknown): string => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\\[rn]|[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

@Injectable()
export class PmStateService {
  private rightList: PmRightView[] | null = null;
  private pool: string[] | null = null;
  private configs = new Map<number, PmCountConfig>();

  constructor(
    @InjectModel(CharacterVip.name) private readonly vips: Model<CharacterVip>,
    private readonly gameData: GameDataService,
  ) {}

  /** data_tbl_pm_right as panel rows sorted by sortIndex (static, cached). */
  async rights(): Promise<PmRightView[]> {
    if (this.rightList) return this.rightList;
    const rows = await this.gameData.rows('data_tbl_pm_right');
    for (const r of rows) this.configs.set(Number(r.id), parseCountConfig(r.count_config));
    this.rightList = rows
      .map((r): PmRightView => ({
        id: Number(r.id), type: Number(r.type ?? 3), sortIndex: Number(r.sort_index ?? 0), desc: stripTags(r.desc), desc2: stripTags(r.desc2),
        maxCount: Number(String(r.count_config ?? '').split('|')[2]) || 1,
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => numOrNull(r[`value${i}`])),
        vip: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => Number(r[`vip${i}`] ?? 0) > 0),
      }))
      .sort((a, b) => a.sortIndex - b.sortIndex);
    return this.rightList;
  }

  /** Claim cycle of a right (`cycle|window|max`; defaults to once a day). Call after rights(). */
  configOf(id: number): PmCountConfig {
    return this.configs.get(id) ?? parseCountConfig(null);
  }

  /** Distinct res codes of the creatures marked show_able (right 13 picks one a day), sorted. */
  async transformPool(): Promise<string[]> {
    this.pool ??= [...new Set((await this.gameData.rows('data_tbl_creature', { show_able: 1 })).map((r) => String(r.res_code)))]
      .filter((c) => c !== 'undefined' && c !== '0')
      .sort((a, b) => Number(a) - Number(b));
    return this.pool;
  }

  /** The document when it exists (no row is created). */
  async peek(characterId: number): Promise<VipDoc | null> {
    const found = await this.vips.findOne({ characterId }).lean<VipDoc>();
    return found ? this.normalise(found) : null;
  }

  /** The character's document, created with defaults on first use. */
  async load(characterId: number): Promise<VipDoc> {
    const found = await this.vips.findOne({ characterId }).lean<VipDoc>();
    if (found) return this.normalise(found);
    try {
      const doc = await this.vips.findOneAndUpdate(
        { characterId }, { $setOnInsert: { characterId, ...emptyVip(), transform: null, rev: 0 } }, { upsert: true, new: true },
      ).lean<VipDoc>();
      return this.normalise(doc!);
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      return this.normalise((await this.vips.findOne({ characterId }).lean<VipDoc>())!);
    }
  }

  private normalise(d: VipDoc): VipDoc {
    return { ...emptyVip(), ...d, process: d.process ?? {}, missed: d.missed ?? [], auditRights: d.auditRights ?? [], transform: d.transform ?? null };
  }

  /** Applies `patch` only when the document is still at `rev`; returns the new document or null when it moved (caller retries). */
  async update(characterId: number, rev: number, patch: Record<string, unknown>): Promise<VipDoc | null> {
    const doc = await this.vips.findOneAndUpdate({ characterId, rev }, { $set: patch, $inc: { rev: 1 } }, { new: true }).lean<VipDoc>();
    return doc ? this.normalise(doc) : null;
  }

  /** pmLevel now; 0 for characters without a document (no row is created). */
  async levelOf(characterId: number, now = Date.now()): Promise<number> {
    const doc = await this.vips.findOne({ characterId }, { vipType: 1, expiresAt: 1, pmExp: 1 }).lean<VipDoc>();
    return pmLevelOf(doc, now);
  }

  /** Active transform body art (VIP right 13 / Mê Huyễn curse) or null; no row is created. */
  async activeTransform(characterId: number, now = Date.now()): Promise<string | null> {
    const doc = await this.vips.findOne({ characterId }, { transform: 1 }).lean<VipDoc>();
    return doc?.transform && doc.transform.expiresAt > now ? doc.transform.resCode : null;
  }

  /** Scene payload decoration: pmLevel, and today's right-13 transform replaces the map sprite (resCode). */
  async decorate(sc: SceneCharacter): Promise<SceneCharacter> {
    const now = Date.now();
    const doc = await this.vips.findOne({ characterId: sc.id }, { vipType: 1, expiresAt: 1, pmExp: 1, transform: 1 }).lean<VipDoc>();
    const out: SceneCharacter = { ...sc, pmLevel: pmLevelOf(doc, now) };
    if (doc?.transform && doc.transform.expiresAt > now) out.resCode = doc.transform.resCode;
    return out;
  }
}
