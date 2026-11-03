// Decodes SWF bitmap tags (DefineBits/JPEG2/JPEG3/JPEG4, Lossless/Lossless2) into RGBA images.

import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { inflate, u16, u32, type Tag as SwfTag } from './reader.js';
import { Tag } from './tags.js';

// Non-premultiplied RGBA, row-major, 4 bytes per pixel.
export interface Image {
  width: number;
  height: number;
  pix: Uint8Array;
}

export function newImage(width: number, height: number): Image {
  return { width, height, pix: new Uint8Array(width * height * 4) };
}

// jpegTables is the file's JPEGTables tag payload, prepended to DefineBits data.
export function decodeBitmap(t: SwfTag, jpegTables: Uint8Array = new Uint8Array()): Image {
  if (t.data.length < 2) throw new Error('short bitmap tag');
  let body = t.data.subarray(2);
  switch (t.code) {
    case Tag.DefineBits: {
      const joined = new Uint8Array(jpegTables.length + body.length);
      joined.set(jpegTables);
      joined.set(body, jpegTables.length);
      return decodeJPEG(joined);
    }
    case Tag.DefineBitsJPEG2:
      return decodeJPEG(body);
    case Tag.DefineBitsJPEG3:
    case Tag.DefineBitsJPEG4: {
      if (body.length < 4) throw new Error('short jpeg3');
      const alphaOff = u32(body, 0);
      body = body.subarray(t.code === Tag.DefineBitsJPEG4 ? 6 : 4);
      if (alphaOff > body.length) throw new Error('bad alpha offset');
      const img = decodeJPEG(body.subarray(0, alphaOff));
      if (alphaOff < body.length) {
        let alpha: Uint8Array | null = null;
        try {
          alpha = inflate(body.subarray(alphaOff));
        } catch {
          // keep the opaque image, as Flash does
        }
        if (alpha && alpha.length >= img.width * img.height) applyAlpha(img, alpha);
      }
      return img;
    }
    case Tag.DefineBitsLossless:
    case Tag.DefineBitsLossless2:
      return decodeLossless(body, t.code === Tag.DefineBitsLossless2);
  }
  throw new Error(`not a bitmap tag: ${t.code}`);
}

function decodeJPEG(data: Uint8Array): Image {
  data = stripBogusHeader(data);
  try {
    if (data.length > 8 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return decodePNG(data);
    const d = jpeg.decode(data, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true });
    return { width: d.width, height: d.height, pix: d.data };
  } catch (e) {
    throw new Error(`jpeg: ${(e as Error).message}`);
  }
}

// PNG inside a JPEG2 tag is drawn opaque: colour premultiplied by its alpha, alpha forced to 255.
function decodePNG(data: Uint8Array): Image {
  const png = PNG.sync.read(Buffer.from(data.buffer, data.byteOffset, data.length));
  const pix = new Uint8Array(png.data);
  for (let i = 0; i < pix.length; i += 4) {
    const a16 = pix[i + 3] * 0x101;
    for (let c = 0; c < 3; c++) pix[i + c] = Math.floor((pix[i + c] * 0x101 * a16) / 0xffff) >> 8;
    pix[i + 3] = 255;
  }
  return { width: png.width, height: png.height, pix };
}

function stripBogusHeader(d: Uint8Array): Uint8Array {
  while (d.length >= 4 && d[0] === 0xff && d[1] === 0xd9 && d[2] === 0xff && d[3] === 0xd8) d = d.subarray(4);
  if (d.length >= 6 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff && d[3] === 0xd9 && d[4] === 0xff && d[5] === 0xd8) {
    d = d.subarray(4);
  }
  return d;
}

function applyAlpha(img: Image, alpha: Uint8Array): void {
  const n = img.width * img.height;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = alpha[p];
    if (a === 0) img.pix[i] = img.pix[i + 1] = img.pix[i + 2] = 0;
    img.pix[i + 3] = a;
  }
}

function decodeLossless(body: Uint8Array, v2: boolean): Image {
  if (body.length < 5) throw new Error('short lossless');
  const format = body[0];
  const w = u16(body, 1);
  const h = u16(body, 3);
  let pos = 5;
  let tableSize = 0;
  if (format === 3) {
    tableSize = body[5] + 1;
    pos = 6;
  }
  const data = inflate(body.subarray(pos));
  const img = newImage(w, h);
  const px = img.pix;
  switch (format) {
    case 3: {
      const entry = v2 ? 4 : 3;
      const pix = tableSize * entry;
      const stride = (w + 3) & ~3;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = data[pix + y * stride + x];
          if (idx === undefined || idx >= tableSize) continue;
          const c = idx * entry;
          const i = (y * w + x) * 4;
          px[i] = data[c];
          px[i + 1] = data[c + 1];
          px[i + 2] = data[c + 2];
          px[i + 3] = v2 ? data[c + 3] : 255;
        }
      }
      break;
    }
    case 5:
      for (let p = 0; p < w * h; p++) {
        const s = p * 4;
        const a = v2 ? data[s] : 255;
        let r = data[s + 1];
        let g = data[s + 2];
        let b = data[s + 3];
        // Lossless2 stores premultiplied colour; uint8 wrap kept as in the Go port.
        if (v2 && a !== 0 && a !== 255) {
          r = Math.floor((r * 255) / a) & 0xff;
          g = Math.floor((g * 255) / a) & 0xff;
          b = Math.floor((b * 255) / a) & 0xff;
        }
        px[s] = r;
        px[s + 1] = g;
        px[s + 2] = b;
        px[s + 3] = a;
      }
      break;
    case 4: {
      const stride = (w * 2 + 3) & ~3;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = y * stride + x * 2;
          const v = (data[o] << 8) | data[o + 1];
          const i = (y * w + x) * 4;
          px[i] = ((v >> 10) & 0x1f) << 3;
          px[i + 1] = ((v >> 5) & 0x1f) << 3;
          px[i + 2] = (v & 0x1f) << 3;
          px[i + 3] = 255;
        }
      }
      break;
    }
    default:
      throw new Error(`lossless format ${format} unsupported`);
  }
  return img;
}
