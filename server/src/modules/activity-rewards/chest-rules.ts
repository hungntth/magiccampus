// Pure parsing of the diary chest descriptions (items 3255..3259 have no contents table, only text such as
// "Có thể mở ra: A, B, C / Chắc chắn nhận: X, Y"): the pool names, the guaranteed names and a random pick of N from the pool.

export interface ChestPlan {
  pool: string[];
  sure: string[];
}

const split = (s: string): string[] => s.split(/[,\r\n]+/).map((x) => x.trim()).filter((x) => x.length > 0);

/** Splits the description at the "Chắc chắn nhận" marker; the pool follows "Có thể mở ra" / "Có thể nhận". */
export function parseChestDesc(desc: string): ChestPlan {
  const text = String(desc ?? '');
  const sureAt = text.search(/Chắc chắn nhận\s*[:：]/i);
  const head = sureAt >= 0 ? text.slice(0, sureAt) : text;
  const tail = sureAt >= 0 ? text.slice(sureAt) : '';
  const pool = head.replace(/^[\s\S]*?Có thể (?:mở ra|nhận)\s*[:：]/i, '');
  return {
    pool: head === pool ? [] : split(pool),
    sure: split(tail.replace(/^Chắc chắn nhận\s*[:：]/i, '')),
  };
}

/** `count` distinct names from `pool` using `rng` in [0,1) (partial Fisher-Yates); fewer when the pool is smaller. */
export function pickFrom(pool: readonly string[], count: number, rng: () => number): string[] {
  const a = [...pool];
  const out: string[] = [];
  while (out.length < count && a.length > 0) {
    const i = Math.min(a.length - 1, Math.floor(rng() * a.length));
    out.push(a.splice(i, 1)[0]);
  }
  return out;
}
