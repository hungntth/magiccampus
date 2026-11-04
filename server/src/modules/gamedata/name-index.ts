// Exact-name lookups over static tables (achievement rewards / kill targets resolve titles, creatures and items by name).
// Names are NFC-normalised, whitespace-collapsed and lower-cased; ids keep the table order (lowest id first).

export const nameKey = (s: unknown): string => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** name key -> ids (ascending) for rows of `{id, <field>}`. */
export function buildNameIndex(rows: Iterable<Record<string, unknown>>, field: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const key = nameKey(r[field]);
    const id = Number(r.id);
    if (!key || !Number.isFinite(id)) continue;
    const list = out.get(key) ?? [];
    list.push(id);
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}
