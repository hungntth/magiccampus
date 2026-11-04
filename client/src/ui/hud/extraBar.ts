// Two small HUD buttons of the phase D systems that have no activity-strip icon: "Ủy thác" (offline exp, red dot while offline time is
// banked) and "Thú cưỡi" (mount window). Hidden during battles by CSS. Owned by ActivityController.

import { stageEl } from '../stage';
import '../dailySystems.css';

export interface ExtraBarHost {
  /** banked offline seconds */
  offlineSeconds(): number;
  onOffline(): void;
  onMount(): void;
}

export class ExtraBar {
  private readonly root = document.createElement('div');
  private readonly dot = document.createElement('span');

  constructor(private readonly host: ExtraBarHost, parent: HTMLElement = stageEl()) {
    this.root.className = 'ds-extra';
    for (const [label, cls, act] of [['Ủy thác', 'ds-btn-offline', () => host.onOffline()], ['Thú cưỡi', 'ds-btn-mount', () => host.onMount()]] as const) {
      const b = document.createElement('button');
      b.className = `act-btn ${cls}`;
      b.textContent = label;
      b.onclick = act;
      if (cls === 'ds-btn-offline') {
        this.dot.className = 'act-dot';
        b.appendChild(this.dot);
      }
      this.root.appendChild(b);
    }
    parent.appendChild(this.root);
    this.refresh();
  }

  /** Re-evaluates the offline dot (after a claim). */
  refresh(): void {
    this.dot.style.display = this.host.offlineSeconds() > 60 ? '' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
