// Minimal SWF container reader: decompresses CWS/FWS, walks the tag list, and exposes
// the pieces the asset pipeline needs (sprites, frame labels, symbol names, frame counts).

import { constants, inflateRawSync } from 'node:zlib';

export interface Tag {
  code: number;
  data: Uint8Array;
}

export interface SwfFile {
  version: number;
  frameRate: number;
  frameCount: number;
  width: number;
  height: number;
  xMin: number;
  yMin: number;
  tags: Tag[];
}

export function parse(raw: Uint8Array): SwfFile {
  if (raw.length < 8) throw new Error('too short');
  const sig = ascii(raw.subarray(0, 3));
  const version = raw[3];
  let body = raw.subarray(8);
  switch (sig) {
    case 'FWS':
      break;
    case 'CWS':
      try {
        body = inflate(body);
      } catch (e) {
        throw new Error(`zlib: ${(e as Error).message}`);
      }
      break;
    case 'ZWS':
      throw new Error('LZMA (ZWS) not supported');
    default:
      throw new Error(`bad signature ${JSON.stringify(sig)}`);
  }
  const br = new BitReader(body);
  const nbits = br.readUBits(5);
  const xmin = br.readSBits(nbits);
  const xmax = br.readSBits(nbits);
  const ymin = br.readSBits(nbits);
  const ymax = br.readSBits(nbits);
  br.align();
  let pos = br.pos;
  if (body.length < pos + 4) throw new Error('truncated header');
  const frameRate = u16(body, pos) / 256;
  const frameCount = u16(body, pos + 2);
  pos += 4;
  const { tags, err } = readTags(body.subarray(pos));
  if (err) throw err;
  return {
    version,
    frameRate,
    frameCount,
    width: (xmax - xmin) / 20,
    height: (ymax - ymin) / 20,
    xMin: xmin / 20,
    yMin: ymin / 20,
    tags,
  };
}

export function tagsOf(b: Uint8Array): Tag[] {
  return readTags(b).tags;
}

export function readTags(b: Uint8Array): { tags: Tag[]; err?: Error } {
  const tags: Tag[] = [];
  let pos = 0;
  while (pos + 2 <= b.length) {
    const hdr = u16(b, pos);
    pos += 2;
    const code = hdr >> 6;
    let length = hdr & 0x3f;
    if (length === 0x3f) {
      if (pos + 4 > b.length) return { tags, err: new Error('truncated long tag header') };
      length = u32(b, pos);
      pos += 4;
    }
    if (pos + length > b.length) {
      return { tags, err: new Error(`tag ${code} overruns (${pos + length} > ${b.length})`) };
    }
    tags.push({ code, data: b.subarray(pos, pos + length) });
    pos += length;
    if (code === 0) break;
  }
  return { tags };
}

// Like Go's zlib reader + io.ReadAll: checks the header, then keeps whatever inflates even when
// the stream is truncated or the trailing Adler-32 is wrong.
export function inflate(b: Uint8Array): Uint8Array {
  if (b.length < 2 || (b[0] & 0x0f) !== 8 || ((b[0] << 8) | b[1]) % 31 !== 0) {
    throw new Error('zlib: invalid header');
  }
  if (b[1] & 0x20) throw new Error('zlib: invalid dictionary');
  const out = inflateRawSync(b.subarray(2), { finishFlush: constants.Z_SYNC_FLUSH });
  return new Uint8Array(out.buffer, out.byteOffset, out.length);
}

export class BitReader {
  pos = 0;
  bit = 0;

  constructor(readonly b: Uint8Array) {}

  readUBits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.pos >= this.b.length) return v;
      const bit = (this.b[this.pos] >> (7 - this.bit)) & 1;
      v = v * 2 + bit;
      this.bit++;
      if (this.bit === 8) {
        this.bit = 0;
        this.pos++;
      }
    }
    return v;
  }

  readSBits(n: number): number {
    const v = this.readUBits(n);
    return n > 0 && v >= 2 ** (n - 1) ? v - 2 ** n : v;
  }

  align(): void {
    if (this.bit !== 0) {
      this.bit = 0;
      this.pos++;
    }
  }
}

// Out-of-range bytes read as 0 (Go would panic there; real files never hit it).
export function u16(b: Uint8Array, p: number): number {
  return ((b[p] ?? 0) | ((b[p + 1] ?? 0) << 8)) >>> 0;
}

export function u32(b: Uint8Array, p: number): number {
  return (u16(b, p) + u16(b, p + 2) * 0x10000) >>> 0;
}

const utf8 = new TextDecoder('utf-8');

export function cstring(b: Uint8Array): [string, number] {
  const i = b.indexOf(0);
  if (i < 0) return [utf8.decode(b), b.length];
  return [utf8.decode(b.subarray(0, i)), i + 1];
}

export function ascii(b: Uint8Array): string {
  return String.fromCharCode(...b);
}
