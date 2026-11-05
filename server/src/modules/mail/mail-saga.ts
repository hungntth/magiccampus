// Undo stack of the mail sagas (send / take): each completed step registers its compensation; rollback() runs them newest first
// and keeps going when one fails (the failure is reported through `onError`, never thrown), so a refund is attempted even when
// the escrow restore failed. Pure over async closures, unit-tested with fake steps.

export class UndoStack {
  private readonly steps: { label: string; undo: () => Promise<void> }[] = [];

  get size(): number {
    return this.steps.length;
  }

  push(label: string, undo: () => Promise<void>): void {
    this.steps.push({ label, undo });
  }

  /** Runs every registered compensation in reverse order and empties the stack; returns the labels that failed. */
  async rollback(onError: (label: string, e: unknown) => void = () => undefined): Promise<string[]> {
    const failed: string[] = [];
    for (const s of this.steps.reverse()) {
      try {
        await s.undo();
      } catch (e) {
        failed.push(s.label);
        onError(s.label, e);
      }
    }
    this.steps.length = 0;
    return failed;
  }
}
