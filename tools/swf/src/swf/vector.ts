// Full DefineShape/2/3/4 parser: styles plus shape records turned into per-style edge lists.
// Fill edges are oriented so the filled side is consistent (fill1 edges as-is, fill0 edges reversed),
// which lets the rasterizer fill them directly with a winding rule without joining contours.

import { readRect, type Rect } from './matrix.js';
import { BitReader, u16, type Tag as SwfTag } from './reader.js';
import { readFillStyles, readLineStyles, type FillStyle, type LineStyle } from './styles.js';
import { Tag } from './tags.js';

/** One edge in shape pixels; `curve` edges are quadratic Béziers with control point (cx, cy). */
export interface Edge {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  curve: boolean;
}

/** Styles introduced together (initial arrays or a StateNewStyles record); later groups draw on top. */
export interface StyleGroup {
  fills: FillStyle[];
  lines: LineStyle[];
  fillEdges: Edge[][];
  lineEdges: Edge[][];
}

export interface VectorShape {
  id: number;
  bounds: Rect;
  groups: StyleGroup[];
  /** DefineShape4 UsesFillWindingRule; even-odd otherwise. */
  nonzero: boolean;
}

function newGroup(fills: FillStyle[], lines: LineStyle[]): StyleGroup {
  return {
    fills,
    lines,
    fillEdges: fills.map(() => []),
    lineEdges: lines.map(() => []),
  };
}

export function parseVectorShape(t: SwfTag): VectorShape {
  if (t.data.length < 2) throw new Error('short shape');
  const code = t.code;
  const r = new BitReader(t.data.subarray(2));
  const bounds = readRect(r);
  let nonzero = false;
  if (code === Tag.DefineShape4) {
    readRect(r);
    r.align();
    nonzero = ((r.b[r.pos] ?? 0) & 0x04) !== 0;
    r.pos++;
  }
  let group = newGroup(readFillStyles(r, code), readLineStyles(r, code));
  const shape: VectorShape = { id: u16(t.data, 0), bounds, groups: [group], nonzero };
  r.align();
  let fillBits = r.readUBits(4);
  let lineBits = r.readUBits(4);
  let x = 0;
  let y = 0;
  let fill0 = 0;
  let fill1 = 0;
  let line = 0;

  const add = (e: Edge): void => {
    if (fill1 > 0) group.fillEdges[fill1 - 1]?.push(e);
    if (fill0 > 0) {
      group.fillEdges[fill0 - 1]?.push({ x0: e.x1, y0: e.y1, cx: e.cx, cy: e.cy, x1: e.x0, y1: e.y0, curve: e.curve });
    }
    if (line > 0) group.lineEdges[line - 1]?.push(e);
  };

  for (;;) {
    if (r.pos >= r.b.length) break;
    if (r.readUBits(1) === 0) {
      const flags = r.readUBits(5);
      if (flags === 0) break;
      if (flags & 0x01) {
        const n = r.readUBits(5);
        x = r.readSBits(n) / 20;
        y = r.readSBits(n) / 20;
      }
      if (flags & 0x02) fill0 = r.readUBits(fillBits);
      if (flags & 0x04) fill1 = r.readUBits(fillBits);
      if (flags & 0x08) line = r.readUBits(lineBits);
      if (flags & 0x10 && code !== Tag.DefineShape) {
        group = newGroup(readFillStyles(r, code), readLineStyles(r, code));
        shape.groups.push(group);
        r.align();
        fillBits = r.readUBits(4);
        lineBits = r.readUBits(4);
      }
      continue;
    }
    const straight = r.readUBits(1) === 1;
    const n = r.readUBits(4) + 2;
    if (straight) {
      let dx = 0;
      let dy = 0;
      if (r.readUBits(1) === 1) {
        dx = r.readSBits(n);
        dy = r.readSBits(n);
      } else if (r.readUBits(1) === 1) {
        dy = r.readSBits(n);
      } else {
        dx = r.readSBits(n);
      }
      const nx = x + dx / 20;
      const ny = y + dy / 20;
      add({ x0: x, y0: y, cx: (x + nx) / 2, cy: (y + ny) / 2, x1: nx, y1: ny, curve: false });
      x = nx;
      y = ny;
    } else {
      const cx = x + r.readSBits(n) / 20;
      const cy = y + r.readSBits(n) / 20;
      const nx = cx + r.readSBits(n) / 20;
      const ny = cy + r.readSBits(n) / 20;
      add({ x0: x, y0: y, cx, cy, x1: nx, y1: ny, curve: true });
      x = nx;
      y = ny;
    }
  }
  return shape;
}
