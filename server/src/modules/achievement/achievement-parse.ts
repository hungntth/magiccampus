// Pure text/type rules of achievements (M7 phase B): threshold parsing, requirement classification (the research's inferred type map,
// refined by the description because one `type` code mixes several meanings) and the reward text of `desc`. No DB access.

export type AchieveKind =
  | 'level' | 'silver' | 'gold' | 'petsOwned' | 'titlesOwned' | 'guildJoined' | 'friends' | 'heiyaoshiFigures' // absolute values (current value)
  | 'questsFinished' | 'creatureKill' | 'petCaught' | 'loginDays'; // incremental counters

export type AchieveMode = 'abs' | 'inc';

/** Requirement id of the first heiyaoshi formation achievement (type 57, "Hỏa Trận"). */
const HEIYAOSHI_FIRST_REQ_ID = 699;

export const KIND_MODE: Record<AchieveKind, AchieveMode> = {
  level: 'abs', silver: 'abs', gold: 'abs', petsOwned: 'abs', titlesOwned: 'abs', guildJoined: 'abs', friends: 'abs', heiyaoshiFigures: 'abs',
  questsFinished: 'inc', creatureKill: 'inc', petCaught: 'inc', loginDays: 'inc',
};

export interface RequireRow {
  id: number;
  aid: number;
  type: number;
  num: number;
  name: string;
  showType: number;
}

export interface ReqSpec {
  reqId: number;
  aid: number;
  kind: AchieveKind;
  mode: AchieveMode;
  target: number;
  /** creatureKill: creature template ids that count. */
  creatureIds?: readonly number[];
}

export type Classified = { spec: ReqSpec } | { reason: string };

const MULTIPLIERS: [RegExp, number][] = [[/^(tỷ|ty)$/i, 1e9], [/^(triệu|trieu)$/i, 1e6], [/^(nghìn|ngàn|ngan|nghin)$/i, 1e3], [/^vạn$/i, 1e4]];

export const normalizeText = (s: unknown): string => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** First number of a description ("đạt 8888" -> 8888, "đạt 1 triệu" -> 1000000), or null when there is none. */
export function parseThreshold(description: string): number | null {
  const m = /(\d+(?:\.\d+)*)(?:\s+([^\s\d]+))?/.exec(normalizeText(description));
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  if (!Number.isFinite(n)) return null;
  const word = m[2] ?? '';
  for (const [re, mul] of MULTIPLIERS) if (re.test(word)) return n * mul;
  return n;
}

/** Threshold of a requirement: `num` when set, else the number written in the description. */
export function resolveTarget(num: number, description: string): number | null {
  if (num > 0) return num;
  const parsed = parseThreshold(description);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/** Decides which H5 event source feeds a SINGLE requirement; `creaturesByName` resolves exact creature names to template ids. */
export function classifyRequirement(
  req: RequireRow, description: string, creaturesByName: (name: string) => readonly number[],
): Classified {
  const d = normalizeText(description);
  const spec = (kind: AchieveKind, target: number | null, creatureIds?: readonly number[]): Classified =>
    target === null ? { reason: 'no-threshold' } : {
      spec: { reqId: req.id, aid: req.aid, kind, mode: KIND_MODE[kind], target, ...(creatureIds ? { creatureIds } : {}) },
    };
  const target = resolveTarget(req.num, d);
  switch (req.type) {
    case 4:
      if (/^(Cấp độ người chơi đạt cấp|Nhân vật đạt cấp độ) \d+$/i.test(d)) return spec('level', target);
      if (/^Lượng ngân phiếu .* đạt \d+$/i.test(d)) return spec('silver', target);
      if (/^Lương kim phiếu .* đạt \d+$/i.test(d)) return spec('gold', target);
      return { reason: 'type4-unmapped' };
    case 3:
      return /^Bắt \d+ pet thành công$/i.test(d) ? spec('petCaught', target) : { reason: 'type3-unmapped' };
    case 2:
      return req.name === 'Số lượng pet' ? spec('petsOwned', target) : { reason: 'type2-pet-quality-or-race' };
    case 7:
      return req.name === 'Số lượng danh hiệu' ? spec('titlesOwned', target) : { reason: 'type7-unmapped' };
    case 8:
      return spec('loginDays', target);
    case 57: {
      // 6308..6317 "Hỏa Trận" .. "Thánh Trận" (requirement ids 699..708) are the 10 heiyaoshi figures in order (assumption: the panel
      // that names them is not decompiled); 709 "Quán Quân Giải Mã" is the astrology decoder, which has no source.
      const figure = req.id - HEIYAOSHI_FIRST_REQ_ID + 1;
      return figure >= 1 && figure <= 10 ? spec('heiyaoshiFigures', figure) : { reason: 'type57-astrology' };
    }
    case 1:
      return /^Hoàn thành \d+ nhiệm vụ$/i.test(d) ? spec('questsFinished', target) : { reason: 'type1-specific-quest' };
    case 21:
      return /^Gia nhập thành công \d+ bang hội$/i.test(d) ? spec('guildJoined', 1) : { reason: 'type21-guild-contribution' };
    case 22:
      return /^(Thêm ít nhất \d+ người bạn|Số lượng bạn đạt đến \d+)$/i.test(d) ? spec('friends', target) : { reason: 'type22-unmapped' };
    case 0: {
      const m = /^(?:Đánh bại|Đánh bai|Tiêu diệt) (.+)$/i.exec(d);
      if (!m || / trong /i.test(m[1])) return { reason: 'type0-unmapped' };
      const ids = creaturesByName(m[1]);
      return ids.length > 0 ? spec('creatureKill', 1, ids) : { reason: 'type0-creature-not-found' };
    }
    default:
      return { reason: `unmapped-type-${req.type}` };
  }
}

export interface RewardPlan {
  titleName: string | null;
  items: { name: string; qty: number }[];
}

/** Reward text of `desc` ("Phần thưởng Danh Hiệu X", "Nhận vật phẩm: A*2 , B*1", "nhận 2 X", "Phần thưởng Ấn Chương Y"). */
export function parseReward(desc: string): RewardPlan {
  // Some seed rows end with a literal backslash-r (the legacy dump escaped CR): drop those sequences.
  const d = normalizeText(String(desc ?? '').replace(/\\[rn]/g, ' '));
  const title = /danh\s*hi[ệe]u\s*:?\s*(.+)$/i.exec(d);
  if (title) return { titleName: title[1].replace(/[.\s]+$/, ''), items: [] };
  const list = /nh[ậa]n(?:\s+v[ậa]t\s+ph[ẩa]m)?\s*:?\s*(.+)$/i.exec(d) ?? /ph[ầa]n\s+th[ưu][ởo]ng\s+(.+)$/i.exec(d);
  if (!list) return { titleName: null, items: [] };
  const items = list[1].split(',').flatMap((part) => {
    const p = part.trim();
    const star = /^(.+?)\s*\*\s*(\d+)$/.exec(p);
    if (star) return [{ name: star[1].trim(), qty: Number(star[2]) }];
    const lead = /^(\d+)\s+(.+)$/.exec(p);
    if (lead) return [{ name: lead[2].trim(), qty: Number(lead[1]) }];
    return p ? [{ name: p, qty: 1 }] : [];
  });
  return { titleName: null, items };
}
