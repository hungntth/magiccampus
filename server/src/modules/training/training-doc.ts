// Shapes of the per-character training document (collection character_training, Go stat features hmtxl / hmt_tower / txkc):
// the room session, the Ảo Ma Tháp progress and the Khóa Học Đặc Huấn season. Pure: defaults and a copy helper.

/** Public room session: `st` start ms (0 = not training), `u` finished shares waiting for the reward. */
export interface HmtxlDoc {
  st: number;
  u: number;
}

/** Tower progress: `b` best floor cleared, `f` floor being challenged (0 = outside), `w` week key of the last reset. */
export interface TowerDoc {
  b: number;
  f: number;
  w: string;
}

/** TXKC season state; keys as Go: season `YYYY-MM`, day / week keys, `dc` / `wc` = claimed task ids. */
export interface TxkcDoc {
  season: string;
  exp: number;
  adv: 0 | 1;
  awd1: number;
  awd2: number;
  day: string;
  dopen: 0 | 1;
  dc: Record<string, 1>;
  sp: number;
  week: string;
  wc: Record<string, 1>;
}

export interface TrainingDoc {
  characterId: number;
  hmtxl: HmtxlDoc;
  tower: TowerDoc;
  txkc: TxkcDoc | null;
  rev: number;
}

export const emptyTraining = (characterId: number): TrainingDoc => ({
  characterId, hmtxl: { st: 0, u: 0 }, tower: { b: 0, f: 0, w: '' }, txkc: null, rev: 0,
});

/** Stored (possibly partial / old) values -> a complete document. */
export function completeTraining(characterId: number, raw: Partial<TrainingDoc> | null): TrainingDoc {
  const base = emptyTraining(characterId);
  if (!raw) return base;
  return {
    characterId,
    hmtxl: { ...base.hmtxl, ...(raw.hmtxl ?? {}) },
    tower: { ...base.tower, ...(raw.tower ?? {}) },
    txkc: raw.txkc && typeof raw.txkc === 'object' && Object.keys(raw.txkc).length > 0 ? { ...raw.txkc } : null,
    rev: raw.rev ?? 0,
  };
}
