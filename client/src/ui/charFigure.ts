// Element figure of the "Nhân vật" window (legacy CharactorPanel_element over TOTEM_CHARACTER): rim + fill + MAX layers
// recoloured per element with the Flash ColorMatrix filters (SVG feColorMatrix), the fill rising with the strength en.
// Assets come from `tools/swf` swfelement (client/public/ui/CharactorPanel); never hand-edit them.

import { CHAR_ELEMENT_NAMES, charElementStrength, type CharElementState } from '@mc/shared';

const DIR = '/ui/CharactorPanel';

interface LayerFrame { alpha: number; matrix: number[] | null }
interface ElementMeta {
  maskTop: number[];
  frames: { base: LayerFrame | null; fill: LayerFrame | null; max: LayerFrame | null }[];
}

let meta: Promise<ElementMeta | null> | null = null;
const loadMeta = (): Promise<ElementMeta | null> =>
  (meta ??= fetch(`${DIR}/element.json`).then((r) => (r.ok ? (r.json() as Promise<ElementMeta>) : null)).catch(() => null));

const SVG_NS = 'http://www.w3.org/2000/svg';
let defs: SVGDefsElement | null = null;

/** Registers (once) an SVG filter for a Flash ColorMatrix (offsets in 0..255) and returns its CSS reference. */
function filterOf(matrix: number[] | null): string {
  if (!matrix) return 'none';
  const id = `cf-${matrix.map((v) => Math.round(v * 1000)).join('_').replace(/-/g, 'm')}`;
  if (!defs) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  if (!defs.querySelector(`#${id}`)) {
    const f = document.createElementNS(SVG_NS, 'filter');
    f.id = id;
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const cm = document.createElementNS(SVG_NS, 'feColorMatrix');
    cm.setAttribute('type', 'matrix');
    cm.setAttribute('values', matrix.map((v, i) => (i % 5 === 4 ? v / 255 : v)).join(' '));
    f.appendChild(cm);
    defs.appendChild(f);
  }
  return `url(#${id})`;
}

export class CharFigure {
  readonly el: HTMLElement;
  private readonly base: HTMLImageElement;
  private readonly fill: HTMLImageElement;
  private readonly max: HTMLImageElement;
  private state: CharElementState | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'char-figure';
    const totem = img('totem', 'char-totem');
    const body = document.createElement('div');
    body.className = 'char-figure-body';
    this.base = img('rim', 'char-fig-layer');
    this.fill = img('silhouette', 'char-fig-layer');
    this.max = img('silhouette', 'char-fig-layer char-fig-max');
    body.append(this.base, this.fill, this.max);
    this.el.append(totem, body);
  }

  set(s: CharElementState): void {
    const prev = this.state;
    if (prev && prev.ee === s.ee && prev.en === s.en && prev.ef === s.ef) return;
    this.state = s;
    this.el.title = `Thuộc tính: ${CHAR_ELEMENT_NAMES[s.ee] ?? CHAR_ELEMENT_NAMES[0]}\nĐộ mạnh: ${charElementStrength(s)}`;
    void loadMeta().then((m) => {
      if (m && this.state === s) this.apply(m, s);
    });
  }

  private apply(m: ElementMeta, s: CharElementState): void {
    const fr = m.frames[s.ee] ?? m.frames[0];
    const show = (node: HTMLImageElement, l: LayerFrame | null, visible = true): void => {
      node.style.display = l && visible && l.alpha > 0 ? '' : 'none';
      node.style.opacity = l ? String(l.alpha) : '0';
      node.style.filter = l ? filterOf(l.matrix) : 'none';
    };
    if (s.ee === 0) {
      // Legacy frame 0 hides every layer; keep a dim neutral silhouette so the totem is not empty.
      show(this.base, null);
      show(this.max, null);
      this.fill.style.display = '';
      this.fill.style.opacity = '0.45';
      this.fill.style.filter = 'none';
      this.fill.style.clipPath = 'none';
      return;
    }
    show(this.base, fr.base);
    show(this.fill, fr.fill);
    show(this.max, fr.max, s.ef);
    this.fill.style.clipPath = `inset(${Math.max(0, m.maskTop[Math.min(s.en, m.maskTop.length - 1)] ?? 0)}px 0 0 0)`;
  }
}

function img(name: string, cls: string): HTMLImageElement {
  const e = document.createElement('img');
  e.className = cls;
  e.src = `${DIR}/${name}.png`;
  e.alt = '';
  e.draggable = false;
  return e;
}
