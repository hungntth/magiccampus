// Small PNG encoder (8-bit RGBA or grayscale) with per-row adaptive filtering, so atlases and
// hit-mask previews need no native image library.

import { crc32, deflateSync } from 'node:zlib';
import type { Image } from './swf/images.js';

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

// level: zlib level. Node's level 1-3 output is much larger on big atlases (+50% vs Go's
// BestSpeed); 6 is ~10% smaller than the old Go output at about the same speed.
export function encodeRGBA(img: Image, level = 6): Buffer {
  return encode(img.width, img.height, 6, 4, img.pix, level);
}

export function encodeGray(width: number, height: number, pix: Uint8Array, level = 6): Buffer {
  return encode(width, height, 0, 1, pix, level);
}

function encode(w: number, h: number, colorType: number, bpp: number, pix: Uint8Array, level: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const stride = w * bpp;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = Array.from({ length: 5 }, () => new Uint8Array(stride));
  const zero = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = pix.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pix.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let v = cur[i];
        if (f === 1) v -= a;
        else if (f === 2) v -= b;
        else if (f === 3) v -= (a + b) >> 1;
        else if (f === 4) v -= paeth(a, b, c);
        v &= 0xff;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const o = y * (stride + 1);
    raw[o] = best;
    raw.set(cand[best], o + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(data, crc32(head.subarray(4))) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
