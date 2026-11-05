// help.xml -> help.json converter core (M9 phase G, legacy HelpPanel content `profile/help.xml`). Pure: parses the nested
// <node id label data> tree and reduces the Flash htmlText in `data` to safe HTML (<b> <i> <u> <br> and colour spans).
// Unknown tags (TEXTFORMAT, IMG, A, ...) are dropped and their text kept.

export interface HelpNode {
  id: string;
  label: string;
  /** Nesting depth (0 = top level). */
  depth: number;
  html: string;
}

const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', quot: '"', amp: '&', apos: "'", nbsp: ' ' };

export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Flash htmlText -> safe HTML. Paragraphs become <br>, FONT COLOR becomes a span; everything else is text. */
export function flashHtmlToSafe(flash: string): string {
  const out: string[] = [];
  const fontStack: boolean[] = [];
  const re = /<(\/?)([a-z]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flash)) !== null) {
    if (m[4] !== undefined) {
      out.push(escapeText(unescapeXml(m[4])));
      continue;
    }
    const close = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'b' || tag === 'i' || tag === 'u') out.push(close ? `</${tag}>` : `<${tag}>`);
    else if (tag === 'br' || (tag === 'p' && close)) out.push('<br>');
    else if (tag === 'font') {
      if (close) {
        if (fontStack.pop()) out.push('</span>');
      } else {
        const color = /color\s*=\s*"(#[0-9a-f]{6})"/i.exec(m[3])?.[1];
        fontStack.push(color !== undefined);
        if (color) out.push(`<span style="color:${color.toLowerCase()}">`);
      }
    }
  }
  while (fontStack.length > 0) if (fontStack.pop()) out.push('</span>');
  return out.join('').replace(/(<br>){3,}/g, '<br><br>').replace(/^(<br>)+|(<br>)+$/g, '');
}

const attr = (tag: string, name: string): string => unescapeXml(new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? '');

/** All <node> elements in document order with their depth. */
export function parseHelpXml(xml: string): HelpNode[] {
  const out: HelpNode[] = [];
  let depth = 0;
  const re = /<node\b((?:[^>"]|"[^"]*")*?)(\/?)>|<\/node>/g; // attribute values may hold a raw ">"
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0] === '</node>') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const tag = m[1];
    out.push({ id: attr(tag, 'id'), label: attr(tag, 'label'), depth, html: flashHtmlToSafe(attr(tag, 'data')) });
    if (m[2] !== '/') depth++;
  }
  return out;
}
