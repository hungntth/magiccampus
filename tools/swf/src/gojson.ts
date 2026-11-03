// JSON output identical to what the Go tools wrote (encoding/json), so regenerated files diff
// cleanly: plain objects are structs (field order kept, undefined fields dropped), Maps are Go
// maps (keys sorted bytewise), -0 prints as "-0", and <, >, &, U+2028/U+2029 are \u-escaped.

export function goJSON(v: unknown, indent = ''): string {
  return enc(v, indent, '');
}

function enc(v: unknown, indent: string, pre: string): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return str(v);
  let entries: [string, unknown][];
  let open = '{';
  let close = '}';
  if (Array.isArray(v)) {
    entries = v.map((x) => ['', x]);
    open = '[';
    close = ']';
  } else if (v instanceof Map) {
    entries = [...v.entries()].map(([k, x]): [string, unknown] => [String(k), x]);
    entries.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  } else {
    entries = Object.entries(v as object).filter(([, x]) => x !== undefined);
  }
  if (entries.length === 0) return open + close;
  const inner = pre + indent;
  const sep = indent ? ',\n' + inner : ',';
  const keySep = indent ? ': ' : ':';
  const items = entries.map(([k, x]) => (open === '{' ? str(k) + keySep : '') + enc(x, indent, inner));
  return indent ? `${open}\n${inner}${items.join(sep)}\n${pre}${close}` : open + items.join(sep) + close;
}

// Built from char codes: the line/paragraph separators must not appear literally in source.
const GO_ESCAPED = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

function str(s: string): string {
  return JSON.stringify(s).replace(GO_ESCAPED, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
