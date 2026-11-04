// Bottom-right menu buttons of SystemBarCanvas (sysBtnBar right0/bottom-8, 40x45 icons) and their keyboard
// shortcuts from the SYSTEMBARCANVAS_S tooltips. Character (C), bag (B), pets (W), friends (K) and guild (E) open panels, PK (A) arms the PK click mode; the rest toast "not ready".

import { div, notReady, skinButton, type SkinStates } from './skin';

const LIB = 'MainStage_SystemBarButtons';

function mc(name: string): SkinStates {
  return { up: `${LIB}/button_${name}_up_mc`, over: `${LIB}/button_${name}_over_mc`, down: `${LIB}/button_${name}_down_mc` };
}

interface MenuButton {
  x: number;
  y: number;
  skin: SkinStates;
  tip: string;
  key?: string;
}

const BUTTONS: MenuButton[] = [
  { x: -46, y: 0, skin: { up: 'MainStage_SystemBarButtons2/richang1', over: 'MainStage_SystemBarButtons2/richang2',
    down: 'MainStage_SystemBarButtons2/richang3' }, tip: 'Hoạt động hằng ngày' },
  { x: -1, y: 0, skin: mc('Achievement'), tip: 'Thành tựu (Phím tắt R)', key: 'r' },
  { x: 45, y: 0, skin: mc('Contest'), tip: 'PK (Phím tắt A)', key: 'a' },
  { x: 87, y: 0, skin: mc('person'), tip: 'Giao diện nhân vật (Phím tắt C)', key: 'c' },
  { x: 132, y: 0, skin: mc('bag'), tip: 'Giao diện túi đồ (Phím tắt B)', key: 'b' },
  { x: 176, y: 1, skin: mc('pet'), tip: 'Giao diện pet (Phím tắt W)', key: 'w' },
  { x: 223, y: 0, skin: mc('team'), tip: 'Giao diện nhóm (Phím tắt T)', key: 't' },
  { x: 269, y: 0, skin: mc('skills'), tip: 'Giao diện kỹ năng (Phím tắt S)', key: 's' },
  { x: 313, y: 0, skin: mc('friend'), tip: 'Giao lưu (Phím tắt K)', key: 'k' },
  { x: 375, y: 23, skin: mc('task'), tip: 'Giao diện nhiệm vụ (Phím tắt Q)', key: 'q' },
  { x: 400, y: 0, skin: mc('union'), tip: 'Giao diện bang hội (Phím tắt E)', key: 'e' },
];

export class SystemBar {
  private readonly onKey: (e: KeyboardEvent) => void;

  /** `typing()` tells whether a text field has focus, so letters go to it instead of the shortcuts. */
  constructor(parent: HTMLElement, private readonly typing: () => boolean, onBag: () => void, onCharacter: () => void,
    onFriend: () => void, onPet: () => void, onGuild: () => void, onPk: () => void) {
    const bar = div('hud-sysbar', parent);
    const actions = new Map<string, () => void>();
    for (const b of BUTTONS) {
      const act = b.key === 'b' ? onBag : b.key === 'c' ? onCharacter : b.key === 'k' ? onFriend : b.key === 'w' ? onPet : b.key === 'e' ? onGuild : b.key === 'a' ? onPk : notReady;
      skinButton(b.skin, bar, b.x, b.y, b.tip, act);
      if (b.key) actions.set(b.key, act);
    }
    this.onKey = (e) => {
      if (this.typing() || e.ctrlKey || e.altKey || e.metaKey) return;
      const act = actions.get(e.key.toLowerCase());
      if (act) {
        e.preventDefault();
        act();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
  }
}
