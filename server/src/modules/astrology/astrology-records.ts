// Server-wide "Kỷ Lục" feed of the astrology panel (award_record): the completions of the current cycle, oldest first (the client prepends each row), capped at RECORD_LENGTH.
// In memory only (single process, like Go): a restart empties it, a new cycle starts a new list.

import { ASTRO, type AstrologicRecord } from '@mc/shared';

export class AstrologyRecords {
  private cycle = '';
  private entries: AstrologicRecord[] = [];

  add(cycle: string, fid: number, cid: number, name: string): void {
    if (this.cycle !== cycle) {
      this.cycle = cycle;
      this.entries = [];
    }
    this.entries = [...this.entries, { aid: String(fid), cid, name }].slice(-ASTRO.RECORD_LENGTH);
  }

  list(cycle: string): AstrologicRecord[] {
    return this.cycle === cycle ? [...this.entries] : [];
  }
}
