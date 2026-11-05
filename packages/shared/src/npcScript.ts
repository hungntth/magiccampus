// M10 phase A: scripted NPC menus (legacy onList / npcScript, Flash NpcScriptPanel) and per-viewer instance NPCs
// (onNpcOn / onNpcOff: dungeon chests, floor spawns, maze doors). Note pushes: onNpcMsg(npcId, text), onMidNote(text),
// onSystemSay(text).

import type { SceneNpc } from './protocol.js';

/** One menu entry; picking it sends npcScript(func). `func` ids are the Go handler ids, kept verbatim. */
export interface NpcMenuOption {
  label: string;
  func: string;
}

/** onList(npcId, title, info, options). */
export type OnListArgs = [npcId: number, title: string, info: string, options: NpcMenuOption[]];

/** A per-viewer NPC: `id` is the instance id (1623001, 9014101, 900001, …), `nid` the data_tbl_npc template id. */
export interface InstanceNpc extends SceneNpc {
  nid: number;
  map: number;
}

/** Longest accepted npcScript func id. */
export const NPC_SCRIPT_FUNC_MAX = 64;

/** Menu entry that only closes the dialog (legacy H5 convention; the server ignores it). */
export const NPC_SCRIPT_CLOSE = 'close_dialog';
