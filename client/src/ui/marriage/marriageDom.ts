// Small DOM / label helpers of the marriage UI (element factory, class names of the seek board rows).

import { CLASS_NAMES } from '@mc/shared';

export const el = <K extends 'div' | 'button' | 'span' | 'input' | 'textarea'>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const classLabel = (classId: number): string => CLASS_NAMES[classId] ?? 'Nhân vật';
