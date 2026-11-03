// Minimal ABC (DoABC bytecode) reader: extracts the numeric properties a resource class assigns in
// its constructor. Creature/equipment SWFs carry a `GameResInst` class whose constructor sets the
// anchor metrics the Flash client positions sprites with (midX, footY, bodyY, headY, ...).

import type { Tag as SwfTag } from './reader.js';
import { Tag } from './tags.js';

// Constructor assignments `name = <number>` per class name, in assignment order.
export function classConstants(t: SwfTag): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  if (t.code !== Tag.DoABC && t.code !== Tag.DoABCDefine) return out;
  const b = t.data;
  let p = 0;
  if (t.code === Tag.DoABC) {
    p = 4;
    while (p < b.length && b[p] !== 0) p++;
    p++;
  }
  p += 4; // minor/major version

  const u8 = () => b[p++];
  const u30 = () => {
    let v = 0;
    for (let s = 0; ; s += 7) {
      const c = b[p++] ?? 0;
      if (s < 32) v |= (c & 0x7f) << s;
      if (!(c & 0x80) || p >= b.length) break;
    }
    return v >>> 0;
  };
  const skipU30s = (n: number) => {
    for (let i = 0; i < n; i++) u30();
  };

  const ints = [0];
  for (let i = 1, n = u30(); i < n; i++) ints.push(u30() | 0);
  const uints = [0];
  for (let i = 1, n = u30(); i < n; i++) uints.push(u30());
  const doubles = [NaN];
  for (let i = 1, n = u30(); i < n; i++, p += 8) {
    doubles.push(new DataView(b.buffer, b.byteOffset + p, 8).getFloat64(0, true));
  }
  const strings = [''];
  for (let i = 1, n = u30(); i < n; i++) {
    const len = u30();
    strings.push(Buffer.from(b.subarray(p, p + len)).toString('utf8'));
    p += len;
  }
  for (let i = 1, n = u30(); i < n; i++) {
    u8();
    u30();
  }
  for (let i = 1, n = u30(); i < n; i++) skipU30s(u30());
  const names = [''];
  for (let i = 1, n = u30(); i < n; i++) {
    const kind = u8();
    if (kind === 0x07 || kind === 0x0d) {
      u30();
      names.push(strings[u30()]);
    } else if (kind === 0x0f || kind === 0x10) {
      names.push(strings[u30()]);
    } else if (kind === 0x11 || kind === 0x12) {
      names.push('');
    } else if (kind === 0x09 || kind === 0x0e) {
      names.push(strings[u30()]);
      u30();
    } else if (kind === 0x1b || kind === 0x1c) {
      u30();
      names.push('');
    } else if (kind === 0x1d) {
      u30();
      skipU30s(u30());
      names.push('');
    } else {
      return out; // unknown multiname kind: give up on this tag
    }
  }

  const methodCount = u30();
  for (let i = 0; i < methodCount; i++) {
    const params = u30();
    u30();
    skipU30s(params);
    u30();
    const flags = u8();
    if (flags & 0x08) {
      for (let j = 0, n = u30(); j < n; j++) {
        u30();
        u8();
      }
    }
    if (flags & 0x80) skipU30s(params);
  }
  for (let i = 0, n = u30(); i < n; i++) {
    u30();
    skipU30s(u30() * 2);
  }
  const skipTraits = () => {
    for (let j = 0, n = u30(); j < n; j++) {
      u30();
      const kind = u8();
      const k = kind & 0x0f;
      if (k === 0 || k === 6) {
        u30();
        u30();
        if (u30()) u8();
      } else {
        u30();
        u30();
      }
      if (kind & 0x40) skipU30s(u30());
    }
  };
  const classCount = u30();
  const ctorOf = new Map<number, string>();
  for (let i = 0; i < classCount; i++) {
    const name = names[u30()];
    u30();
    const flags = u8();
    if (flags & 0x08) u30();
    skipU30s(u30());
    ctorOf.set(u30(), name);
    skipTraits();
  }
  for (let i = 0; i < classCount; i++) {
    u30();
    skipTraits();
  }
  for (let i = 0, n = u30(); i < n; i++) {
    u30();
    skipTraits();
  }

  for (let i = 0, n = u30(); i < n && p < b.length; i++) {
    const method = u30();
    skipU30s(4);
    const len = u30();
    const code = b.subarray(p, p + len);
    p += len;
    for (let j = 0, ec = u30(); j < ec; j++) skipU30s(5);
    skipTraits();
    const cls = ctorOf.get(method);
    if (cls === undefined) continue;
    const props = constructorAssignments(code, names, ints, uints, doubles);
    if (Object.keys(props).length) out.set(cls, props);
  }
  return out;
}

// Linear scan of `push<number>; initproperty|setproperty <name>` pairs. Stops at the first opcode
// it does not know the operand size of — resource constructors only use the ones below.
function constructorAssignments(
  code: Uint8Array,
  names: string[],
  ints: number[],
  uints: number[],
  doubles: number[],
): Record<string, number> {
  const props: Record<string, number> = {};
  let q = 0;
  let pending: number | null = null;
  const u30 = () => {
    let v = 0;
    for (let s = 0; ; s += 7) {
      const c = code[q++] ?? 0;
      if (s < 32) v |= (c & 0x7f) << s;
      if (!(c & 0x80) || q >= code.length) break;
    }
    return v >>> 0;
  };
  while (q < code.length) {
    const op = code[q++];
    let value: number | null = null;
    switch (op) {
      case 0x24: // pushbyte
        value = (code[q++] << 24) >> 24;
        break;
      case 0x25: // pushshort
        value = (u30() << 2) >> 2;
        break;
      case 0x2d: // pushint
        value = ints[u30()];
        break;
      case 0x2e: // pushuint
        value = uints[u30()];
        break;
      case 0x2f: // pushdouble
        value = doubles[u30()];
        break;
      case 0x61: // setproperty
      case 0x68: {
        // initproperty
        const name = names[u30()];
        if (pending !== null && name) props[name] = pending;
        break;
      }
      case 0x2c: // pushstring
      case 0x49: // constructsuper
      case 0x5d: // findpropstrict
      case 0x5e: // findproperty
      case 0x60: // getlex
      case 0x62: // getlocal
      case 0x63: // setlocal
      case 0x66: // getproperty
        u30();
        break;
      case 0x46: // callproperty
      case 0x4a: // constructprop
      case 0x4f: // callpropvoid
        u30();
        u30();
        break;
      case 0x02: // nop
      case 0x1d: // popscope
      case 0x20: // pushnull
      case 0x21: // pushundefined
      case 0x26: // pushtrue
      case 0x27: // pushfalse
      case 0x29: // pop
      case 0x2a: // dup
      case 0x30: // pushscope
      case 0x47: // returnvoid
      case 0x48: // returnvalue
      case 0xd0:
      case 0xd1:
      case 0xd2:
      case 0xd3: // getlocal0..3
        break;
      default:
        return props;
    }
    pending = value;
  }
  return props;
}

// Anchor metrics of a resource SWF (GameResInst constructor), or undefined when absent.
export function resourceMetrics(tags: SwfTag[]): Record<string, number> | undefined {
  for (const t of tags) {
    if (t.code !== Tag.DoABC && t.code !== Tag.DoABCDefine) continue;
    let consts: Map<string, Record<string, number>>;
    try {
      consts = classConstants(t);
    } catch {
      continue;
    }
    const inst = consts.get('GameResInst');
    if (inst && 'footY' in inst) return inst;
  }
  return undefined;
}
