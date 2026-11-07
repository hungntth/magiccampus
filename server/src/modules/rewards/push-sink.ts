// The slice of a Session that reward granting needs: the character id and `callback`. A real Session satisfies it, and so does
// PushCollector (item-use), which records the pushes in order so item-use hooks can return them to UseItemService.

export interface PushSink {
  readonly characterId: number | null;
  callback(method: string, ...args: unknown[]): void;
}
