// Guarding fairy active skills in battle (M13 G2), engine part: port of Go domain/combat/fairy_skill.go. turnStartFairyActions runs at
// the start of every actor's turn before its statuses tick: a Pháp Lực Nhiên Thiêu holder loses its MP share (idle step, sSObj.uMp),
// then a fairy owner casts the rotation slot of this round on itself (buff via the table-buff pipeline, idle step with sSObj.buffAdd,
// the same shape NPC buffs use). fairyProcSteps rolls the on-attack procs on the owner's first landed hit of a round.

import { BattleBehavior, type BattleStateObj, type BattleStep } from '@mc/shared';
import type { Fighter } from '../battle.types';
import type { StrikeCtx } from '../strike';
import { addStatus, applyBuff, rollLand } from './battle-buffs';
import { fairySkillForRound, rageMods } from './fairy-battle-rules';
import type { BuffDef } from './npc-skills';

const idle = (f: Fighter, sSObj: BattleStateObj): BattleStep => ({ sid: f.slot, tid: -1, bid: BattleBehavior.STAND, delay: 0, sSObj });
const buffAdd = (def: BuffDef): BattleStateObj => ({ buffAdd: { id: def.id, round: Math.max(1, def.rounds) + 1, icon: def.icon } });

/** Lands def on t from a (status layer or table buff, stat-less rows as icon markers); null when refused (immune). */
function land(a: Fighter, t: Fighter, def: BuffDef, round: number): BattleStateObj | null {
  if (def.status !== undefined) {
    const ok = addStatus(t, { type: def.status, duration: Math.max(1, def.rounds), buffId: def.id, appliedRound: round, sourceSlot: a.slot }, a.side);
    return ok ? buffAdd(def) : null;
  }
  applyBuff(a, t, def, round);
  return buffAdd(def);
}

/** Go fairyMPBurnAction: the largest burn among buffs that landed before this round. */
function mpBurn(ctx: StrikeCtx, f: Fighter, round: number): void {
  let pct = 0;
  for (const b of f.buffs ?? []) if (b.mpBurn && b.appliedRound < round) pct = Math.max(pct, b.mpBurn);
  const loss = Math.trunc((f.mp * pct) / 100);
  if (loss <= 0) return;
  f.mp -= loss;
  ctx.groups.push([idle(f, { uMp: f.mp })]);
}

/** Go fairyCastAction: the owner's rotation slot for this round lands on the owner (Cổ Vũ adds its rage mods at cast time). */
function fairyCast(ctx: StrikeCtx, f: Fighter, round: number): void {
  const kit = f.fairy;
  const cast = kit ? kit.casts.get(fairySkillForRound(kit.rotation, round)) : undefined;
  if (!cast) return;
  const def = cast.rage ? { ...cast.buff, mods: [...cast.buff.mods, ...rageMods(cast.rage, f.hp, f.hpMax)] } : cast.buff;
  const obj = land(f, f, def, round);
  if (obj) ctx.groups.push([idle(f, obj)]);
}

/** Go turnStartFairyActions: MP burn first, then the cast. Living actors only; no RNG. */
export function fairyTurnStart(ctx: StrikeCtx, f: Fighter, round: number): void {
  if (!f.alive) return;
  mpBurn(ctx, f, round);
  fairyCast(ctx, f, round);
}

/**
 * Go fairyHitProcActions: on the owner's first landed hit of a round, every proc whose fairy buff the owner holds rolls on the
 * target (buff_rate through the debuff accuracy / resist); landed ones show as idle buffAdd steps on the target.
 */
export function fairyProcSteps(ctx: StrikeCtx, a: Fighter, t: Fighter): BattleStep[] {
  const kit = a.fairy;
  const round = ctx.round ?? 0;
  if (!kit || kit.procs.size === 0 || !a.alive || !t.alive || a.side === t.side || kit.procRound === round) return [];
  kit.procRound = round;
  const out: BattleStep[] = [];
  for (const b of [...(a.buffs ?? [])]) {
    const p = kit.procs.get(b.id);
    if (!p || !t.alive || !rollLand(a, t, p.buff, p.rate, ctx.rng)) continue;
    const obj = land(a, t, p.buff, round);
    if (obj) out.push(idle(t, obj));
  }
  return out;
}
