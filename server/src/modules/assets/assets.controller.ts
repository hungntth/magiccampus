// Serves the md5-named asset blobs of the old resource CDN.
//   GET /res/<md5>            -> raw file (content-type sniffed from magic bytes)
//   GET /res/path?p=<logical> -> same, but hashes the logical path server-side (debug helper)

import { Controller, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hashPath } from '@mc/shared';
import { APP_CONFIG, type AppConfig } from '../../config/config';

const HASH_RE = /^[a-f0-9]{32}$/;

@Controller('res')
export class AssetsController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('path')
  byPath(@Query('p') logical: string, @Res() res: Response): void {
    if (!logical) throw new NotFoundException();
    this.stream(hashPath(logical), res);
  }

  @Get(':hash')
  byHash(@Param('hash') hash: string, @Res() res: Response): void {
    this.stream(hash.toLowerCase(), res);
  }

  private stream(hash: string, res: Response): void {
    if (!HASH_RE.test(hash)) throw new NotFoundException();
    const file = path.join(this.config.assetDir, hash);
    let fd: number;
    try {
      fd = fs.openSync(file, 'r');
    } catch {
      throw new NotFoundException();
    }
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    res.setHeader('Content-Type', sniff(head));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(file).pipe(res);
  }
}

function sniff(head: Buffer): string {
  const s = head.toString('latin1', 0, 3);
  if (s === 'CWS' || s === 'FWS' || s === 'ZWS') return 'application/x-shockwave-flash';
  if (head[0] === 0x89 && s.slice(1) === 'PN') return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (s === 'GIF') return 'image/gif';
  if (s === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return 'application/octet-stream';
}
