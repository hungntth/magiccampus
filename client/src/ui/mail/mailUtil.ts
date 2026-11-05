// Small helpers of the mail windows: DOM builders, number format and the whitelist HTML sanitizer for mail text
// (legacy safeMailHtml: the Flash text field only understands a few tags; player text arrives HTML-escaped from the server).

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const fmt = (n: number): string => n.toLocaleString('vi-VN');

const ALLOWED = new Set(['B', 'I', 'U', 'STRONG', 'EM', 'BR', 'P', 'SPAN', 'FONT']);
const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

/** Copies `html` into `target`, keeping only <b> <i> <u> <br> <p> <span> and <font color>; everything else becomes text. */
export function setSafeHtml(target: HTMLElement, html: string): void {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  target.replaceChildren(...copy(doc.body));
}

function copy(parent: Node): Node[] {
  const out: Node[] = [];
  for (const n of Array.from(parent.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) {
      out.push(document.createTextNode(n.textContent ?? ''));
    } else if (n instanceof Element) {
      if (!ALLOWED.has(n.tagName)) {
        out.push(...copy(n)); // unknown tag: keep its text, drop the tag (scripts / styles carry no text we want)
        continue;
      }
      const e = document.createElement(n.tagName.toLowerCase());
      const color = n.getAttribute('color');
      if (n.tagName === 'FONT' && color && COLOR_RE.test(color)) e.setAttribute('color', color);
      e.append(...copy(n));
      out.push(e);
    }
  }
  return out;
}
