// Attributes tab of the pet window (free-point allocation, changePetProperty) and the shared `el` helper; the skills and
// equipment tabs live in petSkillTab.ts / petEquipTab.ts.

import { PET_LEVEL_EXP, PetLimits, petExpOfLevel, petLevelOfExp, type ChangePetPropertyArg, type PetView } from '@mc/shared';

type AttrKey = 'Strength' | 'Agility' | 'Stamina' | 'Intelligence' | 'Energy';
const ATTRS: [AttrKey, string][] = [
  ['Strength', 'Lực'], ['Agility', 'Xảo'], ['Stamina', 'Nhẫn'], ['Intelligence', 'Trí'], ['Energy', 'Thần'],
];

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Points the player has staged with + / - for the selected pet, not sent until OK. */
export class PetAllocation {
  readonly pending: Record<AttrKey, number> = { Strength: 0, Agility: 0, Stamina: 0, Intelligence: 0, Energy: 0 };
  step10 = false;
  private id = -1;

  /** Switching to another pet drops the staged points. */
  bind(id: number): void {
    if (id !== this.id) {
      this.id = id;
      this.reset();
    }
  }

  reset(): void {
    for (const k of Object.keys(this.pending) as AttrKey[]) this.pending[k] = 0;
  }

  total(): number {
    return Object.values(this.pending).reduce((a, b) => a + b, 0);
  }
}

export interface StatsTabContext {
  onChange(): void;
  onSubmit(add: ChangePetPropertyArg): void;
}

const num = (v: number | undefined): string => String(Math.round(v ?? 0));

function row(label: string, value: string, cls = ''): HTMLElement {
  const r = el('div', `pet-row-stat ${cls}`.trim());
  r.append(el('span', 'pet-label', label), el('span', 'pet-value', value));
  return r;
}

export function renderStatsTab(body: HTMLElement, pet: PetView, alloc: PetAllocation, ctx: StatsTabContext): void {
  const prop = pet.property;
  const level = petLevelOfExp(pet.exp);
  const base = petExpOfLevel(level);
  const need = level >= PetLimits.maxLevel ? 0 : PET_LEVEL_EXP[level] - base;
  let free = pet.attLastPoint;
  if (alloc.total() > free) alloc.reset(); // points were spent elsewhere meanwhile
  free -= alloc.total();
  const left = el('div', 'pet-col');
  left.append(
    row('Exp', need > 0 ? `${pet.exp - base}/${need}` : '-'),
    row('Thọ mệnh', `${pet.life}/${PetLimits.maxLife}`),
    row('Hệ số', (pet.growRate + pet.growRateAdd).toFixed(2)),
    row('HP', `${pet.currentHp}/${num(prop.finalHp)}`),
    row('MP', `${pet.currentMp}/${num(prop.finalMp)}`),
    row('Công vật lý', num(prop.finalAttack)),
    row('Công ma pháp', num(prop.finalMAttack)),
    row('Thủ vật lý', num(prop.finalDefence)),
    row('Thủ ma pháp', num(prop.finalMDefence)),
    row('Chính xác', num(prop.finalHit)),
    row('Bạo kích', num(prop.finalCritical)),
    row('Né tránh', num(prop.finalDodge)),
    row('Tốc độ', num(prop.finalSpeed)),
  );
  const right = el('div', 'pet-col attrs');
  const apt: Record<AttrKey, number> = {
    Strength: pet.aptStrength, Agility: pet.aptAgility, Stamina: pet.aptStamina,
    Intelligence: pet.aptIntelligence, Energy: pet.aptEnergy,
  };
  for (const [key, label] of ATTRS) {
    const r = el('div', 'pet-row-stat');
    const add = alloc.pending[key];
    r.append(el('span', 'pet-label', label), el('span', 'pet-value', num(prop[`final${key}`])),
      el('span', 'pet-apt', `(${apt[key]})`), el('span', 'pet-add', add > 0 ? `+${add}` : ''));
    const minus = el('button', 'pet-pm', '-');
    minus.disabled = add === 0;
    minus.onclick = () => bump(alloc, ctx, key, -(alloc.step10 ? 10 : 1), free);
    const plus = el('button', 'pet-pm', '+');
    plus.disabled = free <= 0;
    plus.onclick = () => bump(alloc, ctx, key, alloc.step10 ? 10 : 1, free);
    r.append(minus, plus);
    right.appendChild(r);
  }
  right.appendChild(row('Điểm', String(free), 'pet-points'));
  const foot = el('div', 'pet-foot');
  const chk = document.createElement('label');
  chk.className = 'pet-step';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = alloc.step10;
  box.onchange = () => {
    alloc.step10 = box.checked;
  };
  chk.append(box, document.createTextNode(' x10'));
  const ok = el('button', 'pet-btn', 'OK');
  ok.disabled = alloc.total() === 0;
  ok.onclick = () => submit(alloc, ctx);
  foot.append(chk, ok);
  right.appendChild(foot);
  body.append(left, right);
}

function bump(alloc: PetAllocation, ctx: StatsTabContext, key: AttrKey, delta: number, left: number): void {
  const next = delta > 0 ? Math.min(delta, left) : -Math.min(-delta, alloc.pending[key]);
  alloc.pending[key] += next;
  ctx.onChange();
}

function submit(alloc: PetAllocation, ctx: StatsTabContext): void {
  if (alloc.total() === 0) return;
  const add = (k: AttrKey): string => (alloc.pending[k] > 0 ? String(alloc.pending[k]) : '');
  ctx.onSubmit({
    addStrength: add('Strength'), addAgility: add('Agility'), addStamina: add('Stamina'),
    addIntelligence: add('Intelligence'), addEnergy: add('Energy'),
  });
  alloc.reset();
  ctx.onChange();
}
