// Small helpers shared by the item-use handlers: the note push and the trimmed name of the opened template.

import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';

export const note = (message: string): Push => push('onSystemMidMsgOrNote', message);

/** Trimmed template name (messages never carry the template's trailing spaces). */
export const nameOf = (ctx: ItemConsumeCtx): string => String(ctx.tpl.name ?? '').trim();
